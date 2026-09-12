# Arquitetura

Este documento é a referência pra `docs/ARCHITECTURE.md`, citada em comentários espalhados
pelo backend — a explicação de por que o servidor é "um carteiro burro com porteiro", por
que erro de domínio nunca vaza detalhe pro cliente, e como as camadas se encaixam.

---

## 1. Backend — DDD em camadas

```
interfaces/http     → router, handlers, middleware, DTOs de request/response
application/{user,document}
                     → comandos e queries, um arquivo por caso de uso
domain/{user,session,document,auth}
                     → entidades, regras de negócio, contratos de repositório
infrastructure/{persistence,realtime}
                     → implementação Postgres, hub de WebSocket
```

Regra de dependência: a seta sempre aponta pra dentro. `domain` nunca importa `net/http`
nem um driver de banco; `application` só depende de interfaces de repositório (declaradas
no `domain`, implementadas em `infrastructure`), nunca de Postgres diretamente. `HTTP` é a
única camada que conhece JSON/HTTP — é isso que faz o núcleo da aplicação testável sem
subir um servidor, e trocável (outro banco, outro transporte) sem tocar em regra de
negócio.

Isso é **Ports & Adapters (arquitetura hexagonal)** na prática: `domain`/`application` são
o núcleo isolado (as portas), `interfaces/http` e `infrastructure/persistence` são os
adaptadores plugáveis nas bordas.

### Autorização e tradução de erro, centralizadas

- Toda checagem de posse passa por `application/document/authz.RequireMembership` — nunca
  espalhada handler por handler.
- Um não-membro recebe `ErrNotFound`, nunca `ErrForbidden` — a própria existência de um
  documento não é informação pública.
- A tradução de erro de domínio → status HTTP é centralizada em `interfaces/http/responses`
  (`UserError`, `DocumentError`) — nenhum handler decide status code por conta própria. Um
  erro não mapeado cai num `500` genérico, sem vazar stack trace nem estrutura interna.

### CQS (Command-Query Separation)

`commands/` (escrita, muda estado) e `queries/` (leitura, nunca muda estado) são
fisicamente separados por diretório em `application/document` e `application/user` — não é
CQRS com stores separados, é a disciplina de nunca misturar leitura com escrita no mesmo
caso de uso.

### Repository pattern, segmentado por responsabilidade

`Repository`, `MembershipRepository`, `UpdateRepository`, `InviteRepository`,
`InviteLinkRepository`, `CommentRepository`, `SnapshotRepository`, `FolderRepository` —
Interface Segregation Principle aplicado: um handler que só lê updates nunca precisa
mockar o repositório de convites nos testes.

### Outros padrões nomeados, com o raciocínio de cada um

- **Sentinel errors + `errors.Is`/`errors.As`**: cada erro de domínio é um valor exportado
  (`var ErrNotFound = errors.New(...)`), nunca uma string comparada por igualdade —
  permite `errors.Is` funcionar através de `%w` (wrapping) em toda a cadeia de chamadas.
- **Decorator pattern via middleware chain**: `middleware.Chain(handler, RequestID,
  Logging, Recover)` empilha decorators de `http.Handler` em ordem — mesmo padrão dos
  middlewares de Express/Gin, só que com stdlib pura.
- **Decorator sobre `http.ResponseWriter`**: `statusWriter` embute e sobrescreve
  `WriteHeader` pra capturar o status code depois que o handler já escreveu (a stdlib não
  expõe isso de volta), e reimplementa `http.Hijacker` por delegação — sem isso, o upgrade
  de WebSocket quebraria silenciosamente ao passar por esse decorator.
- **Constructor injection sem framework de DI**: todo `New*Handler(dep1, dep2)` recebe
  suas dependências explícitas no construtor — sem container de injeção, sem reflection.
- **Generics do Go pra config**: `getenv[T ~string](key string, fallback T) T` e
  `requireEnv[T ~string]` compartilham a mesma implementação entre `Addr`, `DatabaseURL`,
  `JWTSecret` sem duplicar código nem perder tipagem.
- **Pessimistic locking**: rotação de chave e remoção de membro usam `SELECT ... FOR
  UPDATE` dentro de transação — o custo de uma rotação errada (dois epochs conflitantes) é
  maior que o custo de bloquear brevemente.
