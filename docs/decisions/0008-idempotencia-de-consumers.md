# ADR-0008: Idempotência de consumers e projectors (co-localizada com o efeito)

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.05, T4.05, T6.06, T7.06, T8.07
- **Docs afetados:** [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md)

## Contexto

O Kafka entrega *at-least-once*, então todo consumer precisa ser idempotente. O blueprint era ambíguo sobre **onde** ficava o controle:

- O diagrama do §5.6 mostrava o consumer verificando `processed_events` **no Postgres** e depois atualizando a view **no Mongo**. Como são dois bancos sem transação distribuída, um crash entre os dois causaria reprocessamento e duplicação de `$inc` / `$push`.
- O §5.4 falava em validar `version` / `occurredAt` contra o documento do Mongo.
- O §2 citava Redis para "controle de idempotência rápida".

Há dois tipos de consumidor com necessidades diferentes:
1. **Projectors** (escrevem Views no MongoDB).
2. **Subscribers/handlers de negócio** (escrevem no PostgreSQL ou acionam provedores externos como e-mail).

## Opções consideradas

### Opção A — Idempotência **co-localizada com o efeito** (Atômica no próprio banco de destino)
- **Nos Projectors do MongoDB (`BaseProjector`):** o próprio documento da View guarda o array limitado `_processedEventIds` (`$slice: -200`) e o `updateOne` inclui o filtro `{ _id, _processedEventIds: { $ne: eventId } }` junto com `$push: { _processedEventIds: { $each: [eventId], $slice: -200 } }`. Verificação e mutação ocorrem em **1 único round-trip e de forma 100% atômica** no MongoDB.
- **Nos Subscribers que escrevem no PostgreSQL (`BaseSubscriber`):** `INSERT INTO processed_events (consumer_name, event_id, processed_at)` **dentro da mesma transação ACID** do efeito (`PrismaUnitOfWork`), com `UNIQUE (consumer_name, event_id)`.
- **Em efeitos externos (ex.: envio de e-mail):** envia `eventId` como chave de idempotência (`Idempotency-Key` / `X-Entity-Ref-ID`) ao provedor e registra em `processed_events` no PostgreSQL.
- ✅ 100% atômico com o efeito; funciona para projeções cross-module (onde eventos vêm de agregados diferentes).
- ❌ Dois mecanismos internos, porém totalmente encapsulados em `BaseProjector` e `BaseSubscriber`.

### Opção B — Tabela/coleção central `processed_events` + Redis
- ✅ Mecanismo único.
- ❌ Não é atômico quando o efeito ocorre em outro banco (ex.: gravar flag no Postgres e atualizar View no Mongo).

## Decisão

Adotar a **Opção A (Idempotência co-localizada com o efeito)**, encapsulada nas classes base `BaseProjector` (MongoDB) e `BaseSubscriber` (PostgreSQL + `PrismaUnitOfWork`). O Redis pode ser usado apenas como otimização opcional de curto prazo, nunca como fonte da verdade de idempotência.

## Consequências

- **Ações decorrentes:**
  - O envelope do Integration Event (T2.05) inclui obrigatoriamente `eventId` (UUIDv7), `aggregateId`, `aggregateVersion`, `occurredAt`, `traceparent` e `tenantId`.
  - A tabela `processed_events` (`consumer_name`, `event_id`, `processed_at`) entra no schema do Prisma (T3.05 / T4.05).
  - Atualizar o diagrama do §5.6 em [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md).

## Regras para a IA

1. Todo projector estende `BaseProjector` e utiliza o helper atômico de update idempotente (`_processedEventIds: { $ne: event.eventId }`); nunca faça `updateOne` direto na collection sem a guarda de idempotência.
2. Todo subscriber com escrita no PostgreSQL estende `BaseSubscriber` e registra `(consumerName, eventId)` na tabela `processed_events` dentro da mesma transação do `UnitOfWork`.
3. Toda implementação de projector ou subscriber deve incluir um teste automatizado entregando o mesmo evento 2 vezes seguidas e provando que o efeito ocorre apenas 1 vez.

