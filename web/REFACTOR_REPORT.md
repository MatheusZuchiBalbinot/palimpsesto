# Relatório: grouped props, renderer lookup table e primitive obsession

Investigação completa de `web/src` (180 arquivos `.ts`/`.tsx`, fora de teste): todo
`pages/`, todo `components/` (incluindo `vault/`, `share/`, `document/`,
`history/`, `settings/`), todo `hooks/`, e os pontos de tipagem em `api/`,
`realtime/`, `crypto/`, `lib/`. Cada achado abaixo tem evidência concreta
(arquivo + linha), não é achismo.

Convenção de prioridade: **Alto** = bug real possível ou risco de segurança;
**Médio** = duplicação real (mesmo bloco em 2+ lugares) ou round-trip
desperdiçado; **Baixo** = estilístico, sem risco funcional.

---

## 1. Primitive obsession — IDs opacos como `string` genérico

**Prioridade: Alto.** Este é o achado mais sistêmico do projeto.

`api/docTypes.ts` e `api/authTypes.ts` tipam **todo identificador** como
`string` puro — não existe `DocumentId`, `UserId`, `FolderId`, `CommentId`,
`InviteId`, `FamilyId` ou `InviteToken` como tipos distintos. Consequência
direta: o TypeScript nunca impede passar um id no lugar de outro do mesmo
formato (UUID), incluindo trocar a ORDEM de dois parâmetros posicionais do
mesmo tipo — o compilador não acusa nada, só quebra em runtime (404, ou pior,
silenciosamente errado).

Repare também que o mesmo conceito — "id do documento" — já aparece com dois
nomes diferentes conforme o DTO: `DocumentDTO.id` vs. `ActiveDocumentDTO.document_id`
(`api/docTypes.ts:6,61`).

### Funções com 2-3 `string` adjacentes do mesmo "formato" — risco de troca silenciosa

| Local                         | Assinatura atual                                                                                   | Risco                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `api/docs.ts:117`             | `cancelInvite(docId: string, inviteId: string)`                                                    | inverter os dois argumentos compila normalmente |
| `api/docs.ts:157,174,186,193` | `setMemberWrappedDEK/removeMember/leaveDocument/updateMemberRole(id: string, userId: string, ...)` | doc id e user id adjacentes                     |
| `api/docs.ts:242,249,255`     | `editComment/resolveComment/deleteComment(id: string, commentId: string)`                          | doc id e comment id adjacentes                  |
| `hooks/useFolders.ts:41`      | `handleUpdateFolder(folderId: string, name: string, color: string)`                                | três `string` seguidas                          |
| `hooks/useFolders.ts:57`      | `handleMoveToFolder(docId: string, folderId: string \| null)`                                      | doc id e folder id adjacentes                   |
| `crypto/documentDek.ts:46`    | `createAndWrapOwnDEK(docId: string, ownUserId: string, ...)`                                       | doc id e user id adjacentes                     |
| `auth/actions.ts:144`         | `verifyPassword(email: string, password: string)`                                                  | menor risco, mesmo padrão                       |

### O caso mais grave: chaves criptográficas como `string` posicional

**`crypto/knownKeys.ts:39` e `:53`** — `checkKnownKey(userId: string, identityPub: string, signingPub: string)` e `trustKey(userId, identityPub, signingPub)`. `identityPub` (X25519) e `signingPub` (Ed25519) são dois blobs base64 de mesmo tipo, adjacentes. Trocar a ordem na chamada **quebra a verificação de identidade/assinatura silenciosamente** — sem erro de compilação, sem exceção em runtime, só uma verificação de confiança que checa a chave errada. Dado que TOFU (trust-on-first-use) é a defesa central contra impersonação neste app E2EE, este é o ponto de maior risco real do levantamento inteiro.

### Correção sugerida

```ts
type DocumentId = string & { readonly __brand: 'DocumentId' };
type UserId = string & { readonly __brand: 'UserId' };
type FolderId = string & { readonly __brand: 'FolderId' };
type CommentId = string & { readonly __brand: 'CommentId' };
type InviteId = string & { readonly __brand: 'InviteId' };
```

Aplicar em todos os DTOs (`api/docTypes.ts`, `api/authTypes.ts`) e nas
assinaturas acima. Qualquer função que hoje recebe 2+ ids do mesmo shape
passa a receber um objeto nomeado (`{ docId, commentId }`) em vez de
posicionais — o que também abre caminho natural pro padrão de "grouped
props" da seção 3.

---

## 2. Outros casos de tipagem fraca / magic string

### 2.1 `ROLE_LABEL_KEY` não usa o tipo `Role` que já existe (Médio)