- **Restrições de unicidade como controle de concorrência**: `doc_members` com PK
  composta e `document_invites` com `UNIQUE` fazem o Postgres arbitrar corridas (dois
  `join` simultâneos) em vez de uma checagem "SELECT depois INSERT" na aplicação, que
  teria uma janela de corrida (TOCTOU).
- **Idempotência deliberada**: aceitar o mesmo convite duas vezes, ou entrar pelo mesmo
  link duas vezes, é tratado como no-op — importante porque um cliente HTTP pode reenviar
  uma request sem o usuário perceber (retry de rede, duplo clique).
- **Graceful shutdown**: `signal.NotifyContext(SIGINT, SIGTERM)` cancela um
  `context.Context` raiz; o servidor recebe até `ShutdownTimeout` (10s) pra terminar
  requests em voo antes de fechar o pool de conexões.
- **Prevenção de confusão de algoritmo (algorithm confusion attack)**: `ParseWithClaims`
  valida explicitamente `t.Method.(*jwt.SigningMethodHMAC)` antes de aceitar qualquer
  token — sem isso, um JWT com `alg: none` ou trocado pra RS256 usando a chave pública
  como segredo HMAC seria um bypass clássico de autenticação.
- **Formato de hash auto-descritivo (PHC-like)**: `m=65536,t=3,p=1,salt=...` guardado
  junto com cada hash — os parâmetros de custo do Argon2id viajam com o hash, então
  aumentar o custo no futuro não invalida hashes antigos.

Ver [`CRYPTO.md`](CRYPTO.md) pra tudo relacionado a chaves, cifragem e o modelo de
confiança E2EE — este documento cobre o esqueleto da aplicação, não o conteúdo
criptográfico em si.

---

## 2. O hub de tempo real — "um carteiro burro com porteiro"

`server/internal/infrastructure/realtime/hub.go` distribui bytes de update CRDT pra cada
conexão de um documento, e nada além disso — nunca inspeciona o conteúdo de um frame. É o
comentário do próprio pacote que dá o nome: o hub roteia e autoriza (o "porteiro"), mas
nunca lê a carta.

### Forma: Hub-and-Spoke / broadcast fan-out

`Hub` é o roteador central, `Room` é um grupo de assinantes (um por documento), `Client` é
uma conexão — a mesma forma do exemplo clássico de chat do Gorilla WebSocket, implementado
aqui do zero sobre `coder/websocket`. `roomRegistry`/`userRegistry` são `map[ID]*Room`
protegidos por `sync.Mutex`, com `getOrCreate`/`get`/`dropIfEmpty` — uma sala só existe
enquanto tem cliente, evitando vazamento de memória de salas vazias.

### Read pump / write pump

Cada `Client` tem uma goroutine dedicada drenando seu canal de saída (`runWritePump`)
enquanto o handler HTTP roda o loop de leitura (`runReadLoop`) — desacopla "receber da
rede" de "mandar pra rede", nenhum dos dois bloqueia o outro.

### Backpressure com eviction, não bloqueio

`enqueue` usa `select`/`default` num channel bufferizado (16 frames) — um consumidor lento
nunca trava o `broadcast` pra sala inteira; ao encher o buffer, o cliente lento é
desconectado (`evict`) em vez de todo mundo esperar por ele. Duas semânticas de entrega
deliberadamente diferentes: `enqueue` (non-blocking, descarta se cheio — aceitável em
estado estacionário) vs `enqueueBlocking` (espera por espaço, limitado por contexto — usado
só no replay de histórico de entrada, onde perder um frame corromperia a visão do
cliente).

### Protocolo próprio, não `y-websocket`

O servidor nunca decodifica o conteúdo Yjs — só um framing binário opaco
(`type(1) || update_id(8) || author_id(16) || len(4) || payload`, mais curto na direção
cliente→servidor já que o servidor atribui `id`/`author`) — decisão arquitetural direta da
regra "servidor nunca lê conteúdo". Presença/controle trafega separado, em mensagens JSON
de texto.

### Handshake autenticado antes do upgrade

