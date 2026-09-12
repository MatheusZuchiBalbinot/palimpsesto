# API

Referência pra `docs/API.md`, citada em vários pontos do backend e do frontend — o
contrato de erro, a lista de endpoints REST, e o protocolo de WebSocket (que não é o
`y-websocket` padrão).

---

## 1. Convenções gerais

- Toda resposta de erro segue o mesmo formato:
  ```json
  { "error": { "code": "not_found", "message": "documento não encontrado" } }
  ```
  `code` é o valor estável, pensado pra o cliente decidir o que fazer (traduzir, tratar um
  caso especial). `message` é só pra humano, pode mudar sem aviso — nunca compare contra
  ele.
- Autenticação: header `Authorization: Bearer <access_token>` em toda rota autenticada
  (todas, exceto `POST /api/auth/register`, `POST /api/auth/login`, `GET
  /api/auth/salt`, `GET /healthz`). Ver [`CRYPTO.md`](CRYPTO.md) seção 9 pro ciclo de vida
  do token.
- Um erro não mapeado (panic, falha inesperada) sempre vira `500` com
  `{"code":"internal_error"}` — nunca vaza stack trace, query ou detalhe interno.

### Códigos de erro (`code`)

```
email_taken             invalid_credentials      invalid_refresh_token
rate_limited             invalid_body             invalid_request
unauthenticated          internal_error           not_found
not_owner                not_member               not_comment_author
already_member           user_not_found           invite_link_not_found
comment_not_found        keys_not_found           invalid_public_keys
invalid_salt              private_keys_not_found   invalid_private_keys
pending_wrapped_dek       cannot_remove_owner      incomplete_rotation
not_editor                device_not_found         snapshot_not_found
invite_not_found          already_invited          invite_stale
```

Lista mantida como fonte única em `web/src/api/errorCodes.ts` (frontend) e
`server/internal/interfaces/http/responses/errors.go` (backend, que emite cada um).

---

## 2. Endpoints REST

### Auth

| Método | Rota                          | Autenticado |
| ------ | ----------------------------- | ----------- |
| POST   | `/api/auth/register`          | Não         |
| POST   | `/api/auth/login`              | Não         |
| GET    | `/api/auth/salt`                | Não         |
| POST   | `/api/auth/refresh`             | Cookie      |
| POST   | `/api/auth/logout`              | Sim         |
| POST   | `/api/auth/change-password`     | Sim         |

### Perfil, chaves, dispositivos

```
PATCH  /api/users/me
POST   /api/users/me/keys
GET    /api/users/me/keys
POST   /api/users/me/private-keys
GET    /api/users/me/private-keys
GET    /api/users/lookup
GET    /api/users/{id}/keys
GET    /api/users/me/devices
DELETE /api/users/me/devices/{familyId}
```

### Documentos

```
POST   /api/docs
GET    /api/docs
GET    /api/docs/active
GET    /api/docs/archived
GET    /api/docs/{id}
PATCH  /api/docs/{id}
DELETE /api/docs/{id}
POST   /api/docs/{id}/restore
```

### Membros e chaves de documento

```
GET    /api/docs/{id}/members
POST   /api/docs/{id}/members
GET    /api/docs/{id}/wrapped-dek
POST   /api/docs/{id}/members/{userId}/wrapped-dek
DELETE /api/docs/{id}/members/{userId}
PATCH  /api/docs/{id}/members/{userId}
GET    /api/docs/{id}/key-history
```

### Conteúdo (updates, snapshots)

```
GET    /api/docs/{id}/updates
POST   /api/docs/{id}/snapshots
GET    /api/docs/{id}/snapshots/latest
```

### Convites — link e por email

```
GET    /api/docs/{id}/invite-link
POST   /api/docs/{id}/invite-link
DELETE /api/docs/{id}/invite-link
POST   /api/invite-links/{token}/join

POST   /api/docs/{id}/invites
GET    /api/docs/{id}/invites
DELETE /api/docs/{id}/invites/{inviteId}
GET    /api/invites
POST   /api/invites/{id}/accept
DELETE /api/invites/{id}
```

### Comentários e pastas

```
GET    /api/docs/{id}/comments
POST   /api/docs/{id}/comments
PATCH  /api/docs/{id}/comments/{commentId}
POST   /api/docs/{id}/comments/{commentId}/resolve
DELETE /api/docs/{id}/comments/{commentId}

PATCH  /api/docs/{id}/folder
POST   /api/folders
GET    /api/folders
PATCH  /api/folders/{id}
DELETE /api/folders/{id}
```

### WebSocket

```
GET /api/ws       (por documento)
GET /api/ws/user  (por usuário — notificações de convite)
```

### Infra

```
GET /healthz
```

`GET /api/docs/active` merece nota: não abre WebSocket nenhum, é uma chamada HTTP simples
que pergunta ao hub em memória quem está em cada sala — o jeito barato de mostrar "quem
está online agora" na lista de documentos sem manter uma conexão por linha da lista.

---

## 3. WebSocket — `/api/ws`

**Não é o `y-websocket` padrão.** O servidor nunca decodifica o conteúdo Yjs — só um
framing binário opaco, decisão direta da regra "servidor nunca lê conteúdo" (ver
[`ARCHITECTURE.md`](ARCHITECTURE.md) seção 2).

### Handshake

O upgrade só acontece **depois** de autenticar e checar membership — nunca o contrário
("server validates membership before upgrade; no permission, 403 and no connection"). O
token vai em `Sec-WebSocket-Protocol` (prefixo `access_token.`), nunca na query string —
evita vazar em log de proxy/CDN ou no histórico do navegador, onde uma query string
ficaria. Um documento soft-deletado recusa o handshake pra todo mundo, membros incluídos.

### Frames binários — o canal de conteúdo

Do servidor pro cliente:

```
type(1) || update_id(8) || author_id(16) || len(4) || payload
```

Do cliente pro servidor (mais curto — o servidor atribui `update_id`/`author_id`):

```
type(1) || len(4) || payload
```

`author_id` viaja como os 16 bytes brutos do UUID (não a forma com hífen) —
`ParseUUID`/`bytesToUuidString` convertem pra o formato canônico
`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` usado em todo outro lugar (claims do JWT, DTOs).
`payload` é o ciphertext opaco — ver [`CRYPTO.md`](CRYPTO.md) seção 5 pro formato de fio
por dentro dele.

### Frames de texto — mensagens de controle

JSON, discriminado por `t`:

| `t`                | Direção          | Quando                                                          |
| ------------------- | ----------------- | ----------------------------------------------------------------- |
| `joined`             | servidor→cliente | Uma vez, logo após conectar — snapshot de quem já está na sala.    |
| `member_joined`      | servidor→cliente | Alguém novo entrou.                                                |
| `member_left`        | servidor→cliente | Alguém saiu.                                                       |
| `presence`           | ambos             | Awareness do Yjs (cursor, "away"), base64 opaco, só relay.        |
| `ping`               | cliente→servidor | A cada 25s, mantém a conexão viva.                                 |
| `error`              | servidor→cliente | `code: "update_rejected"` — um frame do cliente falhou ao persistir/propagar. |
| `invites_changed`    | servidor→cliente | Canal por usuário (`/api/ws/user`) — nudge pra refazer `GET /api/invites`, nunca carrega o convite em si. |

Timeout de leitura do servidor: 60s (clientes devem mandar `ping` a cada 25s — margem de
sobra pra backgrounding de aba no navegador). Reconexão do cliente usa backoff exponencial
(500ms até 10s) e reconecta na hora ao voltar o foco da aba, já que `setInterval` é
throttled em background por navegadores.
