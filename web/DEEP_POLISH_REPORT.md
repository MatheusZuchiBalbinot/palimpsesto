# Relatório: polish de nível "big tech" — camadas flutuantes, race conditions, duplicação residual

Investigação focada em três áreas que sobraram fora do `REFACTOR_REPORT.md` anterior (que já
cobriu primitive obsession, grouped props e renderer lookup tables): **coordenação entre
camadas de UI flutuantes** (modais, dropdowns, atalhos globais), **disciplina de race condition**
nos hooks de fetch, e **duplicação de utilitário** que sobrou de escritas independentes do mesmo
código em momentos diferentes. Cada achado tem evidência concreta (arquivo + linha) e, quando
aplicável, um cenário de reprodução real — não é estilismo.

Convenção de prioridade: **Alto** = bug real, reproduzível, com efeito visível para o usuário;
**Médio** = bug real mas de baixo impacto, ou dívida arquitetural que hoje é só sustentada por
disciplina/comentário em vez de pelo compilador; **Baixo** = estilístico, zero risco funcional.

---

## 1. Nenhuma camada flutuante sabe da existência das outras (Alto) [CORRIGIDO]

Quatro arquivos diferentes registram seu próprio listener global de teclado, cada um agindo como
se fosse o único ouvinte na página:

| Arquivo                             | Listener                                  | Ação                                                               |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `hooks/useDialogFocusTrap.ts:56`    | `document.addEventListener('keydown', …)` | Escape fecha o modal atual (`requestClose`); Tab fica preso dentro |
| `components/Dropdown.tsx:65`        | `document.addEventListener('keydown', …)` | Escape fecha o dropdown e devolve foco ao trigger                  |
| `components/CommandPalette.tsx:225` | `window.addEventListener('keydown', …)`   | Ctrl/Cmd+K abre/fecha a paleta, **incondicionalmente**             |
| `hooks/useGlobalShortcuts.ts:67`    | `window.addEventListener('keydown', …)`   | Ctrl+F, Ctrl+Shift+S, Ctrl+/, Ctrl+Shift+H, Ctrl+. — todos globais |

Nenhum dos quatro verifica se já existe uma camada "mais de cima" ativa. Isso já foi encontrado
uma vez nesse projeto — o comentário em `components/share/ShareModalOverlays.tsx:22-30` descreve
literalmente "descoberto via screenshot: dois scrims translúcidos empilhados, com o conteúdo do
primeiro vazando através do segundo" — mas aquela correção resolveu só o conflito _dentro_ do
próprio ShareModal (`hasShareModalOverlay`), não a causa raiz, que é sistêmica.

**Cenário 1 (reproduzível em 2 teclas):** abra qualquer modal em `DocumentPage` (Compartilhar,
excluir comentário, atalhos de teclado) e pressione `Ctrl+K`. `CommandPalette.tsx:223`
(`setIsOpen((v) => !v)`) não checa se outro `<Modal>` já está montado — a paleta abre por cima,
empilhando dois `.modal-overlay` ao mesmo tempo, exatamente o bug que `ShareModalOverlays.tsx` já
tinha corrigido uma vez para um caso específico.

**Cenário 2 (foco escapa do trap):** com qualquer modal do `DocumentPage` aberto, pressione
`Ctrl+F`. `useGlobalShortcuts.ts:36-40` não verifica se um modal está aberto — ele chama
`setIsFindOpen(true)` e depois `findInputRef.current?.focus()`, roubando o foco de dentro do
`useDialogFocusTrap` que acabou de prendê-lo no modal. O trap continua "ativo" (o listener de Tab
ainda está registrado), mas o foco real já não está mais dentro do container — um estado
inconsistente que nenhum dos dois lados sabe que o outro causou.

**Cenário 3 (Escape fecha duas coisas de uma vez):** abra o ShareModal, abra o dropdown de trocar
o papel de um membro (`components/share/ShareMembersList.tsx` → `Dropdown`), pressione Escape uma
vez. `Dropdown.tsx:57-61` fecha o dropdown; mas `useDialogFocusTrap.ts:34-37` (registrado
independentemente, também em `document`, também sem `stopPropagation`) recebe o mesmo evento e
chama `requestClose()` do Modal — fechando o ShareModal inteiro junto. O usuário esperava fechar
só o menu.

