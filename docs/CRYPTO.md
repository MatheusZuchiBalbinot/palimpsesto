# Criptografia — design e garantias

Este documento existe porque o código já cita ele o tempo todo: mais de 40 comentários
espalhados pelo backend e pelo frontend apontam pra `docs/CRYPTO.md` como a referência de
por que uma decisão de criptografia foi tomada de um jeito específico. Este arquivo
consolida esse raciocínio num lugar só.

**Regra que define o projeto inteiro**: o servidor nunca pode ler o conteúdo de um
documento. Tudo abaixo existe pra sustentar essa regra — inclusive nas partes onde ela
custa conveniência (login mais lento, um invite que fica "pendente", um dispositivo novo
que precisa da senha de novo).

**Critério de aceite**: se o backend conseguir reconstruir um parágrafo de um documento, o
projeto falhou.

---

## 1. O que o servidor vê, e o que ele nunca vê

O servidor guarda e roteia bytes opacos: autentica contas, resolve quem tem acesso a qual
documento, distribui chaves públicas, retransmite atualizações CRDT já cifradas. Ele nunca
tem, em nenhum momento, a chave que abriria um documento — nem em trânsito, nem em
repouso.

Concretamente, o que passa pelo servidor e o que ele consegue fazer com isso:

| Dado                                                  | O servidor vê                          | O servidor consegue decifrar? |
| ------------------------------------------------------ | --------------------------------------- | ------------------------------ |
| Senha da conta                                        | Nunca — só deriva local, no cliente    | —                               |
| `login_key` (o que autentica)                          | Sim, com hash Argon2id                  | N/A (não é segredo reversível) |
| Chaves privadas de identidade (X25519 + Ed25519)        | Só a versão cifrada com `wrapKey`       | Não                             |
| DEK de um documento                                    | Só cópias seladas, uma por membro       | Não                             |
| Conteúdo de um documento (updates CRDT, título, snapshot) | Só ciphertext                           | Não                             |
| Metadados (quem é membro, papel, quando editou)         | Sim, em claro                           | N/A (não é conteúdo)            |

---

## 2. Hierarquia de chaves

```
senha ──Argon2id(senha, salt_mk)──► MK (nunca sai do navegador)
  MK ──HKDF(info="palimpsesto/login/v1")──► loginKey ──► enviado ao servidor
  MK ──HKDF(info="palimpsesto/wrap/v1")───► wrapKey  ──► cifra as chaves de identidade
```

Fonte: `web/src/crypto/masterKey.ts`.

- **MK (master key)**: `Argon2id(m=64MiB, t=3, p=1, dkLen=32)` sobre a senha e `salt_mk`
  (16 bytes, gerado no cliente na criação da conta, devolvido publicamente pelo
  endpoint `GET /api/auth/salt?email=...`). Deliberadamente lento (~1s) — é o custo de
  memória do Argon2id fazendo o trabalho dele, não um bug pra otimizar.
- **loginKey**: `HKDF-SHA256(MK, info="palimpsesto/login/v1")`. É isso que trafega pro
  servidor no lugar da senha — prova identidade sem permitir derivar `wrapKey` de volta
  (motivo de ter duas derivações da mesma MK em vez de mandar a MK inteira).
- **wrapKey**: `HKDF-SHA256(MK, info="palimpsesto/wrap/v1")`. Nunca sai do navegador —
  só serve pra cifrar/decifrar as chaves privadas de identidade.

**Trade-off aceito conscientemente**: `salt_mk` é público e não-autenticado
(`GetSaltHandler`, `server/internal/application/user/queries/get_salt.go`) — qualquer um
pode perguntar "esse email tem conta?" e descobrir pela resposta. É necessário pro fluxo
funcionar (o cliente precisa da salt antes de autenticar, pra derivar a MK).

O hash de `loginKey` guardado no servidor usa parâmetros Argon2id **independentes**
(`server/internal/domain/user/password.go`: `m=64MiB, t=3, p=1`) — escolhidos de novo do
zero pra essa necessidade específica (hash de senha em repouso), não reaproveitados da
derivação client-side só porque o número bateu.

---

## 3. Chaves de identidade

Cada conta tem um par de identidade de longo prazo, gerado inteiramente no cliente
(`web/src/crypto/identity.ts`):

- **`identityPrivate`/`identityPublic`** (X25519) — pra acordo de chave (ECDH), usado pra
  selar/abrir DEKs de documentos.
- **`signingPrivate`/`signingPublic`** (Ed25519) — pra assinar updates.