`components/share/roleLabels.ts:3` — `Record<string, string>` deveria ser
`Record<Role, string>`. Hoje dá pra adicionar um valor novo a `Role`
(`api/docTypes.ts:3`) sem o compilador forçar atualização deste mapa, e um
typo na chave aqui não é pego.

### 2.2 Código de erro da API sem union compartilhada (Médio)

`api/http.ts:27` — `ApiError.code: string` bare. Comparado contra literais
soltos em 4+ lugares (`hooks/useDocumentKeyRing.ts:68`, `api/docs.ts:138,204`,
`crypto/identityFlow.ts:66`), e a mesma lista de códigos é **redeclarada
independentemente** em `i18n/errors.ts:13-44` (`KNOWN_ERROR_CODES`, um
`Set<string>`), sem ligação de tipo entre as duas listas. Um typo em
qualquer um dos dois lados (`'invite_link_not_found'` vs.
`'invitelink_not_found'`) não é pego pelo compilador — vira fallback
silencioso pra mensagem genérica. Sugestão: gerar `ApiErrorCode` como union
a partir da mesma fonte que `i18n/errors.ts` usa, e tipar `ApiError.code`
com ela.

### 2.3 `FolderDTO.color` é `string` livre apesar de ter paleta fixa (Baixo)

`hooks/useFolders.ts:13` define `FOLDER_COLORS` (6 hex fixos), mas
`color` em `FolderDTO`/`CreateFolderRequest`/`UpdateFolderRequest`
(`api/docTypes.ts:22,28,33`) e em toda assinatura de
`components/FolderModal.tsx:22-23,36-37` continua `string` genérico. Nada
impede um hex fora da paleta, nem impede trocar a posição de `color` com
`name` na chamada (mesmo tipo, adjacentes — mesma classe de risco da seção
1). Sugestão: `type FolderColor = (typeof FOLDER_COLORS)[number]`.

### 2.4 `presenceStatus` da awareness (Yjs) não tipado (Baixo/Médio)

`realtime/provider.ts:123,131,141` escreve/lê `presenceStatus` no estado de
awareness com literais soltos `'online'`/`'away'` — `Awareness.setLocalStateField`
aceita `unknown`, então zero checagem. É o mesmo conceito de `AvatarPresence`
(`components/Avatar.tsx:29`, que também tem `'offline'`), mas sem
compartilhar o tipo: escrever `'idle'` por engano em vez de `'away'`
compilaria, e `getAwayUserIds` (linha 141) simplesmente pararia de achar
ninguém "away" — silenciosamente. Sugestão: `type PresenceStatus =
Exclude<AvatarPresence, 'offline'>` compartilhado entre os dois arquivos.

### 2.5 Par `isLoading`/`loadError` como estados independentes (Baixo, mas com cenário real)

`hooks/useVaultDocuments.ts:8-9` — `isLoading: boolean` e `loadError: unknown`
são dois `useState` separados. **Cenário concreto**: usuário está na aba
"Documentos", uma request anterior falhou (`loadError` setado), o usuário
clica "tentar de novo" → `refresh()` roda de novo → `isLoading` vira `true`
mas `loadError` só é limpo em `.then()` (sucesso). Durante essa janela, a UI
pode legitimamente mostrar spinner de carregamento **e** mensagem de erro
antiga ao mesmo tempo, dependendo de como o componente consumidor decide
renderizar as duas flags — a forma do tipo não impede esse estado. Mesmo
padrão em `useArchivedDocuments.ts:10`, `useHistoryDocument.ts:21`. Sugestão:
`status: 'loading' | 'error' | 'ready'` no lugar do par.

### Pontos já bem tipados (verificado, sem achado — citado pra não parecer que não olhei)

`Role`, `VaultScope` (já corrigido na sessão anterior), `ThemePreference`,
`PanelTab`, `SortMode`, `ConnectionStatus`, `MESSAGE_TYPE`/`ControlMessage`,
`KeyTrustStatus`, `DocumentKeyState['keyStatus']`, `SyncStatusTone`,
`AvatarPresence`, `routes.ts`/`routePatterns` — todos union literal,
usados de forma consistente via constante em todo call site verificado.

---

## 3. Grouped props objects

### 3.1 Round-trip hook → variáveis soltas → props (o padrão de maior valor)

Em todos estes, um hook já devolve (ou poderia devolver) um objeto coeso, e o
componente consumidor desestrutura tudo em variáveis soltas só pra relistar
como props individuais de um filho, às vezes com rename no meio.

