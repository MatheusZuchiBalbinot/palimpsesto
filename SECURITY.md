# Política de segurança

O Palimpsesto é um editor colaborativo com criptografia de ponta a ponta (E2EE) — o
servidor nunca deve conseguir ler o conteúdo de um documento. Ver
[`docs/CRYPTO.md`](docs/CRYPTO.md) pro design completo (hierarquia de chaves, envelope de
compartilhamento, rotação) e [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pro resto do
sistema.

## Reportando uma vulnerabilidade

**Não abra uma issue pública** pra uma vulnerabilidade de segurança — isso divulga o
problema antes de existir uma correção.

Em vez disso, use o **[GitHub Security Advisories](https://github.com/MatheusZuchiBalbinot/palimpsesto/security/advisories/new)**
deste repositório (aba "Security" → "Report a vulnerability") — o relato chega privado,
direto pro mantenedor, sem precisar publicar nenhum endereço de contato aqui. Inclua:

- Uma descrição do problema e o impacto (o que um atacante consegue fazer).
- Passos pra reproduzir, ou uma prova de conceito.
- Se souber, qual parte do sistema está envolvida (backend, frontend, protocolo
  WebSocket, criptografia client-side).

Nenhum prazo formal de correção é prometido ainda (projeto individual, sem equipe de
segurança dedicada), mas todo relato é levado a sério e tratado com prioridade
proporcional à severidade.

## O que está no escopo

- O backend (`server/`) — autenticação, autorização, lógica de negócio, a API REST e o
  protocolo de WebSocket.
- O frontend (`web/`) — em especial qualquer coisa em `web/src/crypto/`, `web/src/auth/`
  e `web/src/realtime/`.
- A infraestrutura de deploy neste repositório (`docker-compose*.yml`, `Dockerfile`,
  `nginx.conf.template`).

## O que está fora do escopo

- Ataques que exigem acesso físico ao dispositivo do usuário já autenticado.
- Engenharia social contra usuários (phishing, etc.) — fora do controle do software em si.
- Vulnerabilidades em dependências de terceiros sem um caminho de exploração concreto
  específico deste projeto (reporte direto ao mantenedor da dependência primeiro).

## Por que isso importa especificamente aqui

Numa aplicação E2EE, o modelo de ameaça inclui explicitamente "e se o servidor for
comprometido, ou for malicioso desde o início" — ver
[`docs/CRYPTO.md`](docs/CRYPTO.md#1-o-que-o-servidor-vê-e-o-que-ele-nunca-vê). Um relato
que demonstre que o servidor consegue, de alguma forma, acessar conteúdo em claro de um
documento é o tipo de achado mais sério que este projeto pode receber — trate como
prioridade máxima ao reportar.
