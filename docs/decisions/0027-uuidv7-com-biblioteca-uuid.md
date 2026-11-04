# ADR-0027: Gerar UUIDv7 com a biblioteca `uuid`, encapsulada em `UniqueEntityID`

- **Status:** Aceito
- **Data:** 2026-11-03
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.02
- **Docs afetados:** [ADR-0014](./0014-identificadores-uuidv7.md), [ADR-0024](./0024-zod-fora-do-shared-core.md), [T2.02](../roadmap/tasks/T2.02-unique-entity-id-entity-value-object.md), [src/shared/core/AGENTS.md](../../src/shared/core/AGENTS.md)

## Contexto

O [ADR-0014](./0014-identificadores-uuidv7.md) decide **o quê**: IDs são UUIDv7 (RFC 9562) gerados no domínio por `UniqueEntityID`. Falta decidir **como** gerar: implementação própria ou biblioteca.

Exigências da T2.02:

- **monotonicidade** no mesmo processo (IDs gerados no mesmo milissegundo saem em ordem crescente);
- validar formato **e** versão 7 em `UniqueEntityID.parse`;
- 100% de cobertura em `src/shared/core/**`.

Restrição do projeto: o `tsconfig` compila para `module: commonjs` com `moduleResolution: node`. A versão atual do `uuid` (`14.0.3`) é **só ESM** (`"type": "module"`).

Verificação feita em 2026-11-03, num projeto isolado com o mesmo `tsconfig`: `import { v7, validate, version } from 'uuid'` passa no `tsc`, roda em Node 22.23 (o `require()` de módulo ESM é suportado sem flag desde o Node 22.12, e o ADR-0003 fixa Node 24), e 10 000 chamadas de `v7()` saem em ordem estritamente crescente.

## Opções consideradas

### Opção A — Implementação própria com `node:crypto`
- ✅ Nenhuma dependência nova.
- ❌ São cerca de 40 linhas de manipulação de bits (timestamp de 48 bits, versão, variante e contador da RFC 9562 §6.2). Um bug ali corrompe todos os IDs do sistema.
- ❌ Exige testes próprios para casos difíceis, como o estouro do contador e o relógio voltando no tempo.

### Opção B — `crypto.randomUUIDv7()` nativo do Node
- ✅ Nenhuma dependência nova e nenhuma implementação própria.
- ❌ **Não é monotônico dentro do mesmo milissegundo:** depois do timestamp vêm só bits aleatórios. Num teste de 100 000 IDs no Node 24.22, 49 971 saíram fora de ordem. Isso quebra a exigência de ordem da T2.02.
- ❌ Não existe no Node 22, e parte do time ainda desenvolve nele.

### Opção C — Biblioteca `uuid` (`v7`, `validate`, `version`)
- ✅ Implementação mais simples: `v7()` já é monotônico, e `validate` + `version` resolvem o `parse`.
- ✅ Biblioteca amplamente usada e testada, com os casos difíceis da RFC já tratados.
- ❌ Primeira dependência de runtime do `shared/core`.
- ❌ A versão atual é só ESM e depende do `require()` de ESM do Node (≥ 22.12) enquanto o projeto for CommonJS.

## Decisão

Adotamos a **Opção C**, pela facilidade de implementação e por ser a única opção simples que é monotônica:

1. Adicionar `uuid` com **versão exata** (`14.0.3`, conforme ADR-0003) em `dependencies`. Atualizações de patch e minor seguem o Dependabot (ADR-0022); major exige ADR.
2. **Só `src/shared/core/domain/unique-entity-id.ts` importa `uuid`.** O resto do código (domínio, aplicação, infra e testes) gera e valida IDs apenas por `UniqueEntityID`. Assim, trocar a lib é uma mudança de um arquivo só.
3. Mapeamento:
   - `UniqueEntityID.create()` usa `v7()`;
   - `UniqueEntityID.parse(value)` usa `validate(value) && version(value) === 7`;
   - testes com relógio determinístico usam a opção `msecs` de `v7`, sem expor isso como API de produção.

## Consequências

- **Positivas:**
  - Implementação da T2.02 bem menor, e a cobertura de 100% fica trivial.
  - Monotonicidade e formato garantidos por uma lib madura.
- **Negativas / trade-offs aceitos:**
  - `shared/core` passa a ter uma dependência de runtime, permitida pela regra `core-framework-free` porque não é framework nem infra.
  - Enquanto o projeto for CommonJS, o carregamento depende do `require()` de ESM do Node. Se isso quebrar (ex.: troca de runtime), a saída é fixar a linha `11.x` (dual CJS/ESM) ou voltar à Opção A, com novo ADR.
  - O contador monotônico da lib é estado do processo. Isso é esperado: a ordem entre réplicas vale só por milissegundo, o que basta para a localidade do B-Tree (ADR-0014).
- **Ações decorrentes:**
  - **T2.02:** adicionar a dependência e implementar o item 3 da Decisão.
  - [ADR-0024](./0024-zod-fora-do-shared-core.md): a frase "sem dependência de runtime além de built-ins do Node" passa a incluir o `uuid`.

## Regras para a IA

1. Só `src/shared/core/domain/unique-entity-id.ts` importa `uuid`. Em qualquer outro lugar, use `UniqueEntityID.create()` / `parse()` / `restore()`.
2. Nunca use `v4()`, `crypto.randomUUID()` (que gera v4) nem `uuid()` do banco (ADR-0014).
3. Mantenha a versão exata no `package.json`. Major do `uuid` só com novo ADR (ADR-0022).
4. Não reimplemente a geração de UUIDv7 à mão sem um ADR que substitua este.