| #   | Hook                                                                                                                                                | Round-trip                                                                                                        | Onde reagrupar                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | `hooks/useShareMembers.ts` (retorno completo) → `components/ShareModal.tsx:100-124`                                                                 | ~23 campos desmontados e relistados pra `ShareModalBody`                                                          | Já reportado antes; maior caso do projeto                                                        |
| 2   | `hooks/useFindInTextarea.ts:49-58` → `pages/DocumentPage.tsx:225-243`                                                                               | 8 campos do find-state relistados pra `EditorContent`                                                             | Já reportado antes                                                                               |
| 3   | `hooks/useDevices.ts:64-76` → `pages/SettingsPage.tsx:34-45,103-115`                                                                                | 10 campos achatados, mesmo tendo 2 fluxos internos distintos (revogar 1 / revogar os outros)                      | Ver proposta de shape abaixo                                                                     |
| 4   | `hooks/useScrubberControls.ts` retorno (linha ~78) → `pages/HistoryPage.tsx:72-76` → `components/history/HistoryScrubber.tsx:16-23`                 | 3 handlers renomeados (`handleScrubberPointerDown` etc.) só pra virar `onPointerDown`/`onPointerMove`/`onKeyDown` | `{ selectGroupAt, handlers: {onPointerDown, onPointerMove, onKeyDown} }`                         |
| 5   | `hooks/useHistoryPlayback.ts:50` → `pages/HistoryPage.tsx:59-64,121-124` → `HistoryHeader.tsx:31-43` → `HistoryPlaybackControls` (chamada linha 77) | `isPlaying`, `speedIndex`, `onTogglePlay`, `onCycleSpeed` atravessam **3 camadas sem mudar de forma**             | O tipo já existe implícito em `HistoryHeader.tsx:10-15` — só formalizar e o hook devolver pronto |
| 6   | `hooks/useInviteLinkState.ts:63-76` → `components/share/InviteLinkSection.tsx:86-110`                                                               | 11 campos soltos, relistados em 2 subconjuntos pra `ExistingInviteLinkRow`/`InviteLinkActionsRow`                 | Agrupar por sub-fluxo no próprio hook                                                            |
| 7   | `hooks/useKeyConflicts.ts` (`KeyConflict`) → `DocumentPageModals.tsx:50-69`, `KeyConflictSlot`                                                      | campo a campo renomeado (`email`→`subject`, `identityPub`→`newIdentityPub`, etc.)                                 | ver achado 3.3 abaixo, mesmo cluster em 3 lugares                                                |

**Proposta concreta pro #3 (`useDevices`)**, já que hoje mistura dois fluxos
num objeto achatado:

```ts
return {
	list: { devices, loadError },
	revoke: {
		target: revokeTarget,
		isPending: isRevoking,
		onConfirm: handleRevokeDevice,
		onCancel: () => setRevokeTarget(null),
		onRequest: setRevokeTarget,
	},
	revokeOthers: {
		isConfirmOpen: isRevokeOthersConfirmOpen,
		isPending: isRevokingOthers,
		onConfirm: handleRevokeOtherDevices,
		onCancel: () => setIsRevokeOthersConfirmOpen(false),
		onRequest: () => setIsRevokeOthersConfirmOpen(true),
	},
};
```

### 3.2 Cluster idêntico duplicado em 2+ call sites (não é round-trip, é cópia)

**`AvatarStackPopover` chamado com props idênticas, byte a byte, em dois arquivos**
— verificado, é exato:

`components/vault/DocumentRow.tsx:73-79`:

```tsx
<AvatarStackPopover
	members={activeUsers}
	onlineUserIds={new Set(activeUsers.map((u) => u.user_id))}
	awayUserIds={new Set()}
	avatarSize={26}
	popoverAvatarSize={28}
/>
```

`components/vault/DocumentHeroCard.tsx:69-75` — **mesmo bloco, literalmente**.

O cálculo `new Set(activeUsers.map(...))` / `new Set()` também está
duplicado, não só as props. Extrair uma função `presenceFromActiveUsers(activeUsers)
→ {members, onlineUserIds, awayUserIds}` e uma constante
`AVATAR_STACK_SIZES = {avatarSize: 26, popoverAvatarSize: 28}`, spreadadas
nos dois call sites.

**Achado colateral direto**: a função `presenceFor` (não é prop, é lógica)
está **duplicada verbatim** em `lib/collaborationStatus.ts:7-12` e
`components/AvatarStackPopover.tsx:19-24` — confirmado, mesma assinatura,
mesmo corpo. Isso é DRY quebrado de verdade, resolve deletando uma cópia e
importando a outra.

### 3.3 Cluster "conflito de troca de chave" repetido em 3 call sites

