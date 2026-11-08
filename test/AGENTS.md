# test — estratégia e utilitários de teste (regras locais)

## Níveis (Vitest + SWC, um `project` cada)
| Nível | Arquivo | Alvo | Infra |
|---|---|---|---|
| unit | `src/**/*.spec.ts` (+ `test/architecture`, `test/infra`, `test/scripts`) | domínio, commands, queries, subscribers | nenhuma, 100% em memória |
| int | `src/**/*.int-spec.ts` | repositórios Prisma/Mongo, projectors, UoW, Outbox | `pnpm infra:up` |
| e2e | `test/**/*.e2e-spec.ts` | controllers + fluxo CQRS com o `AppModule` real via `app.inject()` | `pnpm infra:up` |

## Onde fica cada coisa
- `test/setup-{unit,int,e2e}.ts`: setup por nível (isolamento por schema/DB chega na T3.11).
- `test/fakes/`: Fake Gateways (`FakePaymentGateway`, `FakeStorage`, `FakeEventBus`).
- `test/factories/`: builders de entidades e read models (dados com `@faker-js/faker`).
- Importe utilitários de `test/` pelo alias `@/test/*` (ex.: `@/test/factories/...`). **Não** use `@test/*`: o `noUndeclaredDependencies` do Biome lê `@test/x` como pacote npm com escopo e quebra o lint.
- Unit usa repositórios in-memory (`InMemoryWriteRepositories` / `InMemoryReadRepositories`), nunca Prisma/Mongo.
- `test/architecture/`: prova das regras do `arch:check` (fixtures violam de propósito).
- `test/infra/`: guardas de configuração (CI, compose, AGENTS.md).
- `test/scripts/`: roda os `scripts/*.ts` reais com `node` numa cópia do repo em `os.tmpdir()` (nunca na working tree).

## Obrigatórios
- **Anti-vazamento cross-tenant:** todo repositório/query de dado de tenant tem teste que cria dados em 2 organizações e prova que A não lê nem altera B (int, com RLS ativo).
- **Idempotência:** todo projector/consumer tem teste que entrega o mesmo evento 2x (e fora de ordem por `aggregateVersion`) e prova efeito único (ADR-0008).
- Use case: teste os ramos `left` (erro de domínio) e `right`.

## Referência
`src/shared/infra/http/health/health.controller.spec.ts` (unit + DI via SWC) · `test/health.e2e-spec.ts` (e2e) · [10-testing.md](../docs/architecture/10-testing.md).
