# ADR-0009: Dispatch de Domain Events e UnitOfWork com Prisma

- **Status:** Aceito — complementado por [ADR-0025](./0025-dispatcher-de-domain-events-por-instancia.md) (dispatcher de instância no lugar do `DomainEvents` estático)
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.03, T3.05
- **Docs afetados:** [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md), [03-module-anatomy.md](../architecture/03-module-anatomy.md)

## Contexto

O blueprint diz que Domain Events são despachados "em memória dentro da mesma transação do PostgreSQL" (`DomainEvents.dispatchEventsForAggregate`) e que o `UnitOfWork` salva a entidade + o `OutboxEvent` atomicamente. Faltam definir:

1. **Como os repositórios participam da transação** sem receber o `tx` do Prisma como parâmetro (o que vazaria infra para a aplicação).
2. **Quando** os domain events são despachados (antes ou depois do commit).
3. **Quem converte** domain events em integration events (Outbox).

## Opções consideradas

### Transação

- **A1 — `AsyncLocalStorage` (ALS):** `PrismaUnitOfWork.execute(fn)` abre `$transaction` e guarda o `tx` no ALS; os repositórios Prisma usam `this.prisma.client` (getter que devolve o `tx` ativo ou o client raiz). ✅ Use cases e contratos limpos. ❌ "Mágica" implícita, que precisa de testes de integração dedicados.
- **A2 — `tx` explícito no contrato do repositório:** ❌ Vaza infra para `application/`.
- **A3 — Lib `@nestjs-cls/transactional`:** ✅ Pronta, faz o mesmo que A1. ❌ Mais uma dependência; menos controle sobre o hook de Outbox.

### Momento do dispatch

- **B1 — Dentro da transação, antes do commit:** handlers intra-módulo executam na mesma transação ACID (é o que o blueprint descreve). Handlers **não podem** fazer I/O externo.
- **B2 — Depois do commit:** ❌ Perde a atomicidade das regras intra-módulo.

### Domain → Integration

- **C1 — Mapeamento explícito no use case:** o Command chama `uow.addIntegrationEvent(...)`. ✅ Explícito e fácil de revisar.
- **C2 — Subscriber intra-módulo traduz o domain event em integration event e grava no Outbox (dentro da tx).** ✅ Desacopla o use case. ❌ Mais indireção.

## Decisão

Adotar **`A1` (`AsyncLocalStorage`) + `B1` (dispatch antes do commit, dentro da transação) + `C1` (`uow.addIntegrationEvent(...)` explícito no Command como padrão direto, mantendo `DomainEvents` para reações intra-módulo)**:

1. `UnitOfWork.execute(work)`:
   - Abre `prisma.$transaction` e armazena o `tx` no `AsyncLocalStorage` (os repositórios acessam via getter `this.prisma.client`).
   - Executa `work()`.
   - Para cada agregado rastreado (`uow.track(aggregate)`), despacha eventuais `DomainEvents` intra-módulo dentro da mesma transação.
   - Persiste na tabela `outbox_events` todos os `IntegrationEvents` adicionados via `uow.addIntegrationEvent(...)` e executa `pg_notify('outbox_new_event', '')` (conforme [ADR-0007](./0007-outbox-relay.md)).
   - Executa o `COMMIT`.
2. Handlers de `DomainEvent` que precisem de I/O externo são proibidos; qualquer efeito externo ou cross-module ocorre via `IntegrationEvent` (Outbox → Kafka).

## Consequências

- **Ações decorrentes:** testes de integração do UoW (rollback desfaz entidade + outbox; eventos de handlers entram na mesma tx).

## Regras para a IA

1. Use cases nunca recebem nem manipulam `PrismaClient` / `tx`; só usam `UnitOfWork` e contratos de repositório.
2. Todo Command que altera mais de um agregado, ou que emite integration events, executa dentro de `uow.execute`.
3. Handlers de domain event não fazem chamadas HTTP, Kafka, e-mail ou storage.