`{subject, newIdentityPub, newSigningPub, onConfirm, onClose}` (o que
`KeyChangeWarning` espera) é montado manualmente, campo a campo, em:

- `components/share/ShareModalOverlays.tsx`, `KeyChangeOverlay`, **2 vezes** (linhas 125-131 e 136-142)
- `components/document/DocumentPageModals.tsx:61-67` (`KeyConflictSlot`)

Existe até um tipo nomeado pro dado de origem (`KeyChangeConflict` em
`lib/shareModalOverlay.ts`), mas nenhum dos 3 call sites o usa como objeto
único — todos desmontam `invitee.identity_pub`/`invitee.signing_pub`/`email`
na mão. Sugestão: um adaptador único `toKeyChangePrompt(conflict) =>
{subject, newIdentityPub, newSigningPub}`, reaproveitado nos 3 lugares.

### 3.4 Cluster "gestão de pasta" idêntico entre dois componentes

`components/vault/VaultSidebar.tsx` — os 6 campos `folders, selectedFolderId,
onFolderSelect, onOpenCreateFolder, onOpenEditFolder, onDeleteFolder` chegam
em `VaultSidebarProps` (linhas 9-24) e atravessam **sem nenhuma alteração**
pra `FoldersSectionProps` (linhas 34-41, uso nas linhas 205-211) — é o mesmo
bloco que `DocumentsPage.tsx:214-219` já monta solto na chamada de
`<VaultSidebar>`. Um único `FolderManagementProps` criado em `DocumentsPage`
e spreadado até `FoldersSection` resolve as 3 camadas de uma vez.

### 3.5 Par `docId, displayTitle` repetido em 3 componentes de `history/`

`components/history/HistoryHeader.tsx:31-33`, `HistoryEmptyState.tsx:8-11` e
`HistoryLoadingState.tsx:7-10` recebem o mesmo par, vindo de
`HistoryPage.tsx:105,109,114-116`. Cluster pequeno (2 campos), mas 3 call
sites idênticos é sinal real — `type HistoryDocRef = {docId, displayTitle}`.

### 3.6 Dois fios do `ShareModalBody` que sobrevivem intactos até o componente-folha

Além do "23 props" já reportado como um bloco só, dá pra nomear dois
subconjuntos que têm forma estável ponta a ponta:

- **Formulário de convite** (`email, onEmailChange, role, onRoleChange,
isPending, error, onSubmit` — 7 campos): sai de `useShareMembers.ts:341-347`
  → atravessa `ShareModalContent` (`ShareModal.tsx:109-115`) → chega em
  `ShareInviteForm` (`ShareModalBody.tsx:73-81`) sem mudar de forma.
- **Lista de membros** (`members, pendingInvites, cancellingInviteId,
onCancelInvite, isOwner, ownUserId, onRequestRemove, loadError,
removeError, grantingUserId, onGrantAccess, onChangeRole` — 12 campos):
  sai de `useShareMembers.ts:335-354` → atravessa `ShareModalBody.tsx:86-99`
  → chega em `ShareMembersList`, que **já declara esse exato shape** como
  `ShareMembersListProps` (`ShareMembersList.tsx:140-153`). Como o
  componente-folha já tem o tipo certo, dava pra `useShareMembers` devolver
  esse subobjeto pronto (`membersList: ShareMembersListProps`) e cortar o
  meio-de-caminho que só relista.

### Sinal fraco — mencionado, não recomendo agir

- `VaultModals.tsx`: `onCreateFolder/onUpdateFolder/onConfirmDeleteFolder` também vêm soltos de `DocumentsPage.tsx:295-297` (mesmo tema do 3.4), mas cada prop tem uso distinto dentro do switch — sinal mais fraco que 3.4.
- `components/settings/*Card.tsx` (Profile/Devices/Identity/Security/Appearance/Language): poucas props (2-4), coesas, sem repetição — nada a fazer.
- `HistoryVersionList.tsx`/`HistoryScrubber.tsx` compartilham `groups`/`selectedIndex`/`selectedId` com `HistoryHeader`, mas cada um usa de forma distinta (índice vs. id) — não reagrupar.

---

## 4. Renderer lookup table (dispatch por `.type`/discriminante)

Busca exaustiva por `switch (` em todo o projeto: **4 ocorrências totais**,
nenhuma nova além das já conhecidas. Busca adicional por cadeias `if/else
if` sobre o mesmo discriminante, e por ternários encadeados (3+) sobre a
mesma variável: nenhum caso de lista heterogênea por `.kind`/`.type` dentro
de `.map()`, nenhuma cadeia de ternário longa — o projeto não abusa desses
dois formatos.