### Correção sugerida

Um registro compartilhado de camadas ativas — o mesmo padrão pub-sub que `lib/toast.ts` e
`auth/session.ts` já usam no projeto (estado em módulo + `Set<Listener>`), só que guardando uma
pilha de ids em vez de uma lista de toasts:

```ts
// lib/floatingLayers.ts
const stack: string[] = [];

export function pushLayer(id: string): void {
	stack.push(id);
}
export function popLayer(id: string): void {
	const i = stack.lastIndexOf(id);
	if (i !== -1) stack.splice(i, 1);
}
export function isTopLayer(id: string): boolean {
	return stack[stack.length - 1] === id;
}
```

`Modal` e `Dropdown` chamam `pushLayer`/`popLayer` no mesmo `useEffect` que já monta/desmonta o
listener; cada um dos 4 handlers passa a checar `isTopLayer(meuId)` antes de agir no Escape.
`CommandPalette`/`useGlobalShortcuts` checam `stack.length === 0` antes de abrir qualquer coisa
nova. Não precisa de contexto React nem provider — é module-level, do mesmo jeito que o toast
store já é, então zero mudança de árvore de componentes.

---

## 2. `useDocumentMeta.ts` não tem proteção contra resposta atrasada (Médio-Alto) [CORRIGIDO]

`hooks/useDocumentMeta.ts:44-53` é o hook que carrega `docInfo`/`members`/`comments` — os
primeiros dados que `DocumentPage` busca ao abrir um documento. O efeito depende de `id`:

```ts
useEffect(() => {
	if (!id) return;
	getDocument(id)
		.then(setDocInfo)
		.catch(() => setDocInfo(null));
	refreshMembers();
	refreshComments();
}, [id, refreshMembers, refreshComments]);
```

Nenhuma das três chamadas guarda um `isCancelled`. Compare com o hook irmão
`hooks/useDocumentKeyRing.ts:41-44`, que resolve exatamente este mesmo problema e até documenta o
porquê:

> "Resets on every id change (not just on mount) — DocumentPage doesn't remount between two
> documents under the same route, so without this the previous document's key/status would
> persist into the next one until the new fetch resolves."

`useDocumentMeta.ts` tem a mesma exposição (`id` muda sem remount — navegar de um documento
direto para outro via `CommandPalette` ou um link, sem passar pelo vault) mas não tem a mesma
proteção. **Cenário concreto**: usuário abre o Documento A (rede lenta), navega rapidamente para o
Documento B antes de `getDocument`/`listMembers`/`listComments` de A resolverem. Quando essas
respostas de A chegam — depois que B já carregou e está na tela — `setDocInfo`/`setMembers`/
`setComments` sobrescrevem os dados corretos de B com os dados (potencialmente diferentes) de A.
Numa aplicação E2EE onde `members`/`comments` decidem quem aparece na lista de acesso e o que é
mostrado como comentário, mostrar por alguns instantes a lista de membros ou comentários do
documento _errado_ não é só um glitch visual — é uma leitura de dado do documento errado
enquanto a URL já mostra o documento certo.

Mesma classe de bug, risco bem menor (é só uma lista, autocorrige no próximo refresh):
`hooks/useArchivedDocuments.ts:12-24` e `hooks/useInvites.ts:24-36` — ambos alternam fetch via um
`isActive: boolean` sem guardar contra duas chamadas sobrepostas quando o usuário troca de aba do
vault rapidamente.

### Correção sugerida

Aplicar o mesmo padrão de `useDocumentKeyRing.ts` (`isCancelled` por execução do efeito) nas três
chamadas de `useDocumentMeta.ts`. Para `useArchivedDocuments`/`useInvites`, o mesmo padrão,
opcional dado o baixo impacto — mas se algum desses arquivos for tocado por outro motivo, vale
adicionar.

---

## 3. `bytesToBase64`/`base64ToBytes` reimplementados 3 vezes, byte a byte idênticos (Baixo) [CORRIGIDO]

- `crypto/identity.ts:63-78` — versão canônica, exportada, usada na maior parte do projeto.
- `realtime/provider.ts:429-444` — cópia privada (não exportada) de **ambas** as funções,
  caractere por caractere idêntica à de `crypto/identity.ts`.
