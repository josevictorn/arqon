# ADR-0010: Enforcement automático das regras de arquitetura

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.05, T1.07
- **Docs afetados:** [03-module-anatomy.md](../architecture/03-module-anatomy.md), [00-principles.md](../architecture/00-principles.md)

## Contexto

As regras mais importantes do blueprint são de dependência:

- `domain/` não importa nada externo.
- `application/` não importa `infra/` nem `presentation/`.
- Um módulo não importa internals de outro módulo (só `shared/contracts`).
- `shared/core` não depende de framework.

Agentes de IA violam esse tipo de regra com frequência e de forma silenciosa. Documentar não basta: o build precisa quebrar.

## Opções consideradas

### Opção A — `dependency-cruiser`
- ✅ Regras declarativas por regex de caminho (camadas, módulos, pacotes proibidos por pasta), relatório legível, gráfico, roda no CI e no pre-push.
- ❌ Uma ferramenta a mais.

### Opção B — `noRestrictedImports` do Biome
- ✅ Já está no stack.
- ❌ Configuração por pasta é limitada; não expressa bem "módulo X não importa módulo Y".

### Opção C — Testes de arquitetura em Vitest (ex.: `ts-morph`, ArchUnitTS)
- ✅ Muito expressivo; pode validar também convenções de nome (ex.: `*.command.ts` exporta uma classe `*Command`).
- ❌ Mais código para manter.

## Decisão

Adotar **Opção A (`dependency-cruiser` para fronteiras de camadas e módulos) + Opção C pontual (testes em Vitest)**, rodando no `pre-push` e no CI (`pnpm arch:check`).

Regras obrigatórias:

| Regra | De | Não pode importar |
|---|---|---|
| `domain-pure` | `src/**/domain/**` | `@nestjs/*`, `@prisma/*`, `mongodb`, `ioredis`, cliente Kafka, `zod`, `**/application/**`, `**/infra/**`, `**/presentation/**` |
| `application-no-infra` | `src/**/application/**` | `**/infra/**`, `**/presentation/**`, `@prisma/*`, `mongodb`, `ioredis`, cliente Kafka |
| `no-cross-module` | `src/modules/<A>/**` | `src/modules/<B>/**` (B ≠ A) |
| `core-framework-free` | `src/shared/core/**` | `@nestjs/*` e qualquer lib de infra |
| `integrations-isolated` | `src/modules/**` | `src/integrations/*/providers/**` (só contratos) |
| `no-circular` | `src/**` | ciclos |

> [!NOTE]
> Pragmatismo de DI: `application/` pode importar `@Injectable()` de `@nestjs/common` (e `@casl/ability` para avaliação de policies), mantendo `domain/` e `shared/core/` 100% livres de qualquer import do NestJS.

## Regras para a IA

1. `pnpm arch:check` precisa passar antes de abrir o PR.
2. Nunca adicione exceções ao `.dependency-cruiser.cjs` sem um ADR.

