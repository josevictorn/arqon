# ADR-0020: Schema Registry com JSON Schema gerado a partir dos contratos Zod

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.07, T2.05, T4.02
- **Docs afetados:** [`docs/architecture/04-cqrs-and-events.md`](../architecture/04-cqrs-and-events.md), [`docs/events/catalog.md`](../events/catalog.md)

## Contexto

O boilerplate utiliza o Schema Registry (compatível com Confluent Schema Registry API, provido pelo Redpanda localmente — [ADR-0011](./0011-infraestrutura-local.md)) para governar a evolução dos contratos de Integration Events no Kafka e impedir que mudanças incompatíveis quebrem Projectors e Subscribers em produção.

Precisávamos definir qual formato de schema adotar no Schema Registry (**JSON Schema**, **Apache Avro** ou **Protobuf**) e como evitar duplicação entre os schemas TypeScript/Zod da aplicação e os schemas registrados no broker.

## Opções consideradas

### Opção A — JSON Schema gerado automaticamente a partir dos contratos Zod (`src/shared/contracts/events/`), com compatibilidade `BACKWARD`
- ✅ **Fonte única de verdade (Single Source of Truth):** cada evento já é definido com um schema **Zod** em `src/shared/contracts/events/<ctx>/<event>.ts`. A conversão para JSON Schema é 100% automática em tempo de execução/registro, sem escrever nem manter arquivos `.avsc` ou `.proto` separados.
- ✅ **Legibilidade e Debuggability:** mensagens serializadas com o framing do Confluent JSON Schema continuam legíveis em ferramentas de inspeção (Redpanda Console, Kafka UI, logs de DLQ).
- ✅ **Compatibilidade nativa com Redpanda e Confluent Schema Registry:** suporta validação de evolução de schema (`BACKWARD` por padrão).
- ❌ Payload ligeiramente maior que binário puro Avro/Protobuf (compensado pela compressão de lote do Kafka).

### Opção B — Apache Avro (`.avsc`)
- ✅ Binário compacto.
- ❌ Exige manter arquivos `.avsc` separados dos schemas Zod ou usar codegen adicional no pipeline de build.

### Opção C — Protocol Buffers (`.proto`)
- ✅ Muito compacto e rápido.
- ❌ Exige `protoc` / geração de código e cria atrito desnecessário com os tipos TypeScript/Zod já usados em todo o resto do boilerplate.

## Decisão

Adotamos a **Opção A**:
1. **Formato no Schema Registry:** `JSON` (JSON Schema Draft-07 / 2020-12).
2. **Fonte única:** todo contrato de evento em `src/shared/contracts/events/<ctx>/` é declarado usando o helper `defineIntegrationEventContract({ eventName, schemaVersion, payloadSchema: z.object(...) })` (T2.05).
3. **Derivação automática:** o módulo do Schema Registry (T4.02) gera o JSON Schema completo (Envelope + `payloadSchema` Zod) automaticamente e o registra sob o subject `<topic>-value` com modo de compatibilidade **`BACKWARD`**.
4. **Regra de Breaking Change:** se uma mudança de contrato violar a compatibilidade `BACKWARD` (ex.: remover campo obrigatório ou mudar tipo), o desenvolvedor deve incrementar a versão do tópico (`v2`) e manter a publicação paralela durante a janela de migração.

## Consequências

- **Positivas:**
  - Zero arquivos `.avsc` ou `.proto` para sincronizar manualmente.
  - Desenvolvedores e agentes de IA escrevem apenas Zod em TypeScript e ganham validação em memória + registro no Schema Registry + inferência estática de tipos de uma só vez.
- **Negativas / trade-offs aceitos:**
  - Tipos no `payloadSchema` devem usar apenas construções serializáveis em JSON (strings, números, booleanos, objetos, arrays, datas em string ISO 8601).
- **Ações decorrentes:**
  - Implementar o helper `defineIntegrationEventContract` na **T2.05** e o cliente do Schema Registry na **T4.02**.

## Regras para a IA

1. Nunca crie arquivos `.avsc` (Avro) ou `.proto` (Protobuf) para eventos Kafka; defina todos os contratos exclusivamente com Zod via `defineIntegrationEventContract` em `src/shared/contracts/events/`.
2. Todo campo de data em contratos de `IntegrationEvent` deve ser serializado como string ISO 8601 (`z.string().datetime()`).
3. Nunca faça *breaking change* em um evento `.v1` já publicado; crie um novo contrato `.v2` se a mudança não for `BACKWARD` compatível.

