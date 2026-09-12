# Plano de ação — pontos fracos da auditoria de engenharia

Este documento parte direto dos achados do relatório de auditoria de julgamento de
engenharia (decisões, não estilo). A maioria dos itens **já foi corrigida** ao longo desta
mesma sessão — marcados como tal, com a evidência de onde — porque não faz sentido um
plano de ação fingir que um problema ainda existe quando não existe mais. O que resta é
trabalho real: verificação de que a correção não foi isolada, cobertura de teste que
nunca existiu, e duas decisões que só você pode tomar.

Convenção: cada item tem status (`[FEITO]`, `[VERIFICADO]`, `[PENDENTE]`), o achado
original, o que precisa acontecer, e como saber que terminou.

---

## 1. `[FEITO]` `AddMember` sem validar o papel concedido

**Achado**: `AddMemberHandler.Handle` aceitava qualquer `document.Role` do cliente sem
checar se era concedível — um `reader` conseguia promover qualquer conta a `owner`.

**O que foi feito**: `server/internal/application/document/commands/add_member.go:38-40`
agora rejeita qualquer papel que não seja `RoleEditor`/`RoleReader` antes de qualquer outra
coisa no handler.

**Verificação adicional feita agora, nesta sessão**: conferi se esse era um padrão
sistêmico (a mesma ausência de validação repetida em outros handlers que aceitam
`Role` do cliente) ou um lapso isolado. **Isolado, confirmado**: `update_member_role.go`,
`create_invite_link.go` e `create_invite.go` já tinham a mesma checagem
(`in.Role != document.RoleEditor && in.Role != document.RoleReader`) desde antes — só
`add_member.go` estava sem. Não há trabalho pendente aqui além do que já foi feito.

---

## 2. `[FEITO]` Chaves privadas de identidade em `localStorage`, em claro

**Achado**: `web/src/crypto/identityStore.ts` guardava `identityPrivate`/`signingPrivate`
(o material que a regra central do projeto — "o servidor nunca pode ler o documento" —
existe pra proteger) como JSON base64 puro em `localStorage`, sem cifragem em repouso.

**O que foi feito**: reescrito pra usar IndexedDB com uma chave AES-GCM **não-extraível**
do WebCrypto (`crypto.subtle.generateKey(..., extractable: false, ...)`) — o navegador
nunca entrega os bytes brutos dessa chave pra nenhum JS, nem pro próprio código do app.
Validado de ponta a ponta com um script Node + `fake-indexeddb` (round-trip, isolamento
entre usuários no mesmo device, rejeição de ciphertext adulterado) antes de remover a
dependência temporária.

**Pendente real, item 6 abaixo**: essa validação foi um script descartável, não virou
teste permanente. Ver item 6.

---

## 3. `[FEITO]` Nenhuma coordenação entre `Modal`, `Dropdown`, `CommandPalette` e atalhos globais

**Achado**: cada peça de UI flutuante escutava teclado (`document`/`window`)
independentemente — `Ctrl+K` abria a paleta por cima de um modal já aberto, `Escape` num
dropdown dentro de um modal fechava os dois juntos, `Ctrl+F` roubava foco de dentro de um
focus-trap ativo.

**O que foi feito**: `web/src/lib/floatingLayers.ts` — um registro compartilhado
(module-level, pub-sub, mesmo formato de `lib/toast.ts`) de qual camada está no topo.
`Modal`, `Dropdown`, `CommandPalette` e `useGlobalShortcuts` consultam isso antes de agir
no Escape/atalho global.

**Pendente real, item 6 abaixo**: também sem teste automatizado ainda. Ver item 6.

---

## 4. `[FEITO]` `docs/CRYPTO.md`, `ARCHITECTURE.md`, `API.md` citados, nunca escritos

**Achado**: dezenas de comentários (48 só pra `CRYPTO.md`) referenciavam documentos que
nunca existiram no repositório.