As duas curvas nunca reaproveitam a mesma entropia entre si — cada uma recebe seu próprio
segredo aleatório, seguindo a regra "cada chave tem um propósito".

### Onde ficam

- **No servidor**: só a metade pública, em claro (`identity_pub`, `signing_pub`), e a
  metade privada **cifrada com `wrapKey`** (XChaCha20-Poly1305, nonce de 24 bytes por
  cifragem — `web/src/crypto/wrapPrivateKeys.ts`). O servidor guarda e serve esse blob,
  mas sem `wrapKey` nunca consegue abri-lo. É essa cópia cifrada no servidor que permite
  multi-dispositivo: um segundo aparelho, sabendo a senha, redriva `wrapKey` e recupera a
  mesma identidade em vez de gerar uma nova.
- **No dispositivo**: um cache local (IndexedDB, cifrado com uma chave AES-GCM
  não-extraível do WebCrypto — ver `web/src/crypto/identityStore.ts`) evita ter que rodar
  Argon2id e buscar do servidor a cada carregamento de página. É só um atalho — limpar o
  cache (ou trocar de navegador) só significa que o próximo login vai buscar de novo.

Uma falha ao decifrar (senha errada, blob adulterado) sempre vira erro explícito — nunca
cai silenciosamente pra um resultado incorreto (`unwrapPrivateKeys`'s próprio comentário:
"a wrong password needs to surface as 'wrong password'").

---

## 4. O envelope de compartilhamento de documento (DEK)

Cada documento tem sua própria **DEK** (data encryption key, 32 bytes aleatórios,
`web/src/crypto/documentDek.ts`). Compartilhar um documento é, na prática, embrulhar essa
DEK pra cada pessoa com acesso — nunca reescrever o conteúdo.

### Sealed box (`web/src/crypto/sealedBox.ts`)

Pra selar a DEK pra alguém, sem que quem está selando precise ter uma chave de longo prazo
própria:

1. Gera um par X25519 efêmero, descartado logo depois do seal.
2. `shared = X25519(efêmeroPriv, identityPub_do_destinatário)`.
3. `wrapKey_local = HKDF-SHA256(shared, info="palimpsesto/dek-wrap/v1")`.
4. `ciphertext = XChaCha20-Poly1305(wrapKey_local, nonce_aleatório).encrypt(DEK)`.

Resultado guardado: `ephemeral_pub(32) || nonce(24) || ciphertext`. Só quem tem a chave
privada correspondente a `identityPub_do_destinatário` consegue abrir.

### Os três jeitos de alguém ganhar acesso

| Fluxo                        | Quem sela a DEK                              | Estado inicial               |
| ----------------------------- | --------------------------------------------- | ------------------------------ |
| Dono cria o documento         | O próprio dono, pra si mesmo                  | Já com acesso                  |
| Convite por email             | Quem convida, no momento do convite           | Já com acesso ao aceitar       |
| Link de convite (self-service) | Ninguém — não há cliente de quem compartilhou presente | **"Pending"** — `has_wrapped_dek: false` |

O terceiro caso é o único onde `wrapped_dek` fica nulo no servidor. Qualquer membro
existente (não só o dono) pode completar esse wrap depois — basta ter a DEK, que todo
membro já tem (`SetMemberWrappedDEKHandler`). É isso que
`web/src/lib/pendingMemberAccess.ts` faz em segundo plano: reconcilia membros pendentes
sempre que um membro existente carrega a lista e já tem a DEK em mãos.

---

## 5. Cifragem de conteúdo — updates, título, snapshot

Tudo que sai do navegador pra um documento (updates CRDT do Yjs, título, snapshot de
compactação) é cifrado com a DEK do documento, usando **XChaCha20-Poly1305** em todo
lugar (`web/src/crypto/documentCipher.ts`).

### Dados associados (AAD) — por quê

Regra: *sem isso, um servidor malicioso poderia pegar um update cifrado do documento A e
reinjetar no documento B, ou atribuir a autoria errada.* Por isso todo selo liga:

- **Título / snapshot**: `doc_id || key_epoch`.
- **Update**: `doc_id || key_epoch || author_id || seq` (seq: 16 bytes aleatórios,
  gerados por update — cumpre o papel de "número de sequência" já que o servidor só
  atribui o ID real depois de persistir, tarde demais pra estar disponível no momento da
  cifragem).

`device_id` fica de fora do AAD de propósito — ainda não existe uma identidade
multi-dispositivo real pra vincular, e `doc_id + key_epoch + author_id` já cobre as
ameaças de reinjeção entre documentos/autores que importam hoje.

