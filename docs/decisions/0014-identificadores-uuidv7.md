# ADR-0014: Padronizar identificadores com UUIDv7 gerados no domínio

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.03, T2.02, T2.05
- **Docs afetados:** [`docs/architecture/00-principles.md`](../architecture/00-principles.md), [`docs/modules/iam/spec.md`](../modules/iam/spec.md)

## Contexto

O boilerplate utiliza DDD com escrita em PostgreSQL (Prisma), Outbox transacional, eventos no Kafka e projeções de leitura no MongoDB. Precisávamos definir:
1. Qual formato de identificador único usar para entidades (`UniqueEntityID`) e eventos (`eventId` em Domain e Integration Events).
2. Onde o ID é gerado: na camada de domínio (aplicação) ou delegado ao banco de dados (`DEFAULT gen_random_uuid()` / `autoincrement`).

No DDD, um Aggregate Root precisa ter identidade válida desde o momento de sua instanciação em memória (`User.create(...)`), antes mesmo de tocar o repositório, para que Domain Events emitidos na criação já referenciem o `aggregateId` correto. Além disso, UUIDv4 puro causa fragmentação severa de índices B-Tree no PostgreSQL sob alto volume de inserção devido à falta de localidade temporal.

## Opções consideradas

### Opção A — UUIDv7 (RFC 9562) gerado no domínio (`UniqueEntityID`) para tudo
- ✅ **Ordenável por tempo (k-sortable):** os primeiros 48 bits são um timestamp Unix em milissegundos, eliminando a fragmentação de páginas B-Tree no PostgreSQL e no MongoDB.
- ✅ **Identidade imediata no domínio:** agregados e eventos já nascem com ID antes do `save()`, viabilizando Domain Events e Outbox na mesma transação sem round-trip extra ao banco.
- ✅ **Compatibilidade universal:** é um UUID padrão de 128 bits (formato `8-4-4-4-12`), aceito nativamente pela coluna `UUID` do PostgreSQL e por validadores Zod (`z.string().uuid()`).
- ❌ Revela o timestamp aproximado de criação da entidade se o ID for exposto na URL (aceitável para SaaS B2B; endpoints nunca dependem de obscuridade de ID para segurança).

### Opção B — UUIDv4 gerado no domínio
- ✅ Simples e nativo via `crypto.randomUUID()`.
- ❌ Totalmente aleatório: degrada a localidade de páginas de índice B-Tree no PostgreSQL (`users`, `sessions`, `outbox_events`) à medida que as tabelas crescem.

### Opção C — ULID ou CUID2
- ✅ Ordenáveis (ULID) ou resistentes a colisão (CUID2).
- ❌ Não são compatíveis com o tipo nativo `UUID` de 16 bytes do PostgreSQL (exigem `VARCHAR`/`TEXT` ou conversão binária customizada no Prisma).

## Decisão

Adotamos a **Opção A**: todos os identificadores de entidades (`UniqueEntityID`), agregados e eventos (`eventId`) do sistema utilizam **UUIDv7 (RFC 9562)** gerados na camada de domínio (`src/shared/core/domain/unique-entity-id.ts`).

## Consequências

- **Positivas:**
  - Inserções sequenciais em índices primários (`PK`) no PostgreSQL (especialmente crítico para `outbox_events`, `sessions` e `invoices`).
  - Ordem cronológica natural ao ordenar por `id` em paginações por cursor.
  - Domínio 100% autônomo para instanciar agregados e disparar eventos antes da persistência.
- **Negativas / trade-offs aceitos:**
  - `UniqueEntityID` encapsula a geração de UUIDv7 sem expor dependências de infraestrutura para as entidades.
- **Ações decorrentes:**
  - Na **T2.02**, implementar `UniqueEntityID` gerando e validando UUIDv7.
  - Em todos os schemas Prisma, declarar chaves primárias como `@id @db.Uuid` (sem `@default(uuid())` como fonte primária, pois o Mapper sempre envia o `entity.id.toString()`).

## Regras para a IA

1. Todo `Entity`, `AggregateRoot`, `DomainEvent` e `IntegrationEvent` recebe seu ID via `UniqueEntityID` (UUIDv7) na camada de domínio; nunca delegue a geração de ID ao banco de dados.
2. No Prisma (`schema.prisma`), todas as colunas de ID devem usar o tipo nativo `@db.Uuid`.
3. Nos contratos HTTP e schemas Zod de parâmetros/DTOs, valide IDs sempre com `z.string().uuid()`.