**O que foi feito**: os três arquivos foram escritos, consolidando o raciocínio já
disperso nos comentários — mais `SECURITY.md` e badges de CI no README.

**Nada pendente aqui.** Isso fecha um problema de processo (promessa não cumprida no
código), não de arquitetura — não precisa de acompanhamento técnico adicional, só manter
os docs atualizados quando o design de fato mudar (o que já é prática do projeto:
`docs/CRYPTO.md` cita a migration mais recente por número).

---

## 5. `[FEITO]` Rate limiter por IP sem eviction

**Achado**: `ipLimiter` era um `map[string]*rate.Limiter` que nunca removia entradas —
crescia sem limite pra qualquer processo de longa duração com muitos IPs distintos.

**O que foi feito**: `server/internal/interfaces/http/middleware/ratelimit.go` — cada
entrada agora guarda também `lastUsed`; uma goroutine de limpeza (`startEvictionLoop`,
iniciada uma vez por `RateLimit()`) remove a cada 10 minutos quem ficou parado há mais de
1 hora (`evictionInterval`/`staleAfter`). O relógio é injetável (`ipLimiter.now`) pra
`TestIPLimiterEvictsOnlyEntriesStaleBeforeCutoff` não depender de `sleep` real — avança um
clock fake, chama `evictStaleBefore` diretamente, confirma que só a entrada parada some e
que o "bucket" da entrada que sobrevive não é resetado por engano.

**Validado**: `go vet ./...` limpo, suíte inteira do backend verde
(`palimpsesto/internal/interfaces/http/middleware` incluso).

---

## 6. `[FEITO]` Zero cobertura de teste pra `identityStore.ts` e `floatingLayers.ts`

**Achado**: os dois arquivos mais recentemente reescritos por motivo de segurança/bug real
não tinham nenhum teste automatizado — a validação que existiu foi manual (scripts
descartáveis, já apagados).

### 6a. `identityStore.ts`

**O que foi feito**: `fake-indexeddb` virou dev dependency real (`package.json`), e
`web/src/test/crypto/identityStore.test.ts` cobre: `null` antes de qualquer save,
round-trip exato, a flag `published` distinta do material de chave, dois usuários no mesmo
device sem colisão, e ciphertext adulterado (byte flipado direto no IndexedDB)
devolvendo `null` em vez de lançar ou devolver lixo — o mesmo smoketest manual que já
tinha rodado uma vez nesta sessão, agora permanente. `crypto.subtle` já funciona neste
ambiente jsdom sem precisar de polyfill adicional — só o IndexedDB precisava do
`fake-indexeddb` (jsdom não implementa isso). Isolamento entre testes via uma
`IDBFactory` nova a cada `beforeEach` (o nome fixo `'palimpsesto'` do banco, de
propósito no código de produção, não pode vazar estado de um teste pro outro).

### 6b. `floatingLayers.ts`

**O que foi feito**: `web/src/test/lib/floatingLayers.test.ts` — lógica pura, sem DOM.
Cobre o cenário exato que motivou a correção (dropdown aberto dentro de modal fica no
topo, não o modal), o caso de fechar a camada interna e a externa voltar a ser topo, pop
de um id nunca empilhado (no-op), e duplicata de id (`lastIndexOf` remove a ocorrência
certa). Cada teste empilha e desempilha simetricamente, sem depender de reset global —
mesma disciplina push-on-mount/pop-on-unmount que `Modal`/`Dropdown` seguem de verdade.

**Validado**: `tsc -b`, lint, format, `npm run test` (97/97, os 11 novos inclusos) e
`npm run build` — todos limpos.

---

## 6. `[PENDENTE]` Zero cobertura de teste pra `identityStore.ts` e `floatingLayers.ts`

**Achado**: os dois arquivos mais recentemente reescritos por motivo de segurança/bug real
não têm nenhum teste automatizado no repositório — a validação que existiu foi manual
(scripts descartáveis, já apagados).

