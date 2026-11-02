> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto** (ver [ADR-0003](../decisions/0003-runtime-versoes-e-package-manager.md) para as versões-base fixadas: Node.js 24 LTS, pnpm, NestJS 11.x, Zod 4 + nestjs-zod 5, Prisma 7.x, PostgreSQL 17, MongoDB 8.x, Redis 7.x / Valkey 8, Kafka 4.x KRaft).

# 2. Tech Stack & Bibliotecas Padronizadas

| Categoria | Tecnologia / Biblioteca | Papel na Arquitetura |
| :--- | :--- | :--- |
| **Runtime & Framework** | **Node.js 24 LTS** + **NestJS 11.2.8** + `@nestjs/platform-fastify` 11.2.8 (Fastify 5, TypeScript 5.9, pnpm 11, build SWC) | Core do servidor HTTP de alta performance com Fastify. Versões exatas fixadas no `package.json` (ADR-0003). |
| **Validação & OpenAPI** | **Zod** + `nestjs-zod` + `@scalar/nestjs-api-reference` | Single Source of Truth: um único schema Zod valida o request e gera a documentação interativa no **Scalar API**. |
| **Write DB (Commands)** | **PostgreSQL 16+** + **Prisma ORM** | Fonte da verdade transacional (ACID), modelos normalizados, `UnitOfWork` e tabela de `Outbox`. |
| **Read DB (Queries / CQRS)** | **MongoDB 7+** (`mongodb` driver nativo) | Armazenamento de **Read Models (Views desnormalizadas)** alimentadas via Kafka para leituras ultra-rápidas, filtros dinâmicos e agregações sem onerar o PostgreSQL. |
| **In-Memory & Locks** | **Redis 7+** (`ioredis` / `@liaoliaots/nestjs-redis`) | Sessões/Refresh Tokens, Rate Limit distribuído, Locks distribuídos, controle de idempotência rápida e cache de curtíssima duração. |
| **Mensageria & Eventos** | **Apache Kafka** (`@confluentinc/kafka-javascript` — ver [ADR-0004](../decisions/0004-cliente-kafka.md)) + `@confluentinc/schemaregistry` | Event-Driven Architecture + Backbone do CQRS com **Transactional Outbox Pattern**, **Event Versioning**, **Schema Registry** e **DLQ (Dead Letter Queue)**. |
| **Autenticação & Cripto** | `@nestjs/jwt` + **Argon2** (`argon2`) | Hashing de senhas resistente a GPU (Argon2id) e tokens JWT assimétricos (RS256/EdDSA). |
| **Autorização (Dynamic ABAC)** | **CASL** (`@casl/ability`) | Motor de permissões dinâmicas: usuários criam cargos customizados por organização com regras e condições de atributos (JSON hidratado em runtime + cargo `Owner` de sistema imutável). |
| **Resiliência** | `cockatiel` (encapsulado via `@Resilient` — ver [ADR-0005](../decisions/0005-biblioteca-de-resiliencia.md)) + `@nestjs/throttler` | **Bulkhead**, **Circuit Breaker**, **Retry (Exponential Backoff + Jitter)**, **Timeout** e **Rate Limiting Distribuído** (via Redis). |
| **Observabilidade** | **OpenTelemetry SDK** + `nestjs-pino` + **Prometheus** (`prom-client`) + **Grafana LGTM** (`grafana/otel-lgtm` — ver [ADR-0006](../decisions/0006-observabilidade.md)) | Logs estruturados em JSON (`nestjs-pino`), Distributed Tracing ponta a ponta (OTel: HTTP → Prisma → Kafka → MongoDB), métricas Prometheus (`/metrics`) e dashboards no Grafana. |
| **Internacionalização** | `nestjs-i18n` | Tradução dinâmica (`en` e `pt-BR`) via header `Accept-Language` para erros, validações e e-mails. |
| **E-mail** | `@nestjs-modules/mailer` (`nodemailer`) + **Mailpit** (Dev) | Envio de e-mails transacionais com templates internacionalizados e caixa de entrada local no Mailpit. |
| **Storage** | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | Abstração de Object Storage (AWS S3 / Cloudflare R2 / MinIO) com suporte a Presigned URLs. |
| **Testes** | **Vitest** + `supertest` + `@faker-js/faker` | Testes Unitários (In-Memory), Integração e E2E com schemas isolados no PostgreSQL e databases isolados no MongoDB por worker. |
| **Code Quality & Git** | **Biome** + **Ultracite** + **Lefthook** | Linter/Formatter ultra-rápido em Rust (Biome + preset Ultracite) e Git Hooks automatizados (Lefthook). |
| **Infra Dev** | **Docker** & **Docker Compose** | Orquestração local de PostgreSQL, MongoDB, Valkey (Redis), Redpanda (Kafka API + Schema Registry), Mailpit, RustFS (S3) e `grafana/otel-lgtm` ([ADR-0011](../decisions/0011-infraestrutura-local.md), [ADR-0021](../decisions/0021-redpanda-e-rustfs-na-infra-local.md)). |