- `lib/yjsHistory.ts:11-18` — cópia exportada de `base64ToBytes`, também idêntica, mas **usada
  somente dentro do próprio arquivo** (linhas 109 e 183) — nenhum outro arquivo importa essa
  cópia (confirmado via grep em todo `web/src`); todo mundo que precisa de `base64ToBytes` em
  outro lugar já importa a de `crypto/identity.ts`.

Três implementações do mesmo par de 6 linhas, uma delas efetivamente morta como export público.
Consolidar: `realtime/provider.ts` e `lib/yjsHistory.ts` passam a importar de `crypto/identity.ts`
e suas cópias locais são deletadas.

---

## 4. Ciclo de vida da conexão (`DocProvider`) é 5 campos soltos, não um estado (Médio) [CORRIGIDO]

`realtime/provider.ts`'s `DocProvider` guarda `ws`, `reconnectAttempt`, `reconnectTimer`,
`pingTimer` e `destroyed` como cinco campos de instância independentes (linhas 96-102). O código
já é cuidadoso — cada método comenta explicitamente qual combinação inválida está evitando (ex.:
a guarda `isCurrent()` em `connect()`, linha 240, existe especificamente para um socket velho cujo
evento `close` ainda não disparou; o guard `destroyed` em `handleClose`/`handleMessage` existe
para uma geração antiga do provider entregando dados depois que uma nova já assumiu). Isso
funciona porque quem escreveu documentou cada invariante em prosa — mas são invariantes que o
compilador não conhece: nada impede um contribuidor futuro de, por engano, deixar `pingTimer`
rodando enquanto `ws` já foi trocado, ou de chamar `connect()` duas vezes seguidas sem que
`this.ws === ws` capture a duplicata.

Não é um bug hoje — é dívida sustentada por disciplina em vez de pelo sistema de tipos. Um estado
único, tagged union, tornaria as combinações inválidas irrepresentáveis:

```ts
type ConnState =
	| { phase: 'connecting'; ws: WebSocket }
	| { phase: 'connected'; ws: WebSocket; pingTimer: ReturnType<typeof setInterval> }
	| { phase: 'disconnected'; reconnectTimer: ReturnType<typeof setTimeout>; attempt: number }
	| { phase: 'destroyed' };
```

Esforço real de fazer essa migração é considerável (a classe tem ~20 métodos que leem/escrevem
esses campos) — por isso fica como item de médio prazo, não algo para fazer hoje, mas é
exatamente o tipo de refactor que separa "código que funciona" de "código cujo compilador prova
que funciona".

---

## 5. `UseGlobalShortcutsParams.id` não foi branded (Baixo) [CORRIGIDO]

`hooks/useGlobalShortcuts.ts:9` — `id: string | undefined`, não `DocumentId | undefined`. Sobrou
da leva de branded types de uma sessão anterior: como um `DocumentId` é atribuível ao seu tipo
base `string` sem cast, `DocumentPage.tsx` passando `id: DocumentId` para esse campo compila sem
erro, então o `tsc` nunca acusou. Zero risco hoje (`id` só é usado dentro do hook para montar uma
rota), mas é uma inconsistência que salta aos olhos de quem faz code review depois de ver o resto
do projeto branded — vale fechar por consistência.

---

## 6. Ordem de prioridade recomendada

1. **Registro compartilhado de camadas flutuantes** (seção 1). Único item desta lista com bug
   reproduzível e visível hoje, em 3 cenários distintos, todos com a mesma causa raiz.
2. **`isCancelled` em `useDocumentMeta.ts`** (seção 2). Bug real, silencioso, numa app E2EE onde
   mostrar dado do documento errado por um instante importa mais que na maioria dos apps.
3. **Consolidar `bytesToBase64`/`base64ToBytes`** (seção 3). Esforço mínimo, fecha uma duplicação
   real de verdade.
4. **`UseGlobalShortcutsParams.id` → `DocumentId`** (seção 5). Trivial, resolve junto com o item 1
   se for mexer em `useGlobalShortcuts.ts` de qualquer forma.
5. **Estado formal para `DocProvider`** (seção 4). Maior esforço da lista, sem bug ativo hoje —
   fazer quando for necessário tocar fundo nesse arquivo por outro motivo, ou se o time achar que
   vale o investimento preventivo.
