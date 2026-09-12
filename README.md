# Palimpsesto

[![Backend CI](https://github.com/MatheusZuchiBalbinot/palimpsesto/actions/workflows/backend.yml/badge.svg)](https://github.com/MatheusZuchiBalbinot/palimpsesto/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/MatheusZuchiBalbinot/palimpsesto/actions/workflows/frontend.yml/badge.svg)](https://github.com/MatheusZuchiBalbinot/palimpsesto/actions/workflows/frontend.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Editor de texto colaborativo em tempo real com criptografia de ponta a ponta.** Várias pessoas editam o mesmo documento simultaneamente, e o servidor é tecnicamente incapaz de ler uma linha do que escrevem.

---

## Índice

- [A restrição central](#a-restrição-central)
- [Como rodar](#como-rodar)
- [Stack](#stack)
- [Modelo de ameaça](#modelo-de-ameaça)
- [Arquitetura — backend](#arquitetura--backend)
- [Padrões e decisões — backend](#padrões-e-decisões--backend)
- [WebSocket e tempo real](#websocket-e-tempo-real)
- [Arquitetura — frontend](#arquitetura--frontend)
- [Criptografia](#criptografia)
- [CRDT e convergência](#crdt-e-convergência)
- [Segurança](#segurança)
- [Funcionalidades](#funcionalidades)
- [Endpoints REST](#endpoints-rest)
- [Testes](#testes)
- [DevOps](#devops)

---

## A restrição central

- **O servidor nunca pode ler o conteúdo de um documento.** Ele roteia bytes opacos, guarda chaves públicas, autentica usuários e resolve autorização — nada além disso.
- Critério de aceite do projeto inteiro: se o backend conseguir reconstruir um parágrafo, o projeto falhou.
- Quase toda a engenharia interessante aqui sai dos problemas que essa regra cria. As consequências de projeto:
  - **Não é um editor rich-text** — é uma `<textarea>` ligada a um `Y.Text` via `y-textarea`; formatação exigiria expor estrutura ao servidor.
  - **Sem gerenciador de estado global** (Redux/Zustand/Jotai) — stores no nível de módulo com pub/sub manual e `useSyncExternalStore`.
  - **Sem biblioteca de formulários** (React Hook Form/Formik) — `useState` manual.
  - **Sem design system pesado** — componentes próprios, Radix Tooltip e lucide-react.

## Como rodar

Tudo containerizado. Para um clone novo, o `entrypoint.sh` confere o Docker, prepara o `.env`, sobe o Postgres, espera ficar saudável (timeout de 60s), aplica as migrations e levanta servidor e frontend:

```bash
git clone https://github.com/MatheusZuchiBalbinot/palimpsesto.git
cd palimpsesto
./entrypoint.sh
```

O `Makefile` cobre o dia a dia:

```bash
make up             # sobe db + server + web
make test           # roda a suíte de testes
make migrate-up     # aplica migrations
make migrate-create # cria nova migration
make logs / ps      # observabilidade
make down / clean   # derruba / limpa
```

`PALIMPSESTO_SECURE_COOKIES` só é desabilitado no compose de dev (HTTP puro, sem TLS) — seguro por padrão em qualquer deploy real. Variáveis documentadas no `.env.example`.

## Stack

### Backend

| Componente | Escolha |
|---|---|
| Linguagem | Go 1.26 |
| Roteamento | `net/http` da stdlib — sem framework (gin/echo) |
| WebSocket | `coder/websocket` |
| Banco | PostgreSQL 16 via `jackc/pgx/v5` |
| Migrations | `goose` (rodado via `go run`, fora do `go.mod` para não puxar driver extra) |
| JWT | `golang-jwt/jwt/v5` |
| Hashing | Argon2id via `golang.org/x/crypto` |
| Rate limiting | `golang.org/x/time/rate` |

### Frontend

| Componente | Escolha |
|---|---|
| UI | React 19.2.8 + TypeScript ~6.0.2 |
| Build | Vite 8.2.2 |
| Rotas | React Router DOM 7.18.3 |
| CRDT | Yjs 13.6.32 + `y-protocols` (awareness) + `y-textarea` (binding) |
| Curvas | `@noble/curves` — X25519, Ed25519 |
| Cifras | `@noble/ciphers` — XChaCha20-Poly1305 |
| Hashes | `@noble/hashes` — Argon2id, HKDF-SHA256, SHA-256 |
| i18n | `i18next` + `react-i18next` (pt/en, pt padrão) |
| Componentes | `@radix-ui/react-tooltip` + lucide-react |
| Exportação | `fflate` — zip client-side |
| Lint | `oxlint` + ESLint 10 (`typescript-eslint`, `react-hooks`, `sonarjs`, `unicorn`) |

Argon2id roda em JS puro (`@noble/hashes`), não WASM, para evitar bundling extra — com exatamente os mesmos parâmetros no cliente e no servidor.

## Modelo de ameaça

O adversário assumido é o **próprio servidor**, comprometido ou malicioso. Ele enxerga metadados — quem participa de qual documento, quando, o tamanho dos updates — mas nunca conteúdo em claro, chaves de conteúdo (DEK) ou chaves privadas de identidade.

- **Não consegue reproduzir um update** em outro documento, outra época ou fingindo outro autor — a AAD do AEAD amarra `doc_id + key_epoch + author_id + seq`.
- **Não consegue forjar autoria** — toda atualização é assinada com Ed25519 sobre o ciphertext já cifrado, fechando a lacuna de "qualquer editor com a DEK forja edição de outro".
- **Não consegue entregar chave adulterada** sem detecção — TOFU grava a chave de assinatura no primeiro contato; mudança posterior gera aviso explícito que bloqueia ações sensíveis.
- **Não tem como recuperar sua senha** — não existe recuperação, por design: a senha é a raiz da hierarquia de chaves e nunca chega ao servidor em forma utilizável.

## Arquitetura — backend

DDD em camadas, com a seta de dependência sempre apontando para dentro:

```
interfaces/http     → router, handlers, middleware, DTOs de request/response
        ↓
application/        → casos de uso, um arquivo por comando ou query
  {user, document}    (commands/ e queries/ fisicamente separados — CQS)
        ↓
domain/             → entidades, value objects, regras, contratos de repositório
  {user, session, document, auth}
        ↑
infrastructure/     → implementação Postgres, hub de WebSocket
  {persistence, realtime}
```

- O **domínio nunca importa** `net/http` nem driver de banco.
- A **aplicação só depende de interfaces** de repositório, nunca de Postgres direto.
- **HTTP é a única camada** que conhece JSON/HTTP — nenhum handler decide status code sozinho; a tradução erro de domínio → status é centralizada em `interfaces/http/responses` (`UserError`, `DocumentError`).
- **Autorização centralizada** em `application/document/authz.RequireMembership` — todo comando e query passa por ali. Não-membro recebe `ErrNotFound`, nunca `ErrForbidden`: a existência do documento não é informação pública.
- **Config validada uma vez no boot** (`config.Load()`), que falha ruidosamente se faltar qualquer coisa.
- ~60 endpoints REST mapeados 1:1 para casos de uso, com repositórios segmentados por interface (`Repository`, `MembershipRepository`, `UpdateRepository`, `InviteRepository`, `InviteLinkRepository`, `CommentRepository`, `SnapshotRepository`, `FolderRepository`) e DTOs próprios em `application/document/dto` e `application/user/dto`.

## Padrões e decisões — backend

Cada padrão resolvendo um trade-off específico, não por ser padrão:

- **DDD tático** — entidades (`Document`, `Member`, `Session`), value objects (`Role`, `Email`, `LoginKey`, `DocumentID`) e sentinel errors por bounded context (`document.ErrNotFound` ≠ `user.ErrNotFound`).
- **Dependency Inversion** — a interface do repositório é declarada no `domain` (quem consome); a implementação Postgres vive em `infrastructure` (quem fornece).
- **Ports & Adapters** — `domain`/`application` são o núcleo isolado; `interfaces/http` e `infrastructure/persistence` são adaptadores plugáveis nas bordas. Trocar Postgres não toca em regra de negócio.
- **CQS** — `commands/` (muda estado) e `queries/` (nunca muda estado) fisicamente separados por diretório. Não é CQRS com stores separados; é a disciplina de nunca misturar leitura e escrita no mesmo caso de uso.
- **Repository + Interface Segregation** — um handler que só lê updates nunca precisa mockar o repositório de convites nos testes.
- **DTO pattern** — `dto.MemberView`, `dto.InviteView` isolam o domínio do que trafega por HTTP; mudar campo de exibição não obriga a mudar a entidade.
- **Sentinel errors + `errors.Is`/`errors.As`** — erro de domínio é valor exportado, nunca string comparada, funcionando através de `%w` em toda a cadeia.
- **Decorator via middleware chain** — `middleware.Chain(handler, RequestID, Logging, Recover)` empilha decorators de `http.Handler` com stdlib pura.
- **Decorator sobre `http.ResponseWriter`** — `statusWriter` embute e sobrescreve `WriteHeader` para capturar o status code (a stdlib não o expõe de volta) e reimplementa `http.Hijacker` por delegação, senão o upgrade de WebSocket quebraria silenciosamente ao passar pelo decorator.
- **Constructor injection sem framework de DI** — todo `New*Handler(dep1, dep2)` recebe dependências explícitas. Sem container, sem reflection, sem magic wiring.
- **Generics** — `getenv[T ~string]` e `requireEnv[T ~string]` compartilham implementação entre `Addr`, `DatabaseURL`, `JWTSecret` sem duplicar código nem perder tipagem.
- **Pessimistic locking** — rotação de chave e remoção de membro usam `SELECT ... FOR UPDATE` em transação. O custo de uma rotação errada (dois epochs conflitantes) é maior que o de bloquear brevemente.
- **Constraints como controle de concorrência** — `doc_members` com PK composta e `document_invites` com `UNIQUE` fazem o Postgres arbitrar corridas, em vez de um "SELECT depois INSERT" com janela de TOCTOU.
- **Idempotência deliberada** — aceitar o mesmo convite ou entrar pelo mesmo link duas vezes é no-op, porque um cliente HTTP reenvia request sem o usuário perceber (retry de rede, duplo clique).
- **Graceful shutdown com `context`** — `signal.NotifyContext(SIGINT, SIGTERM)` cancela o context raiz; o servidor tem até 10s para terminar requests em voo antes de fechar o pool. Cancelamento se propaga ponta a ponta, até a query no Postgres.
- **Prevenção de algorithm confusion** — `ParseWithClaims` valida explicitamente `*jwt.SigningMethodHMAC`, barrando o bypass clássico de `alg: none` ou RS256 com a chave pública como segredo HMAC.
- **Hash auto-descritivo (PHC-like)** — `m=65536,t=3,p=1,salt=...` guardado com cada hash; aumentar o custo no futuro não invalida hashes antigos.
- **`subtle.ConstantTimeCompare`** na verificação de senha, contra timing attack.
- **SameSite=Strict + HttpOnly** — o refresh token nunca é acessível via JS (mitiga XSS) nem vai em navegação cross-site (mitiga CSRF).

## WebSocket e tempo real

Protocolo binário próprio sobre WebSocket — não o `y-websocket` padrão — porque o servidor nunca decodifica conteúdo Yjs: só um framing opaco `[tipo][id][autor][tamanho][payload]`.

- **Hub-and-spoke / broadcast fan-out** — `Hub` é o roteador central, `Room` um grupo de assinantes (um por documento), `Client` uma conexão. Implementado do zero sobre `coder/websocket`.
- **Registry com mutex** — `roomRegistry`/`userRegistry` são `map[ID]*Room` protegidos por `sync.Mutex`, com `getOrCreate`/`get`/`dropIfEmpty`; sala só existe enquanto tem cliente, evitando vazamento.
- **Read pump / write pump** — uma goroutine dedicada por direção por conexão, desacoplando "receber da rede" de "mandar pra rede" sem que uma bloqueie a outra.
- **Backpressure com eviction, não bloqueio** — `enqueue` usa `select`/`default` num channel bufferizado (16 frames); consumidor lento nunca trava o broadcast da sala — ao encher o buffer, é desconectado.
- **Duas semânticas de entrega deliberadas** — `enqueue` (non-blocking, descarta se cheio, aceitável em estado estacionário) vs `enqueueBlocking` (espera por espaço, limitado por context, usado só no replay de histórico, onde perder um frame corromperia a visão do cliente).
- **Handshake autenticado antes do upgrade** — checagem de token + membership roda dentro do handler HTTP, antes de `websocket.Accept`, porque o browser não manda header `Authorization` no handshake.
- **Token fora da query string** — vai em `Sec-WebSocket-Protocol` para não vazar em log de proxy/CDN ou histórico do navegador.
- **Presença como estado efêmero** — quem está online, cursor e "digitando agora" vivem só na memória do processo; reiniciar o servidor não corrompe nada.
- **Testado com `-race`** — joins/leaves/broadcasts concorrentes sob o detector de data race, não só o happy path single-threaded.

## Arquitetura — frontend

```
pages/       → rotas
components/  → UI
hooks/       → lógica reutilizável
lib/         → funções puras
crypto/      → toda a criptografia client-side
realtime/    → WebSocket + Yjs
auth/        → sessão + fluxos de autenticação
```

- Stores no nível de módulo com pub/sub manual + `useSyncExternalStore` (sessão, tema, toasts, paleta de comandos, auto-lock).
- Rotas centralizadas em `src/routes.ts`; o helper `withRedirectParam` propaga `?redirect=` entre login/register para o fluxo de convite.
- Prettier com `semi: true` e ordenação de imports via `@ianvs/prettier-plugin-sort-imports`.

## Criptografia

### Hierarquia de chaves

```
senha
  └─ Argon2id (m=64 MiB, t=3, p=1) ─→ chave-mestra (MK)     ← nunca sai do browser
       ├─ HKDF-SHA256(info="…/login/v1") ─→ loginKey        → enviada ao servidor (re-hasheada com Argon2id)
       └─ HKDF-SHA256(info="…/wrap/v1")  ─→ wrapKey          ← nunca sai do browser
                                              └─ envelopa as chaves privadas de identidade (X25519 + Ed25519)
```

- O `loginKey` não é a senha em claro nem a MK — é um derivado que o servidor ainda re-hasheia com Argon2id antes de guardar.
- A troca de senha reverifica a senha atual, deriva novos MK/loginKey/wrapKey e **re-envelopa as mesmas chaves privadas** — nunca as regenera.
- Barra de progresso da derivação (~1s) no login e no registro, escalada em duas metades na troca de senha para parecer contínua.

### Identidade

Par gerado no browser: **X25519** (ECDH) + **Ed25519** (assinatura), 32 bytes cada. As privadas nunca saem cifradas por nada além do `wrapKey` do dono.

- **Fingerprint** = SHA-256(identity_pub ‖ signing_pub), formatado como 12 grupos de 5 dígitos decimais, pensado para ser lido em voz alta numa ligação. Formato replicado idêntico entre `crypto/identity.ts` e `domain/user/keys.go`.
- **Sigilo** = identicon 5×5 bilateralmente simétrico, determinístico a partir do mesmo hash.
- **TOFU** — na primeira vez que vê a chave de assinatura de alguém, confia e grava. Mudança posterior **nunca** é aceita em silêncio: gera aviso que bloqueia convidar, remover e resolver conflito até confirmação explícita.
- **Sem fallback silencioso** — falha de decrypt de identidade é erro real, exceto 404 (conta antiga sem chaves). `verifyPassword` (usado pela LockScreen) nunca usa cache local — sempre re-deriva e re-busca do servidor.

### Conteúdo do documento

Cada documento tem sua própria **DEK**, gerada no cliente; o servidor nunca a vê em claro. Conteúdo cifrado com **XChaCha20-Poly1305** (AEAD).

- **Framing** — updates CRDT: `seq(16) || nonce(24) || ciphertext`; título e snapshot: `nonce(24) || ciphertext`.
- **AAD** — de update amarra `doc_id + key_epoch + author_id + seq aleatório de 16 bytes`; de título/snapshot amarra `doc_id + key_epoch`.
- **Assinatura** — toda atualização assinada com Ed25519 sobre o ciphertext já cifrado, fechando a forja de autoria entre editores que compartilham a DEK.
- **Key ring** — `*WithAnyKey` tenta cada chave de épocas antigas até uma autenticar; decrypt errado nunca dá falso positivo, por garantia do AEAD.
- **Sealed box** para compartilhar a DEK: par X25519 efêmero + ECDH + HKDF + XChaCha20-Poly1305, no formato `ephemeral_pub(32) || nonce(24) || ciphertext`. O destinatário não precisa estar online. A DEK só é cacheada em memória, nunca em `localStorage`.

### Rotação de chave e revogação

Ao remover um membro, o cliente gera uma DEK nova, re-sela para cada remanescente e envia tudo numa chamada atômica (`RemoveMemberAndRotate`) que avança o `key_epoch`, em transação com `SELECT ... FOR UPDATE`.

- A DEK selada anterior de cada remanescente é arquivada em `doc_member_key_history` — o histórico anterior à rotação continua decifrável por quem sempre teve acesso.
- `newWraps` precisa cobrir exatamente o conjunto de remanescentes, senão `ErrIncompleteRotation`.
- O removido perde `GetWrappedDEK` imediatamente e sua conexão WS é fechada à força na hora (`Hub.EvictDocumentMember` fecha todas as abas daquele usuário) — não espera ele desconectar sozinho.
- Testado ponta a ponta: DEK inacessível, epoch avança, histórico preservado, convite pós-rotação já nasce na época nova.

## CRDT e convergência

- **Op-based** — cada aba aplica edições locais na hora e propaga operações. Não existe servidor autoritativo decidindo vencedor de conflito; a estrutura garante matematicamente convergência em qualquer ordem de chegada. O que trafega é a operação, não o documento inteiro — por isso updates são guardados como log incremental (`doc_updates`).
- **Identificação causal, não relógio de parede** — cada operação carrega `(clientID, clock)`, um relógio lógico na linha de Lamport, ordenando causalmente sem depender do relógio de cada máquina.
- **Comutatividade e idempotência** — aplicar a mesma operação duas vezes, ou em ordem diferente em réplicas diferentes, dá o mesmo resultado. É o que permite reenviar a fila offline sem duplicar efeito e persistir o log fora de ordem sem corromper o merge.
- **Compactação cega** — o servidor pode apagar updates cobertos por um snapshot sem entender uma linha do conteúdo, porque a convergência não depende dele.
- **Awareness é um CRDT à parte, efêmero** — presença/cursor (`y-protocols/awareness`) não usa o log persistente e nunca é gravado em disco.
- **Undo seletivo por origem** — `Y.UndoManager` com `trackedOrigins: [null]` rastreia só transações locais. Sem isso, um Ctrl+Z teria efeito colateral em edição alheia.

## Segurança

### Autenticação e sessão

- **Senha** — Argon2id (64 MiB, 3 iterações, salt de 16 bytes via `crypto/rand`), comparação em tempo constante, parâmetros versionados por linha.
- **Access token** — JWT HS256, TTL de 15 min, restrito a HMAC. O segredo é validado no boot: mínimo 32 bytes, e o processo recusa subir com segredo curto.
- **Refresh token** — 256 bits via `crypto/rand`, base64url, só o hash SHA-256 é persistido. **Detecção de reuso**: um token retirado de circulação e reapresentado revoga a família inteira (vítima incluída).
- **Sessão no frontend** vive só em memória, nunca `localStorage`; só o refresh token persiste, em cookie `httpOnly`. Refresh transparente (retry único, desconecta em cookie inválido, toast único mesmo com várias requisições falhando juntas).
- **Dispositivos** — lista sessões por rótulo de User-Agent, revoga individual ou todas-exceto-atual. (Revogar invalida o refresh token; o access token já emitido vale até expirar — janela de até 15 min, decisão de produto pendente.)

### Controle de acesso (IDOR)

Toda ação sobre documento/convite/dispositivo/chave verifica a posse do chamador sobre aquele recurso específico. Papel concedível (editor/leitor) é validado em todo caminho que atribui papel — `owner` nunca é aceito fora da criação. Falhas reais encontradas e corrigidas, documentadas por honestidade:

- **`AddMember`** permitia que qualquer membro (até leitor) concedesse `owner` a qualquer conta — takeover total do documento.
- **`CreateInviteLink`** permitia link com `role=owner`.
- **`SetMemberWrappedDEK`** permitia qualquer membro sobrescrever o DEK selado de outro já definido — hoje só permite overwrite se `Caller == TargetUser` ou se o wrap do alvo ainda está pendente.
- **`AddMember` via invite link** inseria membership mesmo em documento soft-deletado (SQL sem filtro `deleted_at IS NULL`).
- **`DeleteHandler`** agora revoga o invite link ativo ao apagar o documento.
- **`LoginKey`** não tinha tamanho mínimo; hoje `Validate()` exige no mínimo 8 bytes.

O papel `owner` é único e fixo desde a criação, sem transferência. O dono não pode remover a si mesmo, sair do próprio documento nem mudar o próprio papel — não há caminho conhecido para um documento ficar sem dono.

### Concorrência e integridade

- Rotação de chave, remoção de membro e aceite de convite rodam em transação com `SELECT ... FOR UPDATE`.
- `doc_members` com PK composta `(doc_id, user_id)` e `document_invites` com `UNIQUE (document_id, invitee_id)` impedem duplicação por race no nível de banco.
- Convite pendente é invalidado automaticamente se a chave rotacionar antes do aceite (`ErrInviteStale`).
- `ON DELETE RESTRICT` explícito em `doc_updates.author_id` e `document_comments.author_id`: conteúdo de outros membros nunca deve sumir ou perder autoria porque um autor foi removido.

### Rate limiting e DoS

- Rate limit por IP em login, registro, `GET /api/auth/salt`, refresh, logout e lookup de usuário por e-mail.
- Handshake WebSocket com limite próprio (120/min, burst 20) e teto de conexões simultâneas por conta (`maxConnectionsPerUser = 20`) — sem isso, credencial comprometida ou cliente bugado esgotaria memória/goroutines do hub.
- Buffer de envio por cliente WS limitado a 16 frames; mensagem binária limitada a 4 MiB, canal de notificação por usuário a 4 KiB.

### Geral

- **Sem SQL injection** — toda query parametrizada via `pgx`, nunca concatenação de string.
- **Sem vazamento** — erro não mapeado cai em `500` genérico, nunca stack trace/query/estrutura interna; o logger estruturado grava só método, path, status, duração e request-id, nunca senha/token/hash.
- **CSWSH** mitigado pelo default seguro do `coder/websocket` (sem `InsecureSkipVerify`).
- **Isolamento de salas** — hub/room sempre escopados por `DocID`, sem estado global entre documentos; documento soft-deletado bloqueia o handshake para todos, membros incluídos.

## Funcionalidades

### Documentos e conteúdo

- Criar em branco, a partir de modelo de agenda/datado, ou importando `.txt`/`.md` (até 1 MB).
- Renomear (título também cifrado), duplicar (novo dono, nova DEK, conteúdo reconstituído como update novo), soft-delete com aba "Arquivados" e restauração.
- Exportar um documento como `.txt` ou todo o cofre como `.zip` (`fflate`, nomes deduplicados) — documentos sem DEK disponível são pulados silenciosamente, best-effort.
- Busca no texto (Ctrl+F), case-insensitive, circular, com contador "match X de Y".

### Colaboração em tempo real

- Edição simultânea via CRDT, sem lock. Frame de update `type(1) || update_id(8) || author_id(16) || len(4) || payload`; frame de saída mais curto (o servidor atribui id/autor). Presença via mensagens de controle JSON, separadas dos frames binários.
- Reconexão com backoff exponencial (500 ms→10 s) e reconexão imediata ao voltar o foco da aba (`visibilitychange`, contra o throttle de `setInterval` em background). Ping a cada 25 s, timeout de leitura de 60 s no servidor.
- Fila de updates offline (`pendingBeforeOpen[]`) reenviada na reconexão, alimentando o indicador "sincronizando…".
- Fila de decrypt sequencial garante ordem de aplicação; update que falha a verificação de assinatura é descartado do CRDT sem derrubar a conexão.
- Undo/redo local, cursor com cor determinística por hash do `user_id`, estado "away" após 60 s, heurística de "digitando agora" com janela de 2 s reavaliada a cada 500 ms, flash visual de 400 ms ao chegar edição remota.
- Compactação automática a cada 200 updates (snapshot cifrado no cliente); o servidor só apaga o que o cliente já provou reconstruir.

### Compartilhamento e acesso

- Três papéis — dono (único, fixo), editor, leitor — reforçados no servidor em toda ação sensível, nunca só escondidos na UI.
- Convite por e-mail (pendente até aceitar, com preview do convidado) ou por link (só o dono cria/regenera/revoga; token de 256 bits; papel fixo, nunca dono; regenerar invalida o antigo na hora).
- Remover membro dispara rotação de chave. Troca de papel (editor↔leitor) direto do painel de Pessoas.
- Membro "pendente" (entrou por link, ninguém selou a DEK ainda) fica marcado até qualquer membro completar o selo (`reconcilePendingMember`).
- Conflito de chave aborta a ação e mostra overlay de confirmação.
- Notificação em tempo real de convites via canal WS por usuário (`invites_changed`), que só sinaliza "vá buscar de novo" sem carregar o dado.

### Organização

- Pastas pessoais (nunca compartilhadas), paleta de 6 cores, CRUD completo, mover documento para/de pasta.
- Pin local (`localStorage` namespaced por usuário, sem campo no backend).
- Abas Todos / Meus / Compartilhados / Arquivados / Convites, busca e ordenação (recente/nome/atividade), badge de convites pendentes, widget "online agora" deduplicado entre abas da mesma pessoa.

### Histórico e versionamento

- Updates agrupados em "sessões de edição" por autor (corte de 5 min de inatividade).
- `reconstructTextAt` recria o texto em qualquer ponto reaplicando updates decriptados num `Y.Doc` descartável; `computeGroupDeltas` calcula "+240 −12" por grupo em passada única incremental.
- Scrubber arrastável (mouse ou teclado), reprodução automática com múltiplas velocidades, destaque temporário do texto alterado, modal de confirmação antes de restaurar.
- Restaurar aplica o texto como update **novo** — nunca apaga o que veio depois (mesmo princípio do CRDT).

### Comentários

- Feed flat por documento (não ancorado a trecho). Criar/editar/resolver/excluir — editar é só de quem escreveu; resolver/excluir de outro é privilégio do dono.
- Painel lateral com abas Comentários/Pessoas, navegação por teclado, `aria-live="polite"`.

### Conta e UX

- Registro em 2 passos, com validação de mismatch inline e tela explícita de "sem recuperação de senha" com checkbox obrigatório.
- Auto-lock opcional por inatividade (é privacidade, não logout — sessão e WS seguem ativos; desbloqueio exige senha reverificada no servidor).
- Paleta de comandos (Ctrl/Cmd+K) com navegação global e ações contextuais, `role="combobox"`/`listbox`/`option`.
- Atalhos no editor (`.` painel, `/` ajuda, `F` buscar, `Shift+H` histórico, `Shift+S` compartilhar, Ctrl+Z/Shift+Z) com modal de ajuda.
- Tema claro/escuro/sistema aplicado via `data-theme` antes do React montar (sem flash), persistido.
- i18n pt/en com `<html lang>` sincronizado, tempo relativo localizado, toasts com "Desfazer" (8 s), banner de desconexão só após 5 s (evita piscar em blip).
- Acessibilidade: `role="tablist/tab/tabpanel"` com navegação por setas, skip link, foco preso em modais (`useDialogFocusTrap`), `role="alert"` em erro de formulário, rótulos ARIA na maioria dos controles.

## Endpoints REST

~60 endpoints, mapeados 1:1 para casos de uso.

<details>
<summary><strong>Auth &amp; usuários</strong></summary>

```
GET    /healthz
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/salt
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/change-password
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
</details>

<details>
<summary><strong>Documentos, chaves &amp; membros</strong></summary>

```
POST   /api/docs
GET    /api/docs
GET    /api/docs/active
GET    /api/docs/archived
GET    /api/docs/{id}
PATCH  /api/docs/{id}
DELETE /api/docs/{id}
POST   /api/docs/{id}/restore
GET    /api/docs/{id}/members
POST   /api/docs/{id}/members
GET    /api/docs/{id}/wrapped-dek
POST   /api/docs/{id}/members/{userId}/wrapped-dek
DELETE /api/docs/{id}/members/{userId}
PATCH  /api/docs/{id}/members/{userId}
GET    /api/docs/{id}/key-history
GET    /api/docs/{id}/updates
POST   /api/docs/{id}/snapshots
GET    /api/docs/{id}/snapshots/latest
PATCH  /api/docs/{id}/folder
```
</details>

<details>
<summary><strong>Convites, links, comentários &amp; pastas</strong></summary>

```
GET    /api/docs/{id}/invite-link
POST   /api/docs/{id}/invite-link
DELETE /api/docs/{id}/invite-link
POST   /api/invite-links/{token}/join
GET    /api/docs/{id}/comments
POST   /api/docs/{id}/comments
PATCH  /api/docs/{id}/comments/{commentId}
POST   /api/docs/{id}/comments/{commentId}/resolve
DELETE /api/docs/{id}/comments/{commentId}
POST   /api/folders
GET    /api/folders
PATCH  /api/folders/{id}
DELETE /api/folders/{id}
POST   /api/docs/{id}/invites
GET    /api/docs/{id}/invites
DELETE /api/docs/{id}/invites/{inviteId}
GET    /api/invites
POST   /api/invites/{id}/accept
DELETE /api/invites/{id}
```
</details>

<details>
<summary><strong>WebSocket</strong></summary>

```
GET    /api/ws        (WebSocket por documento)
GET    /api/ws/user   (WebSocket por usuário)
```
</details>

## Testes

**Backend** — 19 arquivos, 54+ funções `Test` de top-level. Integração real contra Postgres, **sem mock de repositório**: a garantia é sobre o comportamento real de query + constraint, não sobre um mock que reimplementa (errado) a lógica do banco. Cobre rotação de chave e efetividade de revogação, detecção de reuso de refresh token, IDOR em endpoints sensíveis, papéis concedíveis, isolamento de sala WS sob concorrência com `-race`, revogação de dispositivo, troca de senha, rejeição de JWT secret curto e de login key curta.

**Frontend** — 18 arquivos, cobertura mais densa na criptografia: round-trip, rejeição de replay cross-documento/cross-autor/cross-época, DEK errado, ciphertext adulterado, assinatura forjada, fallback por key ring em rotação. Argon2id determinístico e "lento de verdade" (parâmetros reais, não enfraquecidos), sealed box com destinatário errado, refresh transparente de token, guarda de rota que nunca redireciona antes do bootstrap assentar, e o fluxo de conflito de chave no ShareModal ponta a ponta. Sem teste de página inteira — cobertura seletiva focada em risco real, não em UI pura.

## DevOps

- Docker Compose com serviços `db`, `server`, `web`.
- Ambos os Dockerfiles multi-stage: `server` tem estágio `dev` (com `air` hot-reload), `build` e `prod` (alpine minimalista, usuário não-root); `web` tem `dev` (Vite hot-reload), `build` e `prod` (nginx com template de proxy).
- `entrypoint.sh` faz o bootstrap de um clone novo do zero; `Makefile` cobre o ciclo de vida.
- Variáveis centralizadas em `.env` (gitignored) / `.env.example`.
- Migrations versionadas e reversíveis (`+goose Up`/`+goose Down`), 15 arquivos.

## Licença

MIT. Veja [LICENSE](LICENSE).
