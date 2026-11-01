# ADR-0003: Runtime, versões-base e gerenciador de pacotes

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.01, T1.06
- **Docs afetados:** [01-tech-stack.md](../architecture/01-tech-stack.md), [11-code-quality.md](../architecture/11-code-quality.md)

## Contexto

O blueprint usa faixas ambíguas ("Node.js LTS", "NestJS 10/11", "PostgreSQL 16+", "MongoDB 7+") e não define gerenciador de pacotes nem versão do Zod/Prisma. Se isso ficar em aberto, cada agente escolhe uma versão diferente. Em out/2026: Node 26 virou Active LTS (28/10/2026) e Node 24 entrou em Maintenance; o Prisma está na v7 (v8 em RC); `nestjs-zod` v5+ suporta Zod 4; `@nestjs/observe` exige `@nestjs/core` ≥ 11.1.4.

> [!IMPORTANT]
> Confirme as versões exatas no npm/registries ao executar a T1.01. Os dados acima vêm de pesquisa e podem estar imprecisos.

## Opções consideradas (por item)

| Item | Opção recomendada | Alternativa | Observação |
|---|---|---|---|
| Node.js | **24 LTS** (suporte até abr/2028) | 26 LTS (suporte até abr/2029) | Node 26 ainda não possui binários pré-compilados (`prebuilt binaries`) para `librdkafka` (`@confluentinc/kafka-javascript`), o que forçaria compilação C/C++ via `node-gyp`. Node 24 tem binários prontos para `librdkafka` e `argon2` |
| Package manager | **pnpm** (+ `packageManager` via Corepack) | npm, bun | pnpm é rápido, estrito com dependências fantasma e tem bom suporte a workspaces |
| NestJS | **11.x** (≥ 11.1.4) | 10.x | 11 é exigido pelo `@nestjs/observe` |
| TypeScript | **5.x mais recente**, `strict: true`, `noUncheckedIndexedAccess` | — | |
| Zod / nestjs-zod | **Zod 4 + nestjs-zod 5** | Zod 3 | |
| Prisma | **7.x estável** | 8 RC | Não usar RC em boilerplate |
| PostgreSQL | **17** | 16, 18 | Escolher a versão estável mais recente suportada pelo Prisma 7 |
| MongoDB | **8.x** | 7.x | O 7 se aproxima do fim do suporte |
| Redis | **7.x / Valkey 8** | Redis 8 | Atenção à licença do Redis ≥ 7.4 (RSAL/SSPL/AGPL); Valkey é BSD |
| Kafka | **Apache Kafka 4.x (KRaft)** | Redpanda | Ver [ADR-0004](./0004-cliente-kafka.md) |
| Módulos | **CJS** (padrão Nest + SWC) | ESM | ESM em Nest ainda tem atritos com decorators/tooling |
| Estrutura do repo | **Repositório único** (single package) com dois entrypoints (`main.ts` e `main.worker.ts`) | Monorepo (`apps/*`, `packages/*`) | Menor fricção para um boilerplate modular |

## Decisão

Adotar todos os itens da coluna **"Opção recomendada"** (com **Node.js 24 LTS** para garantir compatibilidade com binários pré-compilados de `librdkafka` e `argon2`), fixando versões exatas (`save-exact=true`) no `package.json`, `.nvmrc` / `engines` e `docker-compose.yml`.

## Consequências

- **Ações decorrentes:** atualizar [01-tech-stack.md](../architecture/01-tech-stack.md) com as versões fixadas; configurar Renovate/Dependabot (opcional, T1.07).

## Regras para a IA

1. Use exatamente as versões fixadas no `package.json`. Não faça upgrade de major sem um novo ADR.
2. Use `pnpm` para todos os comandos; nunca gere `package-lock.json` ou `yarn.lock`.

