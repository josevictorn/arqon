# AGENTS.md

Instruções para agentes de IA neste repositório. **Leia este arquivo inteiro antes de qualquer tarefa.**
Ele é curto de propósito; os detalhes ficam nos links.

## O projeto

Boilerplate SaaS em **NestJS + Fastify** com DDD, Clean/Hexagonal Architecture e **CQRS poliglota**: escrita em PostgreSQL (Prisma) + Outbox → Kafka → Projectors → leitura em MongoDB. Visão geral: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Como trabalhar (obrigatório)

1. Toda mudança nasce de uma task em [`docs/roadmap/`](./docs/roadmap/ROADMAP.md). Sem task, pergunte antes.
2. Siga a skill [`execute-roadmap-task`](./.agents/skills/execute-roadmap-task/SKILL.md): **leia → planeje → aguarde aprovação → implemente → verifique → documente**.
3. Carregue **só** os docs linkados na task. Não leia `docs/architecture/` inteiro.
4. Uma task = uma branch (`task/T<id>-<slug>`) = um PR. Não amplie o escopo; anote ideias em "Follow-ups" no PR.
5. Encontrou uma decisão não coberta? **Pare** e proponha um ADR ([`write-adr`](./.agents/skills/write-adr/SKILL.md)). Não decida em silêncio.
6. Um ADR com status **Proposto** que bloqueia a task = não implemente; peça a decisão.

## Hierarquia de verdade (em caso de conflito)

`ADR Aceito` > `docs/modules/<ctx>/spec.md` & `prd.md` > `docs/architecture/*` > código existente > seu conhecimento prévio.

## Regras inegociáveis

- `domain/` é TypeScript puro: zero imports de framework, ORM, driver, Zod ou outras camadas.
- `application/` depende só de `domain/` e de contratos (abstract classes). Nunca de `infra/` ou `presentation/`.
- Um módulo **nunca** importa arquivos de outro módulo. Comunicação só via `src/shared/contracts` (Facades e Integration Events).
- Use cases retornam `Either<DomainError, T>`; não lançam exceção para erro de negócio esperado.
- Commands escrevem no Postgres via `UnitOfWork` + Outbox. Queries leem **só** do MongoDB/Redis. Ninguém publica no Kafka diretamente.
- Todo projector/consumer é idempotente (ver ADR-0008).
- Toda chamada externa fica em `src/integrations/` atrás de Gateway + ACL + policy de resiliência.
- IDs de entidades, agregados e eventos são **UUIDv7 gerados no domínio** (`UniqueEntityID`); nunca `autoincrement`, `uuid()` do banco ou UUIDv4 (ADR-0014).
- JWT só com **EdDSA (Ed25519) via `jose`**, atrás de `TokenEncrypterGateway`; o refresh token é opaco, nunca JWT. Proibido `HS256`/`RS256` (ADR-0015).
- O tenant ativo vem **por requisição** (`:orgId` ou header `X-Organization-Id`, validado no Redis pelo Guard); nunca do JWT nem do body (ADR-0016).
- Isolamento multi-tenant em 3 camadas: Guard + CASL, `organizationId` explícito em todo `where` de repositório e PostgreSQL RLS via `set_config('app.current_tenant_id', …, true)` (equivale a `SET LOCAL`) aplicado pelo `UnitOfWork` (ADR-0017).
- `IntegrationEvent` segue o envelope do ADR-0019; `eventId`, `tenantId`, `correlationId`, `traceparent` e `actor` são preenchidos via `AsyncLocalStorage`, nunca à mão.
- Contratos de evento nascem em Zod (`defineIntegrationEventContract`) e são a fonte única do JSON Schema no Schema Registry; mudança não `BACKWARD` = nova versão do tópico (ADR-0020).
- Erros de domínio têm `code` + `i18nKey`; nada de mensagens hardcoded. Toda chave existe em `en` **e** `pt-BR`.
- Logs `info`/`warn`/`error` vivem **só nas fronteiras** (Canonical Log Lines em HTTP, Kafka e Circuit Breakers — ver ADR-0013). Em Use Cases, use apenas `LoggerPort.debug()` ou `LogContextPort.set()`. Proibido *log-and-rethrow* e stack trace em erros 4xx de negócio.
- Nunca hardcode `arqon` ou `arqon-boilerplate` em `src/`; use variáveis de ambiente (`APP_NAME`, `APP_SLUG`) para permitir inicialização limpa de novos projetos (ver ADR-0012).
- Proibido: `any` explícito, `console.log` em `src/`, `// @ts-ignore`, `biome-ignore` sem justificativa, desabilitar testes.
- **Nunca faça `git commit` ou `git push`:** deixe todas as alterações na working tree para revisão e commit manual do humano.
- Código, identificadores e mensagens de commit sugeridas em **inglês**. Docs e ADRs em **português**.

