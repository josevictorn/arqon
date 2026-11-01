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
- Erros de domínio têm `code` + `i18nKey`; nada de mensagens hardcoded. Toda chave existe em `en` **e** `pt-BR`.
- Logs `info`/`warn`/`error` vivem **só nas fronteiras** (Canonical Log Lines em HTTP, Kafka e Circuit Breakers — ver ADR-0013). Em Use Cases, use apenas `LoggerPort.debug()` ou `LogContextPort.set()`. Proibido *log-and-rethrow* e stack trace em erros 4xx de negócio.
- Nunca hardcode `arqon` ou `arqon-boilerplate` em `src/`; use variáveis de ambiente (`APP_NAME`, `APP_SLUG`) para permitir inicialização limpa de novos projetos (ver ADR-0012).
- Proibido: `any` explícito, `console.log` em `src/`, `// @ts-ignore`, `biome-ignore` sem justificativa, desabilitar testes.
- **Nunca faça `git commit` ou `git push`:** deixe todas as alterações na working tree para revisão e commit manual do humano.
- Código, identificadores e mensagens de commit sugeridas em **inglês**. Docs e ADRs em **português**.

## Comandos

> Disponíveis após a Fase 1. Até lá, a T1.08 atualiza esta seção com os comandos reais.

| Objetivo | Comando |
|---|---|
| Instalar | `pnpm install` |
| Subir infra (core) | `docker compose --profile core up -d` |
| Lint + format | `pnpm lint` / `pnpm lint:fix` |
| Typecheck | `pnpm typecheck` |
| Regras de arquitetura | `pnpm arch:check` |
| Testes unit / int / e2e | `pnpm test:unit` / `pnpm test:int` / `pnpm test:e2e` |
| Verificação completa (antes do PR) | `pnpm verify` |

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

