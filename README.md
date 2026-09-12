# Palimpsesto

<!-- TODO: troque SEU_USUARIO/palimpsesto pelo caminho real do repo assim que for publicado no GitHub -->

[![Backend CI](https://github.com/SEU_USUARIO/palimpsesto/actions/workflows/backend.yml/badge.svg)](https://github.com/SEU_USUARIO/palimpsesto/actions/workflows/backend.yml)
[![Frontend CI](https://github.com/SEU_USUARIO/palimpsesto/actions/workflows/frontend.yml/badge.svg)](https://github.com/SEU_USUARIO/palimpsesto/actions/workflows/frontend.yml)
[![License](https://img.shields.io/badge/license-TBD-lightgrey)](LICENSE)

<!-- TODO: um screenshot ou GIF curto do editor/vault aqui ajuda muito mais que texto — não dá pra gerar isso sem abrir o app num navegador real. -->

Lista bruta de pontos sobre o software — pra revisar e organizar depois.

## Conceito / pitch

- Editor de texto colaborativo em tempo real com criptografia de ponta a ponta (E2EE).
- Nome vem de "palimpsesto": manuscrito raspado e reescrito várias vezes, camadas antigas continuam por baixo.
- Metáfora literal do CRDT: documento é a soma de todas as operações sobrepostas, nenhuma jamais destruída.
- Regra que define o projeto: o servidor nunca pode ler o conteúdo de um documento.
- Servidor só roteia bytes opacos, guarda chaves públicas, autentica usuários, resolve autorização.
- Critério de aceite do projeto inteiro: se o backend conseguir reconstruir um parágrafo, o projeto falhou.
- Não é um editor rich-text — é uma `<textarea>` simples ligada a um `Y.Text` via `y-textarea`.
- Sem gerenciador de estado global (Redux/Zustand/Jotai/Context pesado).
- Sem biblioteca de formulários (React Hook Form/Formik) — tudo `useState` manual.
- Sem lib de design system pesada — componentes próprios + Radix Tooltip + lucide-react.

## Stack — backend

- Go 1.26.
- `net/http` da stdlib pra roteamento (sem framework tipo gin/echo).
- `coder/websocket` pra WebSocket.
- `golang-jwt/jwt/v5` pra JWT.
- PostgreSQL 16 via `jackc/pgx/v5`.
- Migrations com `goose`.
- `golang.org/x/time/rate` pra rate limiting.
- `golang.org/x/crypto` pra Argon2id.
- Migrations rodadas via `go run` do goose (não é dependência do módulo, evita puxar driver de banco extra pro go.mod).
- Testes de integração reais contra Postgres, não mocka repositório.
- 19 arquivos de teste, 54+ funções `Test` de top-level.

## Stack — frontend

- React 19.2.8 + React DOM 19.2.8.
- TypeScript ~6.0.2.
- Vite 8.2.2.
- React Router DOM 7.18.3.
- Yjs 13.6.32 (CRDT).
- `y-protocols` 1.0.7 (awareness/presença).
- `y-textarea` 1.0.2 (binding textarea ↔ Yjs, overlay de cursores remotos).
- `@noble/curves` ^2.4.0 (X25519, Ed25519).
- `@noble/ciphers` ^2.4.0 (XChaCha20-Poly1305).
- `@noble/hashes` ^2.4.0 (Argon2id, HKDF-SHA256, SHA-256).
- `i18next` ^26.4.2 + `react-i18next` ^17.0.13.
- `@radix-ui/react-tooltip` ^1.2.16 — única lib de componente headless usada.
- `lucide-react` ^1.41.0 — ícones.
- `fflate` ^0.8.3 — zip client-side pra exportação em massa.
- Vitest 5 + Testing Library (React 16.3.3, jest-dom 7, user-event 14.6.7) + jsdom 30.
- Lint duplo: `oxlint` (rápido, script padrão) + ESLint 10 (`typescript-eslint`, `react-hooks`, `sonarjs`, `unicorn`).
- Prettier 3.9.6 + `@ianvs/prettier-plugin-sort-imports`.
- Prettier configurado com `semi: true` (ponto e vírgula no fim de tudo).
- 18 arquivos de teste no frontend.

## Arquitetura — backend (DDD em camadas)

- `interfaces/http` → router, handlers, middleware, DTOs de request/response.
- `application/{user,document}` → comandos e queries, um arquivo por caso de uso.
- `domain/{user,session,document,auth}` → entidades, regras de negócio, contratos de repositório.
- `infrastructure/{persistence,realtime}` → implementação Postgres, hub de WebSocket.
- Domínio nunca importa `net/http` nem driver de banco.
- Aplicação só depende de interfaces de repositório, nunca de Postgres direto.
- HTTP é a única camada que conhece JSON/HTTP.
- Autorização centralizada em `application/document/authz.RequireMembership` — todo comando/query passa por ali.
- Não-membro recebe `ErrNotFound`, não `ErrForbidden` — existência do documento não é informação pública.
- Tradução de erro de domínio → status HTTP centralizada em `interfaces/http/responses` (`UserError`, `DocumentError`).
- Nenhum handler decide status code por conta própria.
- ~60 endpoints REST, mapeados 1:1 pra casos de uso.
- Repositórios segmentados por interface: `Repository`, `MembershipRepository`, `UpdateRepository`, `InviteRepository`, `InviteLinkRepository`, `CommentRepository`, `SnapshotRepository`, `FolderRepository`.
- DTOs próprios em `application/document/dto` e `application/user/dto`, separando modelo de domínio do que trafega por HTTP.
- Config carregada e validada uma vez no boot (`config.Load()`), falha loudly se faltar algo.

## Conceitos técnicos — backend (padrões nomeados)

- **Domain-Driven Design (DDD) tático**: entidades (`Document`, `Member`, `Session`), value objects (`Role`, `Email`, `LoginKey`, `DocumentID`), sentinel errors por bounded context (`document.ErrNotFound` ≠ `user.ErrNotFound`).
- **Dependency Inversion Principle**: a interface do repositório é declarada no `domain` (quem consome), a implementação Postgres vive em `infrastructure` (quem fornece) — a seta de dependência aponta pra dentro, nunca pra fora.
- **Ports & Adapters (arquitetura hexagonal) na prática**: `domain`/`application` são o núcleo isolado (as "portas"); `interfaces/http` e `infrastructure/persistence` são os "adaptadores" plugáveis nas bordas — dá pra trocar Postgres por outro banco sem tocar em regra de negócio.
- **CQS (Command-Query Separation)**: pacotes `commands/` (escrita, muda estado, geralmente retorna erro ou id) e `queries/` (leitura, nunca muda estado) são fisicamente separados por diretório em `application/document` e `application/user` — não é CQRS com stores separados, é a disciplina de nunca misturar leitura com escrita no mesmo caso de uso.
- **Repository pattern**: toda persistência passa por uma interface (`MembershipRepository`, `UpdateRepository`...) segmentada por responsabilidade — Interface Segregation Principle aplicado (um handler que só lê updates nunca precisa mockar o repositório de convites nos testes).
- **DTO (Data Transfer Object) pattern**: `dto.MemberView`, `dto.InviteView` etc. isolam o modelo de domínio do formato que trafega por HTTP — mudar um campo de exibição não obriga a mudar a entidade de domínio.
- **Sentinel errors + `errors.Is`/`errors.As`**: cada erro de domínio é um valor exportado (`var ErrNotFound = errors.New(...)`), nunca uma string comparada por igualdade — permite `errors.Is` funcionar através de `%w` (wrapping) em toda a cadeia de chamadas.
- **Decorator pattern via middleware chain**: `middleware.Chain(handler, RequestID, Logging, Recover)` empilha decorators de `http.Handler` em ordem, cada um envolvendo o próximo — o mesmo padrão dos middlewares de Express/Gin, só que com stdlib pura.
- **Decorator sobre `http.ResponseWriter`**: `statusWriter` embute e sobrescreve `WriteHeader` pra capturar o status code depois que o handler já escreveu (a stdlib não expõe isso de volta) — e reimplementa `http.Hijacker` por delegação, senão o upgrade de WebSocket quebraria silenciosamente ao passar por esse decorator.
- **Constructor injection sem framework de DI**: todo `New*Handler(dep1, dep2)` recebe suas dependências explícitas no construtor — sem container de injeção de dependência, sem reflection, sem magic wiring.
- **Generics do Go (1.18+)**: `getenv[T ~string](key string, fallback T) T` e `requireEnv[T ~string]` usam type constraints pra compartilhar a mesma implementação entre `Addr`, `DatabaseURL`, `JWTSecret` sem duplicar código nem perder tipagem.
- **Pessimistic locking (row-level lock)**: rotação de chave e remoção de membro usam `SELECT ... FOR UPDATE` dentro de transação — trava a linha no banco em vez de confiar em retry otimista, porque o custo de uma rotação de chave errada (dois epochs conflitantes) é maior que o custo de bloquear brevemente.
- **Restrições de unicidade como controle de concorrência**: `doc_members` com PK composta e `document_invites` com `UNIQUE` fazem o Postgres arbitrar corridas (dois `join` simultâneos) em vez de uma checagem "SELECT depois INSERT" na aplicação, que teria uma janela de corrida (TOCTOU).
- **Idempotência deliberada**: aceitar o mesmo convite duas vezes, ou entrar pelo mesmo link duas vezes, é tratado como no-op (mesmo efeito, sem erro) — importante porque cliente HTTP pode reenviar uma request sem o usuário perceber (retry de rede, duplo clique).
- **Graceful shutdown com `context`**: `signal.NotifyContext(SIGINT, SIGTERM)` cancela um `context.Context` raiz; o servidor HTTP recebe até `ShutdownTimeout` (10s) pra terminar requests em voo antes de fechar o pool de conexões — nenhuma requisição é cortada no meio abruptamente num deploy normal.
- **Propagação de `context.Context`** ponta a ponta: toda chamada de domínio/aplicação/repositório recebe `ctx` e o repassa — cancelamento (timeout, cliente desconectou) se propaga até a query no Postgres.
- **Token bucket rate limiting**: `golang.org/x/time/rate` implementa o algoritmo de "balde de fichas" (não "janela fixa" nem "janela deslizante") — permite um burst curto acima da taxa média sem rejeitar tráfego legítimo levemente irregular.
- **Prevenção de confusão de algoritmo (algorithm confusion attack)**: `ParseWithClaims` valida explicitamente `t.Method.(*jwt.SigningMethodHMAC)` antes de aceitar qualquer token — sem essa checagem, um JWT com `alg: none` ou trocado pra RS256 usando a chave pública como segredo HMAC seria um bypass clássico de autenticação.
- **Formato de hash auto-descritivo (PHC-like)**: `m=65536,t=3,p=1,salt=...` guardado junto com cada hash de senha — os parâmetros de custo do Argon2id viajam com o hash, então aumentar o custo no futuro não invalida hashes antigos (compatível com o conceito por trás do PHC string format usado por bcrypt/argon2/scrypt).
- **Comparação em tempo constante**: `subtle.ConstantTimeCompare` na verificação de senha — evita um timing attack que mediria quantos bytes bateram antes de divergir.
- **SameSite=Strict + HttpOnly em cookie**: o refresh token nunca é acessível via JavaScript (mitiga XSS) e nunca é enviado em navegação cross-site (mitiga CSRF) — duas defesas diferentes num único atributo de cookie.
- **Testes de integração sem test doubles de banco**: em vez de mockar a interface de repositório, a suíte sobe contra um Postgres real (`PALIMPSESTO_DATABASE_URL`) — a garantia é sobre o comportamento real da query + constraint do banco, não sobre um mock que reimplementa (errado) a lógica do banco.

## Arquitetura — frontend

- `pages/` → rotas.
- `components/` → UI.
- `hooks/` → lógica reutilizável.
- `lib/` → funções puras.
- `crypto/` → toda a criptografia client-side.
- `realtime/` → WebSocket + Yjs.
- `auth/` → sessão + fluxos de autenticação.
- Stores no nível de módulo com pub/sub manual + `useSyncExternalStore` (sessão, tema, toasts, paleta de comandos, auto-lock).
- Rotas centralizadas em `src/routes.ts`.
- Helper `withRedirectParam` propaga `?redirect=` entre login/register (fluxo de convite).

## Endpoints REST (mapa completo)

- `GET /healthz`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/salt`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/change-password`
- `PATCH /api/users/me`
- `POST /api/users/me/keys`
- `GET /api/users/me/keys`
- `POST /api/users/me/private-keys`
- `GET /api/users/me/private-keys`
- `GET /api/users/lookup`
- `GET /api/users/{id}/keys`
- `GET /api/users/me/devices`
- `DELETE /api/users/me/devices/{familyId}`
- `POST /api/docs`
- `GET /api/docs`
- `GET /api/docs/active`
- `GET /api/docs/archived`
- `GET /api/docs/{id}`
- `PATCH /api/docs/{id}`
- `DELETE /api/docs/{id}`
- `POST /api/docs/{id}/restore`
- `GET /api/docs/{id}/members`
- `POST /api/docs/{id}/members`
- `GET /api/docs/{id}/wrapped-dek`
- `POST /api/docs/{id}/members/{userId}/wrapped-dek`
- `DELETE /api/docs/{id}/members/{userId}`
- `PATCH /api/docs/{id}/members/{userId}`
- `GET /api/docs/{id}/key-history`
- `GET /api/docs/{id}/updates`
- `POST /api/docs/{id}/snapshots`
- `GET /api/docs/{id}/snapshots/latest`
- `GET /api/docs/{id}/invite-link`
- `POST /api/docs/{id}/invite-link`
- `DELETE /api/docs/{id}/invite-link`
- `POST /api/invite-links/{token}/join`
- `GET /api/docs/{id}/comments`
- `POST /api/docs/{id}/comments`
- `PATCH /api/docs/{id}/comments/{commentId}`
- `POST /api/docs/{id}/comments/{commentId}/resolve`
- `DELETE /api/docs/{id}/comments/{commentId}`
- `PATCH /api/docs/{id}/folder`
- `POST /api/folders`
- `GET /api/folders`
- `PATCH /api/folders/{id}`
- `DELETE /api/folders/{id}`
- `POST /api/docs/{id}/invites`
- `GET /api/docs/{id}/invites`
- `DELETE /api/docs/{id}/invites/{inviteId}`
- `GET /api/invites`
- `POST /api/invites/{id}/accept`
- `DELETE /api/invites/{id}`
- `GET /api/ws` (WebSocket por documento)
- `GET /api/ws/user` (WebSocket por usuário)

## Criptografia — hierarquia de chaves

- `senha` → Argon2id (m=64 MiB, t=3, p=1) → chave-mestra (MK), nunca sai do browser.
- `MK` → HKDF-SHA256(info="palimpsesto/login/v1") → `loginKey`, enviado ao servidor.
- `MK` → HKDF-SHA256(info="palimpsesto/wrap/v1") → `wrapKey`, envelopa as chaves de identidade.
- `loginKey` não é a senha em claro nem a MK — servidor re-hasheia com Argon2id antes de guardar.
- `wrapKey` nunca sai do browser.
- Argon2id roda em JS puro (`@noble/hashes`), não WASM — evita bundling extra.
- Mesmos parâmetros de Argon2id no client e no servidor.
- Barra de progresso de derivação (~1s) no login e registro.
- Troca de senha: reverifica senha atual, deriva novo MK/loginKey/wrapKey, reenvelopa as MESMAS chaves privadas (nunca regenera).
- Progresso de derivação na troca de senha escalado em duas metades (0-50%/50-100%) pra parecer contínuo.

## Criptografia — identidade

- Par de chaves de identidade gerado no browser: X25519 (ECDH, 32 bytes) + Ed25519 (assinatura, 32 bytes).
- Chaves privadas de identidade nunca saem cifradas por outra coisa que não o `wrapKey` do dono.
- Fingerprint = SHA-256(identity_pub ‖ signing_pub), formatado como 12 grupos de 5 dígitos decimais (60 dígitos).
- Formato de fingerprint pensado pra ser lido em voz alta numa ligação.
- Sigilo: identicon 5x5 simetricamente bilateral, determinístico a partir do mesmo hash.
- TOFU (trust-on-first-use): primeira vez que vê a chave de assinatura de alguém, confia e grava em `localStorage`.
- Mudança de chave de assinatura NUNCA aceita silenciosamente — sempre gera aviso explícito.
- Aviso de mudança de chave bloqueia convidar, remover, resolver conflito até confirmação explícita.
- Fingerprint replicado entre frontend (`crypto/identity.ts`) e backend (`domain/user/keys.go`) — mesmo formato.
- Fluxo de identidade no registro: gera chaves novas, publica pública em claro + privada envelopada.
- Fluxo de identidade no login: recupera de `localStorage` (`identityStore.ts`) ou busca+desenvelopa do servidor.
- Falha de decrypt de identidade é erro real (nunca fallback silencioso) — exceto 404 (conta antiga sem chaves, gera novas).
- `verifyPassword` (usado pela LockScreen) nunca usa cache local — sempre re-deriva e re-busca do servidor.

## Criptografia — conteúdo do documento

- Cada documento tem sua própria DEK (chave de conteúdo), gerada no cliente.
- Servidor nunca vê a DEK em claro em nenhum momento.
- Conteúdo cifrado com XChaCha20-Poly1305 (AEAD).
- Atualizações CRDT: `seq(16) || nonce(24) || ciphertext`.
- Título e snapshot: `nonce(24) || ciphertext`.
- AAD de atualização amarra: `doc_id + key_epoch + author_id + seq aleatório de 16 bytes`.
- AAD de título/snapshot amarra: `doc_id + key_epoch`.
- AAD impede servidor malicioso de reproduzir update noutro documento, outra época, ou fingir outro autor.
- Toda atualização assinada com Ed25519 sobre o ciphertext já cifrado.
- Assinatura fecha a lacuna "qualquer editor com DEK forja autoria de outro editor".
- `*WithAnyKey` (client) tenta cada chave de um key ring (épocas antigas) até uma autenticar — decrypt errado nunca dá falso positivo (garantia do AEAD).
- Sealed box pra compartilhar DEK: par X25519 efêmero descartável + ECDH + HKDF(info="palimpsesto/dek-wrap/v1") + XChaCha20-Poly1305.
- Formato do sealed box: `ephemeral_pub(32) || nonce(24) || ciphertext`.
- Destinatário não precisa estar online no momento do convite (sealed box independe disso).
- DEK do documento cacheada só em memória no client, nunca em `localStorage`.
- `fetchKeyRing` monta lista completa de DEKs (época atual + histórico) que o usuário tem legitimidade de acessar.

## Criptografia — rotação de chave / revogação

- Ao remover membro, cliente gera DEK nova pro documento.
- Resela a DEK nova pra cada membro remanescente (um sealed box por pessoa).
- Envia tudo numa chamada atômica (`RemoveMemberAndRotate`) que avança `key_epoch`.
- Backend usa transação com `SELECT ... FOR UPDATE` no documento e nos membros.
- Servidor arquiva a DEK selada anterior de cada membro remanescente em `doc_member_key_history`.
- Histórico anterior à rotação continua decifrável por quem sempre teve acesso.
- `newWraps` precisa cobrir exatamente o conjunto de membros remanescentes, senão `ErrIncompleteRotation`.
- Membro removido perde `GetWrappedDEK` (`ErrNotFound`) imediatamente após a rotação.
- Conexão WebSocket do removido é fechada à força na hora (`Hub.EvictDocumentMember`), não espera ele desconectar sozinho.
- `Room.evictUser` fecha todas as abas/conexões daquele usuário naquela sala.
- Testado ponta a ponta: DEK inacessível, epoch avança, histórico preservado, convite pós-rotação já nasce na epoch nova.

## Segurança — autenticação e sessão

- Hashing de senha: Argon2id, 64 MiB, 3 iterações, salt aleatório de 16 bytes via `crypto/rand`.
- Comparação de hash em tempo constante (`subtle.ConstantTimeCompare`).
- Parâmetros de Argon2id versionados por linha (mudar custo não invalida hashes antigos).
- Access token: JWT HS256, TTL de 15 minutos.
- JWT restrito a `HMAC` — sem confusão de algoritmo (`alg=none` etc).
- Segredo do JWT validado no boot: mínimo 32 bytes, processo recusa subir com segredo curto.
- Refresh token: 256 bits via `crypto/rand`, base64url, só o hash SHA-256 persistido.
- Refresh token com detecção de reuso: token retirado de circulação reapresentado → revoga a família inteira (vítima incluída).
- Login key sem tamanho mínimo era falha — corrigido: `LoginKey.Validate()`, mínimo 8 bytes.
- Troca de senha reverifica senha atual antes de aceitar a nova.
- Dispositivos: lista sessões por rótulo de User-Agent, revoga individual ou todas-exceto-atual.
- Revogar dispositivo só invalida o refresh token — access token já emitido continua válido até expirar (janela de até 15 min, decisão de produto pendente, não corrigida).
- Sessão do frontend vive só em memória, nunca `localStorage` — só o refresh token persiste, em cookie `httpOnly`.
- `bootstrapSession` restaura sessão via cookie httpOnly no carregamento da página.
- Refresh transparente de token no client: retry único, desconecta em cookie inválido, toast único mesmo com várias requisições falhando junto.
- `SecureCookies` configurável — true por padrão, só desabilitado no dev compose (HTTP puro sem TLS).

## Segurança — rate limiting e DoS

- Rate limit por IP em: login, registro, `GET /api/auth/salt`.
- Rate limit por IP adicionado em: refresh, logout, lookup de usuário por e-mail.
- Rate limit por IP no handshake WebSocket (`/api/ws`, `/api/ws/user`) — 120/min, burst 20 (mais permissivo que auth).
- Limite de conexões WebSocket simultâneas por conta (`maxConnectionsPerUser = 20`), documento + canal de notificação juntos.
- Sem esse limite, credencial comprometida ou cliente com bug podia esgotar memória/goroutines do hub.
- Buffer de envio por cliente WS limitado a 16 frames, cliente lento é evictado em vez de travar a sala.
- Mensagem WS binária limitada a 4 MiB; canal de notificação por usuário limitado a 4 KiB.

## Segurança — controle de acesso (IDOR)

- Toda ação sobre documento/convite/dispositivo/chave verifica posse do chamador sobre aquele recurso específico.
- Papel concedível (editor/leitor) validado em todo caminho que atribui papel — nunca aceita `owner` fora da criação.
- Falha crítica corrigida: `AddMember` permitia qualquer membro (até leitor) conceder `owner` a qualquer conta — takeover total do documento.
- Falha irmã corrigida: `CreateInviteLink` permitia link com `role=owner`.
- Falha irmã corrigida: `SetMemberWrappedDEK` permitia qualquer membro sobrescrever o DEK selado de outro membro já definido.
- Correção do DEK: só permite overwrite se `Caller == TargetUser` ou se o wrap do alvo ainda está pendente.
- IDOR checado e confirmado correto em: chaves privadas envelopadas próprias, revogação de dispositivo, lookup de chave pública (intencionalmente pública).
- `GetPublicKeysByID` é público por design — chave pública de identidade não é segredo.
- Falha corrigida: `AddMember` via invite link inseria membership mesmo em documento soft-deletado (SQL sem filtro `deleted_at IS NULL`).
- Correção: `DeleteHandler` agora revoga o invite link ativo ao apagar o documento.
- Papel `owner` é único e fixo desde a criação — sem transferência de propriedade.
- Dono não pode remover a si mesmo (`ErrCannotRemoveOwner`), não pode sair do próprio documento, não pode mudar o próprio papel.
- Sem caminho conhecido pra documento ficar sem dono.

## Segurança — lógica de negócio e concorrência

- Rotação de chave, remoção de membro, aceite de convite rodam em transação com `SELECT ... FOR UPDATE`.
- `doc_members` com PK composta `(doc_id, user_id)` — impede membership duplicada por race condition no nível de banco.
- `document_invites` com `UNIQUE (document_id, invitee_id)` — impede convite duplicado por race.
- Convite pendente invalidado automaticamente se a chave do documento rotacionar antes do aceite (`ErrInviteStale`).
- Join concorrente pelo mesmo invite link tratado via violação de unicidade, sem duplicar membership.
- `ON DELETE` explícito adicionado em `doc_updates.author_id` e `document_comments.author_id` (`RESTRICT`, migration 00015) — antes era `NO ACTION` implícito e não documentado.
- Escolha de `RESTRICT` (não `CASCADE`/`SET NULL`): conteúdo de outros membros nunca deve sumir ou perder autoria por conta do autor sumir depois.
- Sem feature de exclusão de conta no código hoje — mudança de `ON DELETE` é preventiva, sem efeito comportamental imediato.

## Segurança — geral

- Sem SQL injection: toda query parametrizada via `pgx`, nunca concatenação de string.
- Erro não mapeado cai em `500` genérico — nunca vaza stack trace, query ou estrutura interna.
- Logger estruturado grava só método, path, status, duração, request-id — nunca senha/token/hash.
- `RequestID` middleware correlaciona logs de uma mesma requisição.
- Middleware `Recover` captura panic sem vazar detalhe ao cliente.
- CSWSH mitigado por default seguro da lib `coder/websocket` (sem `InsecureSkipVerify`).
- Token WebSocket nunca na query string — vai via `Sec-WebSocket-Protocol` (evita vazar em log de proxy/histórico do browser).
- Isolamento de salas realtime: hub/room sempre escopados por `DocID`, sem estado global compartilhado entre documentos.
- Handshake WS autentica e checa `IsMember` ANTES do upgrade — não dá pra escutar documento alheio adivinhando o ID.
- Documento soft-deletado bloqueia handshake WS pra todo mundo, membros incluídos.
- Concorrência em hub/room/registry protegida por mutex, sem TOCTOU aparente.

## Funcionalidades — documentos e conteúdo

- Criar documento em branco, a partir de modelo de agenda, modelo datado, ou importar `.txt`/`.md` (até 1MB).
- Renomear documento (título também cifrado).
- Duplicar documento (novo dono, nova DEK, mesmo conteúdo reconstituído e reaplicado como update novo).
- Soft-delete com "Arquivados" — dá pra restaurar depois.
- Exportar um documento como `.txt`.
- Exportar TODO o cofre como um único `.zip` (via `fflate`), nomes deduplicados automaticamente ("Título (2).txt").
- Documento sem DEK disponível é pulado silenciosamente na exportação em massa (best-effort, não trava o zip inteiro).
- Busca no texto do documento aberto (Ctrl+F/F), case-insensitive, navegação circular, contador "match X de Y".

## Conceitos técnicos — CRDT e convergência (colaboração)

- **CRDT (Conflict-free Replicated Data Type)**: cada réplica (cada aba aberta) aplica edições locais imediatamente e propaga operações pras outras — não existe "servidor autoritativo decidindo quem ganhou o conflito", a estrutura de dados garante matematicamente que todas as réplicas convergem pro mesmo estado final, em qualquer ordem de chegada das operações.
- **Yjs usa um CRDT baseado em operações (op-based), não em estado (state-based)**: o que trafega pela rede é a operação em si (um "update" binário), não o documento inteiro — é por isso que updates podem ser guardados como um log incremental (`doc_updates`) em vez de reescrever o documento a cada edição.
- **Identificação causal de operação, não timestamp de relógio**: cada operação do Yjs carrega um `(clientID, clock)` — equivalente a um relógio lógico (na linha de Lamport clock/vector clock) — pra ordenar causalmente sem depender do relógio de parede de cada máquina, que nunca está sincronizado entre clientes.
- **Comutatividade e idempotência das operações**: aplicar a mesma operação duas vezes, ou em ordem diferente em réplicas diferentes, produz o mesmo resultado — é essa propriedade que permite reenviar a fila de updates offline sem duplicar efeito, e persistir o log fora de ordem sem corromper o merge.
- **"Compactação cega" é possível só por causa disso**: o servidor pode apagar updates cobertos por um snapshot sem entender uma linha do conteúdo, porque a garantia de convergência não depende do servidor — depende só da estrutura CRDT em si.
- **Awareness protocol (`y-protocols/awareness`) é um CRDT à parte, efêmero**: presença/cursor não usa o mesmo log persistente do conteúdo — é um estado replicado que expira sozinho (sem heartbeat, você "sai" do awareness), nunca gravado em disco.
- **Undo seletivo por origem (`Y.UndoManager` com `trackedOrigins`)**: o Yjs marca cada transação com uma origem; rastrear só `origin === null` (transações locais) é o mecanismo que separa "desfazer minha última ação" de "desfazer a ação de outra pessoa" — sem isso, um Ctrl+Z teria efeito colateral em edições alheias.

## Conceitos técnicos — WebSocket e tempo real (backend)

- **Padrão Hub-and-Spoke / broadcast fan-out**: `Hub` é o roteador central, `Room` é um grupo de assinantes (um por documento), `Client` é uma conexão — mesma forma do exemplo clássico de chat do Gorilla WebSocket, implementado aqui do zero sobre `coder/websocket`.
- **Registry pattern com mutex**: `roomRegistry`/`userRegistry` são `map[ID]*Room` protegidos por `sync.Mutex`, com `getOrCreate`/`get`/`dropIfEmpty` — uma sala só existe enquanto tem cliente, evitando vazamento de memória de salas vazias.
- **Read pump / write pump (um goroutine pra cada direção por conexão)**: cada `Client` tem uma goroutine dedicada drenando seu canal de saída (`runWritePump`) enquanto o handler HTTP roda o loop de leitura (`runReadLoop`) — desacopla "receber da rede" de "mandar pra rede", nenhum dos dois bloqueia o outro.
- **Backpressure com eviction em vez de bloqueio**: `enqueue` usa `select`/`default` num channel bufferizado (16 frames) — um consumidor lento nunca trava o `broadcast` pra sala inteira; ao encher o buffer, o cliente lento é desconectado (`evict`) em vez de todo mundo esperar por ele.
- **Duas semânticas de entrega deliberadamente diferentes**: `enqueue` (non-blocking, descarta se cheio — aceitável em estado estacionário) vs `enqueueBlocking` (espera por espaço, limitado por `context` — usado só no replay de histórico de entrada, onde perder um frame corromperia a visão do cliente).
- **Protocolo próprio sobre WebSocket, não o `y-websocket` padrão**: o servidor nunca decodifica o conteúdo Yjs — só um framing binário opaco (`[tipo][id][autor][tamanho][payload]`) — decisão arquitetural direta da regra "servidor nunca lê conteúdo".
- **Handshake autenticado antes do upgrade** (não depois): a checagem de token + membership roda dentro do próprio handler HTTP, antes de `websocket.Accept` — em vez de depender do middleware `RequireAuth` padrão, porque um browser não consegue mandar header `Authorization` customizado no handshake de WebSocket.
- **Token fora da query string**: vai em `Sec-WebSocket-Protocol` (um subprotocolo com prefixo), especificamente pra não vazar em log de proxy/CDN ou no histórico do navegador, onde uma query string ficaria.
- **`http.Hijacker` por trás do upgrade**: o upgrade de WebSocket assume o controle raw do socket TCP (via `Hijack()`), saindo do modelo request/response normal do `net/http` — é por isso que o middleware precisou reimplementar `Hijacker` por delegação (ver seção de padrões do backend).
- **Concorrência seguramente testada com `-race`**: testes de sala disparam joins/leaves/broadcasts concorrentes sob o detector de data race do Go, não só single-threaded happy path.
- **Presença como estado efêmero, nunca persistido**: quem está online, cursor, "digitando agora" vivem só na memória do processo (mapas em `Hub`/`Room`) — reiniciar o servidor não corrompe dado nenhum porque presença não é fonte de verdade de nada.
- **"Servidor burro" (dumb pipe) como decisão de design**: o comentário do próprio pacote chama isso de "dumb mail carrier with a doorman" — o hub roteia e autoriza (o "porteiro"), mas nunca inspeciona a carta.

## Funcionalidades — colaboração em tempo real

- Edição simultânea via CRDT (Yjs) — sem lock de edição, sem "só uma pessoa por vez".
- Cliente WebSocket próprio (não é o `y-websocket` padrão) — protocolo binário customizado.
- Frame de update: `type(1) || update_id(8) || author_id(16) || len(4) || payload`.
- Frame de saída do client (mais curto — servidor atribui id/autor): `type(1) || len(4) || payload`.
- Presença via mensagens de controle JSON (texto), separadas dos frames binários de conteúdo.
- Reconexão com backoff exponencial: 500ms até 10s.
- Reconecta na hora ao voltar o foco da aba (`visibilitychange`) — `setInterval` é throttled em background.
- Ping a cada 25s pra manter a conexão viva; servidor tem timeout de leitura de 60s.
- Fila de updates feitos offline (`pendingBeforeOpen[]`), reenviada na reconexão.
- `onPendingCountChange` informa a UI pra mostrar "sincronizando...".
- Fila de decrypt sequencial garante aplicação de updates na ordem de chegada (decrypt é async).
- Update que falha na verificação de assinatura é descartado do CRDT sem derrubar a conexão — dispara toast de erro.
- Undo/redo local via `Y.UndoManager`, rastreando só `trackedOrigins: [null]` — edição remota nunca entra no Ctrl+Z de quem não fez.
- Contagem de caracteres/palavras recalculada a cada update do `ydoc`.
- Flash visual de 400ms na textarea quando chega edição remota (já que textarea não anima caractere a caractere).
- Cor de cursor determinística por hash do `user_id`, 5 cores fixas RGB.
- Estado "away" depois de 60s sem atividade.
- Heurística de "digitando agora": mudança de awareness nos últimos 2s, reavaliada por polling a cada 500ms.
- Indicador "quem está online" por documento sem abrir WebSocket — uma chamada HTTP (`/api/docs/active`) pergunta ao hub quem está em cada sala.
- Compactação automática: a cada 200 updates acumulados, cliente gera snapshot cifrado (checado 2s após conectar, depois a cada 30s).
- "Compactação cega": servidor nunca decide o que compactar, só apaga o que o cliente já provou reconstruir.
- Restauração de histórico usa conexão WS temporária: espera 400ms pro replay assentar, substitui texto inteiro como update novo, espera mais 400ms, destrói conexão.

## Funcionalidades — compartilhamento e acesso

- Três papéis: dono (único, fixo), editor, leitor.
- Papel reforçado no servidor em toda ação sensível, nunca só escondido na UI.
- Convite por e-mail: fica pendente até aceitar; convite tem preview do convidado (avatar, nome, sigilo) antes de enviar.
- Convite por link: só dono cria/regenera/revoga; entrada imediata; papel fixo (editor ou leitor, nunca dono).
- Regenerar o link invalida o token antigo na hora.
- Remover membro dispara rotação de chave (ver seção de criptografia).
- Troca de papel (editor↔leitor) direto do painel lateral de Pessoas, sem abrir o modal de compartilhamento.
- Membro "pendente": entrou por link mas ninguém selou a DEK pra ele ainda — aparece marcado até alguém completar.
- Qualquer membro existente pode completar o selo de um membro pendente (`reconcilePendingMember`).
- Conflito de chave: convidar ou remover checa a chave conhecida daquela pessoa; se mudou, aborta e mostra overlay de confirmação.
- Notificação em tempo real de convite criado/aceito/recusado/cancelado via canal WS por usuário (`invites_changed`), sem carregar dado do convite — só um "vá buscar de novo".
- Link de convite com token de 256 bits de entropia (32 bytes aleatórios).

## Funcionalidades — organização

- Pastas pessoais (nunca compartilhadas), paleta de 6 cores fixas.
- CRUD de pasta: criar, renomear, recolorir, excluir.
- Mover documento pra pasta / remover de pasta.
- Pin de documento — só local (`localStorage` namespaced por usuário), sem campo no backend.
- Abas na lista: Todos / Meus / Compartilhados / Arquivados / Convites.
- Busca e ordenação (recente, nome, atividade) na lista de documentos, ordenação cicla via um botão.
- Badge de contagem de convites pendentes na sidebar.
- Widget "online agora" deduplicado entre documentos (mesma pessoa em duas abas conta uma vez).
- Menu de documento: compartilhar, histórico, pin/unpin, duplicar, exportar, mover pra pasta, excluir (separado por divisor, ação destrutiva).

## Funcionalidades — comentários

- Comentários por documento, feed flat (não ancorado a trecho de texto).
- Criar, editar, resolver, excluir.
- Editar é só de quem escreveu; resolver/excluir de outra pessoa é privilégio do dono.
- Painel lateral com abas Comentários/Pessoas, navegação por teclado tipo tab.
- `aria-live="polite"` na lista de comentários.
- Campos: autor, corpo, criado em, editado em (nullable), resolvido em (nullable).

## Funcionalidades — histórico e versionamento

- Updates agrupados em "sessões de edição" por autor, corte de 5 minutos de inatividade entre sessões.
- `reconstructTextAt`: recria o texto em qualquer ponto reaplicando updates decriptados num `Y.Doc` descartável.
- `computeGroupDeltas`: calcula "+240 −12" por grupo numa única passada incremental.
- Scrubber de linha do tempo, arrastável por mouse ou teclado.
- Reprodução automática (play/pause) com múltiplas velocidades configuráveis.
- Lista de versões agrupada por sessão, com nome do autor e delta de caracteres.
- Destaque temporário (900ms) do texto alterado ao restaurar/navegar.
- Modal de confirmação antes de restaurar uma versão.
- Restaurar aplica o texto restaurado como update NOVO — nunca apaga o que veio depois (mesmo princípio do CRDT).
- Estados vazio/carregando dedicados na página de histórico.

## Funcionalidades — conta e autenticação (UX)

- Registro em 2 passos: (1) nome/e-mail/senha/confirmação com validação de mismatch inline; (2) tela de confirmação explícita "sem recuperação de senha" com checkbox obrigatório.
- Sem recuperação de senha, por design — senha é raiz de toda a hierarquia de chaves.
- Login com barra de progresso da derivação Argon2id (~1s).
- Link "Esqueci a senha" no login expande aviso inline explicando por que não existe recuperação.
- Auto-lock opcional: cobre a app com overlay após 30 min de inatividade configurável.
- Auto-lock é privacidade, não logout — sessão e WS continuam ativos.
- Desbloqueio do auto-lock exige senha real reverificada contra o servidor (não só fechar o overlay).
- Settings: cartão de Perfil (renomear), Identidade (fingerprint + sigilo + copiar), Dispositivos (listar/revogar), Segurança (trocar senha), Aparência (tema), Idioma, Logout.

## Funcionalidades — UI/UX

- Paleta de comandos (Ctrl/Cmd+K): navegação global + ações contextuais da página atual.
- Paleta com navegação por setas, `aria-activedescendant`, `role="combobox"`/`listbox`/`option`.
- Atalhos de teclado no editor: `.` (toggle painel), `/` (ajuda), `F` (buscar), `Shift+H` (histórico), `Shift+S` (compartilhar), Ctrl+Z/Ctrl+Shift+Z (undo/redo).
- Modal de ajuda de atalhos dedicado.
- Tema claro/escuro/sistema, aplicado via `data-theme` no `<html>` antes do React montar (evita flash).
- Tema persistido em `localStorage`.
- i18n completo pt/en via i18next, pt como padrão, detecção via `localStorage`.
- `<html lang>` sincronizado a cada troca de idioma (acessibilidade).
- Toasts com ação opcional "Desfazer" (duração maior, 8s vs 4s padrão).
- Tempo relativo localizado via `Intl.RelativeTimeFormat` ("há 2 horas").
- Agrupamento de listas por dia (Hoje/Ontem/data) via helper de data.
- Banner de desconexão só aparece depois de 5s desconectado (evita piscar em blip de rede).
- Tela de espera dedicada quando a chave do documento está "pending" ou em erro.
- Badge de "somente leitura" pra quem é leitor no documento.
- Badge de privacidade/sigilo do DEK no header do editor.
- Acessibilidade: `role="tablist"/"tab"/"tabpanel"` com navegação por setas.
- Skip link.
- Foco preso em modais (`useDialogFocusTrap`).
- `role="alert"` em erro de formulário.
- Rótulos ARIA na maioria dos controles interativos.

## Testes — backend

- 19 arquivos de teste.
- 54+ funções `Test` de top-level (mais subtestes dentro de cada uma).
- Testes de integração reais contra Postgres — não mocka repositório.
- Cobre: rotação de chave e efetividade de revogação, detecção de reuso de refresh token, IDOR em endpoints sensíveis, papéis concedíveis, isolamento de sala WS sob concorrência, revogação de dispositivo, troca de senha.
- Teste específico de escalação de privilégio (`TestAddMemberRejectsOwnerRole`, `TestCreateInviteLinkRejectsOwnerRole`, `TestSetMemberWrappedDEKCannotOverwriteAnotherMembersWrap`).
- Teste de eviction de WS na remoção de membro (`TestHubEvictDocumentMemberClosesOnlyThatUsersConnection`).
- Teste de limite de conexão por usuário (`TestHubConnectionLimitPerUser`).
- Teste de rejeição de JWT secret curto (`TestLoadRejectsShortJWTSecret`).
- Teste de rejeição de login key curta (`TestRegisterRejectsShortLoginKey`).
- Teste de concorrência de sala com `-race` (join/leave/broadcast simultâneos).

## Testes — frontend

- 18 arquivos de teste.
- Cobertura mais densa em criptografia: round-trip, rejeição de replay cross-documento/cross-autor/cross-época, DEK errado, ciphertext adulterado, assinatura forjada, fallback por key ring em rotação.
- Teste de Argon2id determinístico e "lento de verdade" (parâmetros reais, não enfraquecidos, timeout de 15s).
- Teste de sealed box com destinatário errado.
- Teste de sigilo simétrico/determinístico.
- Teste de refresh transparente de token (retry único, toast único mesmo com múltiplas falhas simultâneas).
- Teste de guarda de rota autenticada (`RequireSession`) — nunca redireciona antes do bootstrap assentar.
- Teste de fluxo de conflito de chave no ShareModal, ponta a ponta.
- Sem teste de página inteira (DocumentPage, DocumentsPage, HistoryPage) — cobertura seletiva focada em risco real, não em UI pura.

## DevOps / ambiente

- Tudo containerizado — Docker Compose com serviços `db`, `server`, `web`.
- `server`: Dockerfile multi-stage (`dev` com `air` hot-reload, `build`, `prod` minimalista alpine, usuário não-root).
- `web`: Dockerfile multi-stage (`dev` com Vite hot-reload, `build`, `prod` servido por nginx com template de proxy).
- `entrypoint.sh`: script de bootstrap pra clone novo — checa Docker, prepara `.env`, sobe Postgres e espera saudável (com timeout de 60s), aplica migrations, sobe server+web.
- `Makefile` com alvos: `up`, `down`, `clean`, `logs`, `ps`, `db`, `server`, `web`, `test`, `migrate-up`, `migrate-down`, `migrate-create`.
- Variáveis de ambiente centralizadas em `.env` (gitignored) / `.env.example`.
- `PALIMPSESTO_SECURE_COOKIES` desabilitado só no dev compose (HTTP puro, sem TLS) — seguro por padrão em qualquer deploy real.
- Migrations versionadas e reversíveis (`+goose Up`/`+goose Down`), 15 arquivos de migration.