### Assinatura — o que a cifragem sozinha não cobre

Cifrar só prova "alguém que tem a DEK produziu isto" — **todo editor tem a DEK**, então
nada impede um editor de cifrar conteúdo e colocar o `user_id` de *outro* editor no AAD.
Por isso todo update também é assinado com Ed25519 (`signUpdate`/`verifyUpdateSignature`),
sobre `doc_id || key_epoch || author_id || wire_já_cifrado`. Só a `signingPrivate` do
autor verdadeiro produz uma assinatura válida, independente de quem mais tem a DEK.

Formato final de um update na rede: `seq(16) || nonce(24) || ciphertext || signature(64)`.

**O servidor nunca verifica essa assinatura** — não consegue, verificar exigiria a DEK,
que ele nunca tem. `AppendUpdateHandler` só garante que o autor é `editor` (não `reader`)
antes de aceitar a escrita — um controle de autorização, não de autenticidade
criptográfica. Isso significa: um servidor honesto não aceita escritas de um membro
somente-leitura, mas um servidor *malicioso* colluindo com um leitor que também tem a DEK
ainda poderia forjar um ciphertext plausível. A defesa real contra isso é a verificação de
assinatura **client-side**, que roda em todo peer que recebe o update.

---

## 6. Trust-on-first-use (TOFU) e verificação de identidade

O servidor distribui as chaves públicas de todo mundo. Se ele um dia mentir (comprometido,
ou malicioso desde o início), a única defesa client-side é perceber que a chave não é a
mesma que esse navegador já viu antes — e recusar embrulhar qualquer coisa contra ela sem
confirmação explícita.

- **`web/src/crypto/knownKeys.ts`** guarda, por `user_id`, o último `identity_pub`/
  `signing_pub` confiado. `checkKnownKey` só compara; `trustKey` é a única função
  autorizada a gravar, e só depois de confirmação (automática na primeira vez — TOFU — ou
  explícita do usuário depois de um aviso de mudança de chave).
- **Aviso de mudança de chave** (`KeyChangeWarning.tsx`): dispara sempre que uma operação
  de compartilhamento encontraria uma chave diferente da confiada. Nunca prossegue em
  silêncio — o usuário precisa comparar o sigil/fingerprint com a pessoa por outro canal e
  confirmar manualmente antes de `trustKey` gravar a nova chave.
- **`web/src/crypto/authorKeys.ts`** aplica o mesmo TOFU na hora de verificar assinatura
  de updates: resolve a `signing_pub` confiada pro autor; se a chave mudou desde a última
  vez confiada, a assinatura é tratada como **não-verificável** (nunca aceita
  silenciosamente a chave nova).

### Fingerprint e sigilo

- **Fingerprint**: `SHA-256(identity_pub || signing_pub)`, renderizado como 12 grupos de 5
  dígitos decimais — mesmo algoritmo no cliente (`crypto/identity.ts`) e no servidor
  (`server/internal/domain/user/keys.go`), pra sempre baterem.
- **Sigilo** (`web/src/crypto/sigil.ts`): um glifo determinístico derivado do mesmo hash —
  grid 5x5 espelhado horizontalmente (sempre simetria bilateral, mais fácil de comparar a
  olho que um blob aleatório desbalanceado). Documentos também têm sigilo próprio,
  derivado de `SHA-256(DEK)` — dois colaboradores comparando o glifo confirmam que estão
  segurando a mesma chave, sem trocar a chave em si.

Os dois (fingerprint textual + sigilo visual) existem lado a lado sempre — o sigilo é só
um auxílio visual, nunca a única forma de verificação (é inclusive escondido de leitores
de tela, já que o fingerprint ao lado carrega a mesma informação em texto).

---

## 7. Rotação de chave e revogação

Remover a permissão de leitura de alguém **de verdade** (não só a linha de membership)
exige rotacionar a DEK — do contrário, quem já tinha a chave continua conseguindo
decifrar qualquer coisa cifrada com ela no futuro.

`RemoveMemberAndRotate` (`server/internal/domain/document/repository.go`) faz,
atomicamente:

1. Arquiva a `wrapped_dek` atual de cada membro restante no histórico de chaves (pra eles
   continuarem conseguindo decifrar o histórico *anterior* à rotação).
2. Aplica `newWraps` — uma DEK nova, gerada e selada **client-side** pelo dono, uma cópia
   por membro restante, no novo epoch.
3. Remove o membro alvo.
4. Avança o documento pro novo `key_epoch`.

