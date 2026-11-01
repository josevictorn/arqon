# ADR-0004: Cliente Kafka para Node.js

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T4.01, T4.02, T1.06
- **Docs afetados:** [01-tech-stack.md](../architecture/01-tech-stack.md), [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md), [09-observability.md](../architecture/09-observability.md)

## Contexto

O blueprint especifica `kafkajs`. Pela pesquisa, porém, o `kafkajs` está **sem manutenção** (última release 2.2.4 em fev/2023), não suporta o novo protocolo de rebalance (KIP-848) e emite avisos em runtimes Node recentes. A Confluent mantém o `@confluentinc/kafka-javascript`, que roda sobre `librdkafka` e oferece uma API inspirada no KafkaJS. O blueprint já usa `@confluentinc/schemaregistry`, da mesma família.

## Opções consideradas

### Opção A — `kafkajs` (como está no blueprint)
- ✅ JS puro, sem binário nativo; API conhecida; integração com `@nestjs/microservices`.
- ❌ Sem manutenção nem patches de segurança; fica para trás nas features do protocolo.

### Opção B — `@confluentinc/kafka-javascript`
- ✅ Mantido pela Confluent, performático (librdkafka), API compatível com KafkaJS, mesmo ecossistema do Schema Registry.
- ❌ Binário nativo: exige atenção a imagens Docker (alpine/musl vs glibc) e arquiteturas (arm64).

### Opção C — `@platformatic/kafka` ou outros clientes JS modernos
- ✅ JS puro e moderno.
- ❌ Menos maduros e com menor adoção; integração com Schema Registry por conta própria.

## Decisão

Adotar a **Opção B (`@confluentinc/kafka-javascript`)**, sempre encapsulada atrás de portas próprias (`EventBusGateway` / `KafkaProducerPort` / `KafkaConsumerPort`), para que o cliente fique 100% isolado em `src/shared/infra/messaging/` e qualquer troca futura não afete a camada de aplicação ou os módulos.

## Consequências

- **Ações decorrentes:** atualizar a tabela de stack; usar imagem base Debian slim (não alpine) se o binário exigir glibc; validar build em arm64 (Mac M-series) na T1.06 / T4.01.

## Regras para a IA

1. Nenhum arquivo fora de `src/shared/infra/messaging/` importa o cliente Kafka diretamente.
2. Producers e consumers são acessados apenas pelas portas definidas em `shared/application/gateways`.

