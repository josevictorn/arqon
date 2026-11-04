# ADR-0026: `DomainError` não estende `Error`

- **Status:** Aceito
- **Data:** 2026-11-03
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.01
- **Docs afetados:** [T2.01](../roadmap/tasks/T2.01-either-domain-error.md), [07-i18n-and-errors.md](../architecture/07-i18n-and-errors.md), [src/shared/core/AGENTS.md](../../src/shared/core/AGENTS.md)

## Contexto

A classe `DomainError` representa erros de negócio previstos que são devolvidos como **valores** em `Left` de um `Either<DomainError, T>`. Não são lançados.

Em TypeScript, há duas opções de design:

1. `class DomainError extends Error`: permite `instanceof`, `catch` genérico, mas convida ao erro de `throw new DomainError(…)` sem pensar.
2. `class DomainError`: valor puro, sem herança de `Error`.

A decisão afeta três coisas:

- **Segurança de tipo:** se `DomainError` não estende `Error`, fazer `throw new DomainError()` é obviamente um erro (ou sem tipo, ou runtime).
- **Stack trace:** `Error` traz stack trace automático; `DomainError` nunca precisa dele (ADR-0013 proíbe logs com stack em 4xx de negócio).
- **Compatibilidade:** `instanceof Error`, `catch (e: Error)` deixam de funcionar, mas esses padrões não se aplicam aqui.

## Opções consideradas

### Opção A — `DomainError` não estende `Error`
- ✅ Força a devolver erros como valores, nunca lançar; qualquer `throw` é óbvio erro.
- ✅ Sem stack trace; clareza do propósito (valor de erro, não exceção).
- ✅ Sem herança de `Error`; `DomainError` é puro.
- ❌ Diverge de tutoriais e bibliotecas que herdam de `Error`.

### Opção B — `DomainError` estende `Error`
- ✅ Compatível com `instanceof`, `catch` blocks genéricos.
- ❌ Convida ao erro de `throw new DomainError(…)` sem pensar, violando o design de erros-como-valores.
- ❌ Stack trace não serve aqui; traz bagagem desnecessária.

## Decisão

Adotamos a **Opção A**:

`DomainError` é uma classe que **não estende `Error`**. É um **valor puro** devolvido em `Left<DomainError>` de um `Either`. Nunca é lançado.

```typescript
// ✅ Correto
const result: Either<DomainError, User> = left(new WeakPasswordError());

// ❌ Errado (erro óbvio se DomainError não extends Error)
throw new WeakPasswordError();
```

## Consequências

- **Positivas:**
  - A segurança do tipo força o uso correto de `Either`.
  - Não há confusão entre valor de erro e exceção.
  - Stack trace não contamina logs de erro de negócio.
- **Negativas / trade-offs aceitos:**
  - Não é compatível com `instanceof Error` ou `catch (e: Error)`, mas esses padrões não se aplicam aqui.
  - Divergência consciente de tutoriais que herdam de `Error`.
- **Ações decorrentes:**
  - **T2.01:** implementar `DomainError` como classe comum, sem `extends Error`.
  - Se houver caso futuro que exija herança de `Error`, criar novo ADR.

## Regras para a IA

1. `DomainError` é uma classe simples, **não estende `Error`** nem qualquer outra classe de exceção.
2. Nunca herde de `Error` em nenhuma subclasse de `DomainError` (e.g., `WeakPasswordError extends Error`); proibido.
3. Se alguém propuser `throw new DomainError()` ou `throw new WeakPasswordError()`, é erro de design: deve ser `left(error)` em um `Either`.
4. `args` pode incluir dados para debug (e.g., `{ userId: "abc", attemptCount: 3 }`), mas não inclua stack trace ou dados de `Error`.