### 6a. `identityStore.ts`

**O que fazer**: adicionar `fake-indexeddb` como dev dependency real (não instalação
temporária) e escrever `web/src/test/crypto/identityStore.test.ts` cobrindo, no mínimo:

- `loadIdentityKeyPair` retorna `null` antes de qualquer `save`.
- Round-trip: `save` seguido de `load` devolve exatamente o que foi salvo.
- Dois `userId` diferentes no mesmo "device" (mesmo teste, mesma execução) não colidem —
  cada um recupera só o seu.
- Ciphertext adulterado (flipar um byte) faz `loadIdentityKeyPair` retornar `null` (não
  lançar, não devolver lixo) — é esse o contrato que o `try/catch` do módulo promete.

Isso reproduz exatamente o smoketest manual que já rodou uma vez nesta sessão — só que
permanente, rodando em todo `npm run test` daqui pra frente.

**Configuração adicional necessária**: `test/setup.ts` (ou um setup específico desse
arquivo de teste) precisa garantir que `indexedDB` está disponível no ambiente jsdom —
`import 'fake-indexeddb/auto'` no topo do arquivo de teste resolve sem precisar mexer no
setup global, já que nenhum outro teste do projeto precisa de IndexedDB.

### 6b. `floatingLayers.ts`

**O que fazer**: `web/src/test/lib/floatingLayers.test.ts` — é lógica pura (um array e
funções sobre ele), não precisa de DOM nem de mock de componente:

- `pushLayer`/`isTopLayer`: a última camada empilhada é a do topo.
- `popLayer` remove só a instância certa (não a primeira ocorrência de um id repetido, se
  isso puder acontecer) e a camada anterior volta a ser o topo.
- `hasAnyLayer` reflete corretamente pilha vazia vs não-vazia.

Mais valioso ainda seria um teste de integração leve pro cenário que motivou a correção —
mas isso exige montar `Modal`+`Dropdown` juntos com Testing Library e simular o
`Escape`, o que é bem mais trabalho por um ganho menor do que testar o registro em si
isoladamente. Fica como "bom ter", não como bloqueio.

**Como saber que terminou**: `npm run test` cobrindo os dois arquivos, rodando no CI
(`frontend.yml` já roda `npm run test` — nenhuma mudança de workflow necessária, só os
arquivos de teste precisam existir).

---

## 7. `[PENDENTE — decisão sua]` Contato de segurança no `SECURITY.md`

**Achado**: `SECURITY.md` tem `[TODO: endereço de contato de segurança]` — não decidi um
email por você, porque publicar um endereço pessoal num repositório público é uma escolha
sua, não técnica.

**O que fazer**: decidir se é seu email pessoal, um email dedicado
(`security@seudominio`), ou um formulário/GitHub Security Advisory (a plataforma tem um
mecanismo nativo pra isso, `Settings → Security → Reporting`, que evita expor qualquer
email publicamente). Depois, uma linha trocada em `SECURITY.md`.

---

## 8. `[PENDENTE — decisão sua]` Licença e caminho do repositório

**Achado**: sem `LICENSE`; badges do README apontam pra `SEU_USUARIO/palimpsesto`
(placeholder).

**O que fazer**: escolher a licença (MIT, Apache 2.0, ou nenhuma/todos os direitos
reservados) e me passar o `usuário/repo` real do GitHub assim que existir, pra eu trocar
os dois placeholders (`README.md` e o link de `LICENSE` no badge).

---

## Estado atual

Itens 1-6 estão todos `[FEITO]` — ficam documentados aqui pra o plano ser auditável (dá
pra conferir cada um contra o código de verdade, não é uma alegação solta). Só restam:

- **Item 7** — contato de segurança em `SECURITY.md`.
- **Item 8** — licença e caminho do repositório no GitHub.

Nenhum dos dois é trabalho de engenharia — são decisões que só você toma. Assim que
responder, aplico.
