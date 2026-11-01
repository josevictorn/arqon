# Mapa da Documentação

| Pasta / arquivo | Pergunta que responde | Público principal |
|---|---|---|
| [`/AGENTS.md`](../AGENTS.md) | Quais regras sigo sempre? Quais comandos rodo? | IA |
| [`/ARCHITECTURE.md`](../ARCHITECTURE.md) | Qual é a visão geral? Por onde começo? | Humano + IA |
| [`workflow.md`](./workflow.md) | Como as tasks são executadas, revisadas e encerradas? | Humano |
| [`architecture/`](./architecture/) | Como cada parte técnica funciona (CQRS, eventos, CASL...)? | IA (sob demanda) + Humano |
| [`decisions/`](./decisions/README.md) | **Por que** foi decidido assim? O que ainda está em aberto? | **Humano** + IA |
| [`modules/<ctx>/prd.md`](./modules/) | **Produto & Negócio:** jornadas do usuário, requisitos funcionais, referências de mercado e casos de borda | **Humano** + IA |
| [`modules/<ctx>/spec.md`](./modules/) | **Engenharia & DDD:** agregados, invariantes, commands, queries, eventos, schemas e endpoints | Humano + IA |
| [`events/catalog.md`](./events/catalog.md) | Quais eventos existem, quem produz e quem consome? | Humano + IA |
| [`glossary.md`](./glossary.md) | O que significa cada termo do domínio? | Humano + IA |
| [`roadmap/`](./roadmap/ROADMAP.md) | O que falta fazer, em que ordem, e qual o status? | Humano + IA |
| [`/.agents/skills/`](../.agents/skills/README.md) | Como executo uma tarefa recorrente passo a passo? | IA |

## Arquitetura por tema

| Arquivo | Conteúdo |
|---|---|
| [00-principles.md](./architecture/00-principles.md) | Princípios inegociáveis |
| [01-tech-stack.md](./architecture/01-tech-stack.md) | Stack e bibliotecas |
| [02-directory-structure.md](./architecture/02-directory-structure.md) | Árvore completa de diretórios |
| [03-module-anatomy.md](./architecture/03-module-anatomy.md) | Estrutura interna de um módulo + regras de dependência |
| [04-cqrs-and-events.md](./architecture/04-cqrs-and-events.md) | CQRS poliglota, Outbox, Kafka, Projectors, Facades, versionamento |
| [05-integrations-resilience.md](./architecture/05-integrations-resilience.md) | Gateway + ACL + Factory, resiliência, rate limit |
| [06-security-tenancy-casl.md](./architecture/06-security-tenancy-casl.md) | Auth, JWT, multi-tenancy, cargos dinâmicos, CASL |
| [07-i18n-and-errors.md](./architecture/07-i18n-and-errors.md) | `DomainError`, i18n, Problem Details |
| [08-api-docs.md](./architecture/08-api-docs.md) | Zod + Scalar |
| [09-observability.md](./architecture/09-observability.md) | Logs, traces, métricas, health |
| [10-testing.md](./architecture/10-testing.md) | Níveis de teste |
| [11-code-quality.md](./architecture/11-code-quality.md) | Biome, Lefthook, Docker Compose |

## Manutenção

- Um ADR aceito que altera um tema → atualize o arquivo de arquitetura correspondente **no mesmo PR** e linke o ADR.
- Docs desatualizados são bugs. Se notar divergência entre doc e código, abra um follow-up ou corrija.

