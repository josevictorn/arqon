# ADR-0028: `pnpm verify` roda `test:cov` com gate de cobertura 100% em `src/shared/core/**`

- **Status:** Aceito
- **Data:** 2026-11-03
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.01
- **Docs afetados:** [T2.01](../roadmap/tasks/T2.01-either-domain-error.md), [AGENTS.md](../../AGENTS.md)

## Contexto

O comando `pnpm verify` é o gate de qualidade que roda antes do push (pre-push hook). Atualmente é:

```bash
lint + typecheck + arch:check + test:unit
```

A task T2.01 introduz o requirement de **100% de cobertura de linha/branch/function em `src/shared/core/**`** via `vitest.config.mts`:

```typescript
coverage: {
  thresholds: {
    'src/shared/core/**': { lines: 100, branches: 100, functions: 100, statements: 100 }
  }
}
```

Há duas formas de garantir isso:

1. **`pnpm verify` roda `test:cov`** (no lugar de `test:unit`): gate semanal + pre-push rápido, mas pre-push fica mais lento (~5–10s extras por cobertura v8).
2. **`pnpm verify` roda `test:unit`; cobertura é passo separado no CI**: pre-push rápido, mas gate mais fraco localmente; developer só descobre na CI que quebrou a cobertura.

## Opções consideradas

### Opção A — `verify` roda `test:unit` (sem cobertura local)
- ✅ Pre-push rápido (lint + typecheck + arch + test).
- ✅ CI detecta cobertura; gate forte na integração.
- ❌ Developer descobre o problema no CI, não localmente.
- ❌ Mais feedback loop: push → CI → falha → fix → push novamente.

### Opção B — `verify` roda `test:cov` com gate 100% (recomendado)
- ✅ Gate local: developer vê logo se quebrou cobertura.
- ✅ Menos PRs rejeitadas; feedback mais rápido.
- ✅ Força disciplina de testes bem cedo.
- ❌ Pre-push um pouco mais lento (~5–10s por cobertura v8 do Vitest).
- ❌ Se inviável (muito lento), alternativa é criar passo separado no CI.

## Decisão

Adotamos a **Opção B**:

`pnpm verify` passa a rodar:

```bash
lint + typecheck + arch:check + test:cov (com gate 100% em src/shared/core/**)
```

O threshold é aplicado **só em `src/shared/core/**`**, não em todo o projeto (outros módulos podem vir com cobertura menor inicialmente).

## Consequências

- **Positivas:**
  - Gate local: developer vê cobertura quebrada antes do push.
  - Força qualidade desde o início em um bloco crítico (`shared/core` é base de tudo).
  - Menos PRs rejeitadas por falta de cobertura.
- **Negativas / trade-offs aceitos:**
  - Pre-push fica ~5–10s mais lento por causa de cobertura v8.
  - Se virar inviável, alternativa anotada em Follow-ups é mover `test:cov` para CI apenas.
- **Ações decorrentes:**
  - **T2.01:** atualizar scripts do `AGENTS.md` para mostrar `pnpm verify` = `test:cov`.
  - Documentar no AGENTS.md que o gate é só em `src/shared/core/**` (outros módulos podem vir depois).

## Regras para a IA

1. `pnpm verify` roda `test:cov`, não `test:unit`. Localmente é obrigatório 100% em `src/shared/core/**`.
2. Se um arquivo em `src/shared/core/**` fica abaixo de 100%, o pre-push falha.
3. Arquivos com zero linhas de código (só tipos) podem ser excluídos explicitamente no `coverage.include`; justifique no PR.
4. Não baixe o threshold de 100% sem novo ADR.
5. Se `test:cov` ficar inviável (muito lento), anotado em Follow-ups do PR a alternativa de mover para CI.