O servidor nunca vê a DEK em texto puro em nenhum passo disso — `newWraps` já chega
pronto, calculado inteiramente no navegador de quem está removendo. `newWraps` precisa
cobrir exatamente o conjunto de membros que sobra depois da remoção, ou o servidor recusa
(`ErrIncompleteRotation`) — ninguém fica sem chave nova por engano.

**Sair por conta própria é diferente**: `LeaveDocument` nunca rotaciona — quem sai já
tinha a DEK, e escolher sair não desfaz retroativamente esse conhecimento (não tem o que
revogar que a rotação resolveria).

### Key ring — decifrando o passado depois de uma rotação

Cada rotação avança o `key_epoch`. Um membro que atravessou uma rotação mantém, no seu key
ring local (`fetchKeyRing`), tanto a DEK atual quanto toda DEK arquivada de epochs
anteriores — updates/snapshots antigos continuam cifrados sob a chave de quando foram
escritos, nunca re-cifrados. `decryptUpdateWithAnyKey`/`decryptSnapshotWithAnyKey` tentam
cada chave do ring até uma autenticar (XChaCha20-Poly1305 rejeita uma chave errada
completamente — tentar todas é seguro, nunca produz um plaintext incorreto por engano).

---

## 8. Compactação (snapshot)

Depois de `SNAPSHOT_THRESHOLD` (200) updates acumulados além do último snapshot (ou desde
a criação), o cliente opcionalmente comprime o log CRDT inteiro num snapshot único
(`web/src/realtime/snapshotChecks.ts`, checado a cada 30s durante uma conexão ativa).

- O snapshot é `Y.encodeStateAsUpdate(doc)` cifrado com a DEK atual (mesmo AAD do título:
  `doc_id || key_epoch`, já que não faz parte do fluxo de anti-replay por update).
- O servidor deleta atomicamente todo `doc_updates` coberto pelo snapshot
  (`CreateSnapshot`) — **best-effort e silencioso**: o servidor não re-deriva nem verifica
  que o snapshot está correto (não consegue — é opaco pra ele), confia que o cliente só
  chama isso depois de já ter aplicado e conseguido reconstruir até o ponto que está
  compactando. Uma falha nessa checagem simplesmente significa que o próximo membro a
  carregar o documento tenta de novo.

---

## 9. Sessão e autenticação (fora da E2EE, mas parte do modelo de confiança)

Não é E2EE — é a camada que decide "quem está falando" antes de qualquer coisa acima
entrar em jogo.

- **Access token**: JWT HS256, 15 minutos, **stateless** — vive só em memória no
  navegador (nunca em `localStorage`), verificado a cada request sem tocar o banco.
- **Refresh token**: guardado no servidor (tabela `sessions`), só o hash SHA-256 —
  **nunca o token bruto**. Cookie `httpOnly`, `Secure`, `SameSite=Strict`, escopado a
  `/api/auth`. Rotaciona a cada uso; reapresentar um token já revogado revoga a `family_id`
  inteira na hora (detecção de roubo — um refresh token reusado nunca é tratado como "só
  mais um refresh", é tratado como sinal de comprometimento).

Ver a política de divulgação de vulnerabilidades em [`SECURITY.md`](../SECURITY.md) pra
como reportar um problema encontrado em qualquer parte disso.

---

## 10. Limitações conhecidas e trade-offs aceitos

Documentadas explicitamente em vez de escondidas:

- **`salt_mk` é público e não-autenticado** — vaza se um email tem conta ou não. Aceito:
  necessário pro fluxo de derivação de chave funcionar antes da autenticação.
- **O servidor não verifica assinatura de update** — só autorização de papel (`editor` vs
  `reader`). Um servidor honesto colluindo com um leitor malicioso que também tem a DEK
  ainda poderia, em teoria, aceitar uma escrita forjada — a defesa real é client-side
  (todo peer que recebe verifica antes de aplicar).
- **`device_id` fora do AAD** — não existe identidade multi-dispositivo real pra vincular
  ainda; `doc_id + key_epoch + author_id` cobre as ameaças de reinjeção que importam hoje.
- **TOFU tem uma janela de confiança inicial** — a primeira vez que uma chave é vista, ela
  é confiada automaticamente. Um servidor malicioso desde o primeiro contato (antes de
  qualquer verificação fora de banda) poderia, em teoria, se estabelecer como
  "confiável" nesse primeiro instante. Mitigado, não eliminado, pelo fingerprint/sigilo
  existirem pra verificação fora de banda a qualquer momento depois.
