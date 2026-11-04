# ADR-0024: Manter Zod fora de `src/shared/core`; schemas Zod de eventos vivem em `src/shared/contracts/events/`

- **Status:** Aceito
- **Data:** 2026-11-03
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.05, T4.02
- **Docs afetados:** [ADR-0019](./0019-envelope-integration-event.md), [ADR-0020](./0020-schema-registry-json-schema.md), [ADR-0010](./0010-enforcement-de-arquitetura.md), [02-directory-structure.md](../architecture/02-directory-structure.md), [src/shared/core/AGENTS.md](../../src/shared/core/AGENTS.md), [T2.05](../roadmap/tasks/T2.05-integration-event-envelope-contract.md)

## Contexto

A T2.05 entrega duas peças para os Integration Events:

1. o **tipo** `IntegrationEventEnvelope<TPayload>`, que o [ADR-0019](./0019-envelope-integration-event.md) (regra 1) manda ficar em `src/shared/core/events/`;
2. o helper **`defineIntegrationEventContract`** e o schema Zod do envelope. O [ADR-0020](./0020-schema-registry-json-schema.md) manda os *contratos* ficarem em `src/shared/contracts/events/<ctx>/`, mas não diz onde fica o helper.

O `AGENTS.md` exige que `domain/` seja TypeScript puro, sem Zod. A regra `domain-pure` do `arch:check` ([ADR-0010](./0010-enforcement-de-arquitetura.md)) tem dois limites:

- vale só para pastas `domain/` (`src/shared/core/domain/` e `src/modules/*/domain/`), não para `src/shared/core/events/`;
- checa só **imports diretos**.

Os `domain/` dos módulos importam `src/shared/core/events/domain-event.ts` (T2.03). Se o código Zod morasse na mesma pasta (por um *barrel* `index.ts` ou por derivar o tipo do envelope com `z.infer`), o Zod chegaria ao domínio de forma transitiva, sem nenhuma falha no `arch:check`.

## Opções consideradas

### Opção A — Zod só em `src/shared/contracts/events/`; `shared/core` 100% sem Zod
- ✅ A pureza do domínio fica garantida pela estrutura de pastas, sem depender de disciplina: nada que o domínio importa de `shared/core` pode puxar Zod.
- ✅ O helper fica junto dos contratos que o usam (ADR-0020). Os consumidores (Commands, projectors, Outbox, Schema Registry) estão em `application/` e `infra/`, onde o Zod é permitido.
- ❌ O envelope passa a ter **duas definições**: a interface TS em `core` e o schema Zod em `contracts`. Mitigado por um teste de tipo que exige equivalência exata entre elas.

### Opção B — Helper e schema Zod em `src/shared/core/events/`
- ✅ Tudo de evento num só lugar, com o envelope definido uma única vez (`z.infer`).
- ❌ `shared/core` ganha dependência de Zod. Protegê-lo depende de não criar *barrel* nem importar o arquivo errado, e o `arch:check` não detecta o deslize.

### Opção C — Opção B + regra transitiva (`reachable`) no dependency-cruiser
- ✅ Fecharia o furo da Opção B.
- ❌ Exige reescrever regras do ADR-0010 e é mais difícil de explicar nas mensagens de erro do que simplesmente não ter Zod no `core`.

## Decisão

Adotamos a **Opção A**:

1. **`src/shared/core/**` não importa `zod`**, em nenhuma subpasta (`domain/`, `events/`, `logic/`, `errors/`).
2. `src/shared/core/events/integration-event.ts` contém só tipos TypeScript (`IntegrationEventEnvelope`, `EventActorMetadata`, `ActorType`) e a constante `ACTOR_TYPES` (`as const`). A lista de `actorType` é reaproveitada pelo Zod, sem ser repetida.
3. Em `src/shared/contracts/events/` ficam:
   - `integration-event-envelope.schema.ts`: o schema Zod do envelope (`z.object(...).readonly()`);
   - `define-integration-event-contract.ts`: o helper;
   - os contratos por contexto (`<ctx>/<aggregate>-<action>.v<N>.event.ts`), como já previa o ADR-0020.
4. **Equivalência obrigatória:** um teste de tipo (`expectTypeOf(...).toEqualTypeOf(...)`, checado pelo `pnpm typecheck`) exige que `z.infer` do schema Zod do envelope seja **idêntico** a `IntegrationEventEnvelope<TPayload>`, incluindo `readonly` e `null` × `undefined`.
5. **Verificação automática:** um teste em `test/architecture/` (Opção C pontual já prevista no ADR-0010, sem alterar o `.dependency-cruiser.cjs`) falha se:
   - algum arquivo em `src/shared/core/**` importar `zod`;
   - algum arquivo em `src/**/domain/**` importar `src/shared/contracts/events/**`.

## Consequências

- **Positivas:**
  - `shared/core` continua sem dependência de runtime além de built-ins do Node e do `uuid`, restrito a `UniqueEntityID` ([ADR-0027](./0027-uuidv7-com-biblioteca-uuid.md)).
  - O domínio não alcança Zod nem diretamente nem por tabela.
- **Negativas / trade-offs aceitos:**
  - Duas definições do envelope (cerca de 15 campos). Divergências quebram o `typecheck`, e o envelope só muda via novo ADR (ADR-0019).
  - A equivalência é de **tipos**: regras de formato (UUIDv7, ISO 8601 com `Z`) existem só no Zod e são cobertas pelos testes de runtime da T2.05.
- **Ações decorrentes:**
  - **T2.05:** implementar os itens 2–5 da Decisão.
  - `src/shared/core/AGENTS.md` e [02-directory-structure.md](../architecture/02-directory-structure.md) atualizados com a regra e os arquivos.

## Regras para a IA

1. Nunca importe `zod` em `src/shared/core/**`. Validação em runtime de VOs do domínio usa `Either`; schemas Zod de eventos ficam em `src/shared/contracts/events/`.
2. Nunca derive `IntegrationEventEnvelope` com `z.infer`. A interface TS em `shared/core/events/` é a referência, e o schema Zod é verificado contra ela pelo teste de tipo.
3. Ao mudar o envelope (só via novo ADR), altere a interface **e** o schema Zod no mesmo PR.
4. `domain/` nunca importa `src/shared/contracts/events/`. Domain Events são internos; a tradução para Integration Event acontece no Command (`uow.addIntegrationEvent`, ADR-0009).
