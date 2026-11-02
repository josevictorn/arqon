# src/modules — bounded contexts (regras locais)

## Antes de codar
- Leia `docs/modules/<ctx>/prd.md` (o quê/por quê) e `docs/modules/<ctx>/spec.md` (regras, invariantes, eventos). Regra que não está na spec = pergunte, não invente.
- Evento novo ou alterado → atualize [docs/events/catalog.md](../../docs/events/catalog.md) no mesmo PR.

## Anatomia (fixa para todo módulo)
`domain/` (entities, value-objects, events, factories, services, errors) · `application/` (repositories, read-models, facades, use-cases/commands|queries, projectors, subscribers, policies) · `infra/persistence/` (`prisma/` escrita, `mongodb/` leitura) · `presentation/` (`http/`, `consumers/`) · `<ctx>.module.ts`. Detalhes: [03-module-anatomy.md](../../docs/architecture/03-module-anatomy.md).

## Nomes de arquivo (kebab-case + sufixo)
- `create-subscription.command.ts` · `get-billing-overview.query.ts` · `billing-overview.projector.ts` · `invoice-paid.subscriber.ts`
- Contrato de repositório (abstract class) em `application/repositories/`; implementação `Prisma*`/`Mongo*` em `infra/persistence/`.

## Multi-tenant (ADR-0017)
- Agregado de tenant carrega `organizationId`; **todo** método de repositório recebe `organizationId` explícito e o usa no `where`. Nada de `findById(id)` solto para dados de tenant.
- Tabela nova de tenant = migration com `ENABLE` + `FORCE ROW LEVEL SECURITY` e a policy padrão do ADR-0017.
- Ação de usuário passa por policy CASL do módulo (`application/policies/`) com `subject()`.

## Fronteiras
- Outro módulo só via `src/shared/contracts` (Facade síncrona ou Integration Event). Import de `src/modules/<outro>/` reprova no `arch:check` (`no-cross-module`).
- `<ctx>.module.ts` exporta **apenas** a implementação do Facade contract.
- Módulo depende do Gateway em `src/integrations/<x>/contracts`, nunca de `providers/`.

## Referência
`src/modules/iam` a partir da F6 (até lá: [03-module-anatomy.md](../../docs/architecture/03-module-anatomy.md) e os exemplos de [04-cqrs-and-events.md](../../docs/architecture/04-cqrs-and-events.md)).