A checagem de token + membership roda dentro do próprio handler HTTP, antes de
`websocket.Accept` — não dá pra depender do middleware `RequireAuth` padrão porque um
browser não consegue mandar header `Authorization` customizado no handshake de WebSocket.
O token viaja via `Sec-WebSocket-Protocol` em vez de query string, especificamente pra não
vazar em log de proxy/CDN ou no histórico do navegador.

### Presença é efêmera, nunca persistida

Quem está online, cursor, "digitando agora" vivem só na memória do processo (mapas em
`Hub`/`Room`) — reiniciar o servidor não corrompe dado nenhum porque presença nunca foi
fonte de verdade de nada. **Consequência real**: isso (e o rate limiter, também em
memória) só funciona corretamente com uma única réplica do backend — não há Redis nem
pub/sub externo hoje, então duas instâncias atrás de um load balancer não veriam a
presença/updates uma da outra em tempo real. Uma limitação conhecida, não uma decisão
definitiva — ver a seção de escalabilidade abaixo.

---

## 3. CRDT e convergência — por que compactação cega é possível

O conteúdo colaborativo usa **Yjs**, um CRDT (Conflict-free Replicated Data Type)
baseado em operações: cada réplica (cada aba aberta) aplica edições locais imediatamente e
propaga a operação — não existe "servidor autoritativo decidindo quem ganhou o conflito",
a estrutura de dados garante matematicamente que todas as réplicas convergem pro mesmo
estado final, em qualquer ordem de chegada.

O que trafega pela rede é a operação em si (um "update" binário), não o documento inteiro
— por isso updates viram um log incremental (`doc_updates`) em vez de reescrever o
documento a cada edição. Cada operação carrega `(clientID, clock)` — um relógio lógico, na
linha de Lamport/vector clock — pra ordenar causalmente sem depender do relógio de parede
de cada máquina.

**A propriedade que importa pro servidor**: aplicar a mesma operação duas vezes, ou em
ordem diferente em réplicas diferentes, produz o mesmo resultado (comutatividade +
idempotência). É por causa disso que o servidor pode apagar updates cobertos por um
snapshot **sem entender uma linha do conteúdo** — a garantia de convergência não depende
dele, depende só da estrutura CRDT em si. Ver [`CRYPTO.md`](CRYPTO.md) seção 8 pro
mecanismo de compactação em si.

Presença/cursor usa um CRDT à parte, efêmero (`y-protocols/awareness`) — estado replicado
que expira sozinho (sem heartbeat, você "sai" do awareness), nunca gravado em disco.

---

## 4. Frontend

```
pages/       → rotas
components/  → UI
hooks/       → lógica reutilizável
lib/         → funções puras
crypto/      → toda a criptografia client-side
realtime/    → WebSocket + Yjs
auth/        → sessão + fluxos de autenticação
```

Sem gerenciador de estado global (Redux/Zustand/Jotai/Context pesado) — stores no nível de
módulo com pub/sub manual + `useSyncExternalStore` (sessão, tema, toasts, paleta de
comandos, auto-lock), o mesmo padrão em todo lugar que precisa de estado compartilhado
fora da árvore de componentes. Sem biblioteca de formulários — tudo `useState` manual. Sem
lib de design system pesada — componentes próprios + Radix Tooltip + `lucide-react`.

---

## 5. Escalabilidade — o que muda com mais de uma réplica

Hoje a aplicação roda como uma única instância do backend. Duas coisas vivem em memória do
processo e não sobrevivem a isso mudar:

- **Rate limiter** (`middleware/ratelimit.go`) — um `map[string]*rate.Limiter` por IP, em
  memória. Com múltiplas réplicas, o limite efetivo vira "limite configurado × número de
  réplicas", não um limite real compartilhado.
- **Hub de presença/WebSocket** — duas pessoas no mesmo documento, conectadas em réplicas
  diferentes atrás de um load balancer, não veem a edição uma da outra em tempo real: o
  broadcast só alcança quem está conectado *naquele processo*.

O caminho natural pra resolver isso é introduzir um Redis (pub/sub entre réplicas pra
propagar updates/presença, e um rate limiter compartilhado) — não implementado hoje porque
não há necessidade real com uma única instância, mas é o motivo clássico de a maioria dos
apps desse formato eventualmente adotar um.