## Comandos

Todos são scripts reais do `package.json` (garantido por `test/infra/agents-md.spec.ts`).

| Objetivo | Comando |
|---|---|
| Instalar | `pnpm install` |
| Rodar a API em watch / build / produção | `pnpm dev` / `pnpm build` / `pnpm start` |
| Subir infra `core` (Postgres, Mongo, Redis) / todos os profiles | `pnpm infra:up` / `pnpm infra:up:full` |
| Parar infra (mantém volumes) / parar e **apagar** volumes | `pnpm infra:down` / `pnpm infra:reset` |
| Lint + format (checar / corrigir / só formatar) | `pnpm lint` / `pnpm lint:fix` / `pnpm format` |
| Typecheck | `pnpm typecheck` |
| Regras de arquitetura (ADR-0010) | `pnpm arch:check` |
| Testes unit / int / e2e / todos | `pnpm test:unit` / `pnpm test:int` / `pnpm test:e2e` / `pnpm test` |
| Cobertura (unit) | `pnpm test:cov` |
| Verificação completa (antes do PR) = lint + typecheck + arch + unit | `pnpm verify` |
| Rodar hooks manualmente | `pnpm lefthook run pre-commit` / `pnpm lefthook run pre-push` · `echo "msg" \| pnpm commitlint` |

`test:int` e `test:e2e` exigem `pnpm infra:up` (o CI faz o mesmo com o profile `core`).

## Armadilhas conhecidas

- **`import type` quebra a DI do Nest.** A regra `useImportType` do Biome está desligada de propósito: classes injetadas pelo construtor precisam de import de valor para o `design:paramtypes` existir. Não converta para `import type`.
- **Vitest sem SWC = DI quebrada em silêncio.** O esbuild não emite metadata de decorators; os testes compilam via `unplugin-swc` (`vitest.config.mts`). Não troque o transformer.
- **Onde fica cada teste:** unit `src/**/*.spec.ts`, integração `src/**/*.int-spec.ts`, e2e `test/**/*.e2e-spec.ts`. Fora desses globs o teste não roda.
- **`test/architecture/fixtures/` viola as regras de propósito** (prova o `arch:check`) e é excluído de Biome, `tsc` e dependency-cruiser. Não "conserte" nem importe esses arquivos.
- **MongoDB 8 não sobe em kernel Linux `6.19`–`7.0.13`** (Docker Desktop antigo). Veja "Troubleshooting" no [README](./README.md).
- **Regras por pasta:** `src/shared/core`, `src/modules`, `src/integrations` e `test` têm `AGENTS.md` próprio (com symlinks `CLAUDE.md`/`GEMINI.md`). Leia o da pasta que vai editar.

## Onde está cada coisa

| Preciso de... | Vá em |
|---|---|
| Fluxo de trabalho, DoD, checklist de review | [docs/workflow.md](./docs/workflow.md) |
| Mapa de toda a documentação | [docs/README.md](./docs/README.md) |
| Decisões e o porquê | [docs/decisions/](./docs/decisions/README.md) |
| Requisitos de produto e regras de negócio de um módulo | `docs/modules/<ctx>/prd.md` e `docs/modules/<ctx>/spec.md` |
| Lista de eventos (tópicos, produtores, consumidores) | [docs/events/catalog.md](./docs/events/catalog.md) |
| Vocabulário do domínio | [docs/glossary.md](./docs/glossary.md) |
| Receitas (criar módulo, command, projector...) | [.agents/skills/](./.agents/skills/README.md) |

## Definition of Done (resumo)

`pnpm verify` verde · testes novos cobrindo o comportamento · critérios de aceite da task marcados · ADR criado se houve decisão · docs/spec/catálogo/skills atualizados se algo mudou · ROADMAP atualizado. Detalhes em [docs/workflow.md](./docs/workflow.md#definition-of-done).