### Recomendo converter

**`components/vault/DocumentRow.tsx:22-38`** (`DocumentRowTitle`) — 3 `if`
sobre `titleState: TitleState = 'ready'|'loading'|'error'`, cada branch só
retorna JSX (skeleton / erro com ícone / `DocumentTitle`). União fechada e
exaustiva — candidato ideal pra `Record<TitleState, (props) => ReactNode>`.

**`components/NewDocumentModal.tsx:206-217`** (`templateTextFor`) — 3 `if` +
fallback sobre `startFrom: StartFrom`, cada branch só faz `return` de uma
string. Não é JSX, mas o formato de dispatch puro por discriminante é
idêntico — mapa de `() => string` por chave funciona igual de bem.

**`lib/vaultDocuments.ts:57-71`** (`sortDocuments`) — 3 branches sobre
`mode: SortMode`, cada um só chama `.sort()` com um comparator diferente.
Com ressalva: não retorna JSX, é uma função utilitária, mas o dispatch é
igualmente puro — `Record<SortMode, Comparator>` e `sorted.sort(comparators[mode])`.

**Os 2 já conhecidos**: `components/vault/VaultModals.tsx:96` e
`components/document/DocumentPageModals.tsx:104` (ambos meus, da sessão
anterior) — mesma recomendação já dada, com a ressalva do cast
`as (m: T) => ReactNode` sendo necessário no ponto de leitura da tabela (ver
relatório anterior pra detalhe da troca exaustividade-do-switch vs.
concisão-da-tabela).

### Não recomendo (checados, motivo específico)

| Local                                                                                              | Motivo                                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `hooks/useScrubberControls.ts:56` (switch em `e.key`)                                              | fallthrough de case (`ArrowLeft`/`ArrowDown` mesmo corpo) — tabela exigiria duplicar a função em 2 chaves    |
| `realtime/provider.ts:306` (`dispatchControlMessage`)                                              | já é 1 linha por case; payloads de tipo diferente por case, mesmo problema de cast sem ganho de concisão     |
| `lib/pendingMemberAccess.ts:26-36`, `useShareMembers.ts:37-42,62-67`, `crypto/authorKeys.ts:39-45` | guard-clause + side effect assíncrono misturado ao dispatch — não é "cada branch retorna um valor"           |
| `lib/collaborationStatus.ts:22-34` (`presenceLabelFor`)                                            | discriminante real só tem 2 branches úteis, e uma condição não relacionada (`typingUserIds.has`) entra antes |
| `lib/collaborationStatus.ts:42-50,58-66` (`syncStatusLabel`/`syncStatusTone`)                      | condição mistura 2 eixos (`status` + `pendingCount`) numa branch — não dá pra indexar só por `status`        |
| `lib/theme.ts:21-28`                                                                               | só 2 branches, não compensa                                                                                  |
| `components/CommandPalette.tsx:83-89`                                                              | handler de teclado com efeito colateral imperativo, mesmo motivo do `useScrubberControls`                    |

---

## 5. Ordem de prioridade recomendada

1. **`crypto/knownKeys.ts` — branded types pra `identityPub`/`signingPub`** (seção 1). Único item desta lista com cenário de segurança real, não só manutenibilidade.
2. **Branded types pros IDs em `api/docTypes.ts`/`api/docs.ts`** (seção 1). Sistêmico, toca quase todo `api/docs.ts` e vários hooks — maior escopo, maior ganho.
3. **`presenceFor` duplicada + `AvatarStackPopover` duplicado** (3.2). Deletar código de verdade, não só reorganizar — ganho imediato, risco mínimo.
4. **`ShareModalBody`/`useShareMembers`** (3.1 #1, 3.6). Maior concentração de round-trip do projeto; já mapeado com shape proposto.
5. **`useDevices`/`SettingsPage`** (3.1 #3) e **`useFindInTextarea`/`EditorContent`** (3.1 #2). Padrão idêntico, hooks pequenos, baixo risco de quebrar algo.
6. **Cluster "key-change conflict" em 3 lugares** (3.3) e **"gestão de pasta"** (3.4). Duplicação real, médio esforço.
7. **`ApiError.code`/`i18n/errors.ts` unificados** (2.2) e **`ROLE_LABEL_KEY`** (2.1). Baixo esforço, fecha um typo-risk real.
8. **Renderer lookup table** nos 5 locais da seção 4. Estilístico — ganho pequeno por local, mas consistente com o padrão já pedido.
9. Resto (2.3, 2.4, 2.5, 3.5, 3.1 #4-6) — baixo risco, fazer quando mexer no arquivo por outro motivo, não vale um PR dedicado.
