# arqon-boilerplate

Boilerplate SaaS enterprise em **NestJS + Fastify** com DDD, Clean/Hexagonal Architecture e CQRS poliglota (PostgreSQL → Outbox → Kafka → MongoDB), construído e evoluído com agentes de IA.

> 🚧 Em construção. Fase atual e próximos passos: [ROADMAP](./docs/roadmap/ROADMAP.md).

## Comece por aqui

| Você quer... | Leia |
|---|---|
| Entender a arquitetura | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Saber por que algo foi decidido | [docs/decisions](./docs/decisions/README.md) |
| Ver o que falta fazer | [docs/roadmap/ROADMAP.md](./docs/roadmap/ROADMAP.md) |
| Entender como trabalhamos com IA | [docs/workflow.md](./docs/workflow.md) |
| Configurar um agente de IA | [AGENTS.md](./AGENTS.md) |
| Navegar por toda a documentação | [docs/README.md](./docs/README.md) |

## Setup

> Setup completo disponível após a Fase 1 (T1.01, T1.06, T1.09 — ver [ADR-0012](./docs/decisions/0012-inicializacao-de-novos-projetos.md)).

### Infraestrutura local (Docker Compose)

Requisitos: Docker com Compose v2 e ~4 GB de RAM livres para o profile `full`. Os serviços são organizados em profiles ([ADR-0011](./docs/decisions/0011-infraestrutura-local.md), [ADR-0021](./docs/decisions/0021-redpanda-e-rustfs-na-infra-local.md)):

```bash
cp .env.example .env     # opcional: sem .env os defaults do compose são usados
pnpm infra:up            # profile core (postgres, mongodb, redis)
pnpm infra:up:full       # todos os profiles
pnpm infra:down          # para tudo, mantendo os volumes
pnpm infra:reset         # para tudo e APAGA os volumes (dados locais)

docker compose --profile messaging up -d --wait   # um profile específico
```

| Profile | Serviço | Porta(s) no host | UI / uso |
|---|---|---|---|
| `core` | PostgreSQL 17 | `5432` | `postgres` / `postgres` |
| `core` | MongoDB 8 (replica set `rs0`, 1 nó) | `27017` | `mongodb://localhost:27017/?directConnection=true` |
| `core` | Valkey 8 (Redis) | `6379` | — |
| `messaging` | Redpanda (Kafka API + Schema Registry) | `9092` (Kafka), `8081` (Schema Registry) | — |
| `messaging` | Redpanda Console | `8080` | <http://localhost:8080> |
| `mail-storage` | Mailpit | `1025` (SMTP), `8025` (UI) | <http://localhost:8025> |
| `mail-storage` | RustFS (S3) | `9000` (API), `9001` (console) | <http://localhost:9001/rustfs/console/> · `rustfsadmin` / `rustfsadmin` |
| `observability` | `grafana/otel-lgtm` | `3001` (Grafana), `4317` (OTLP gRPC), `4318` (OTLP HTTP) | <http://localhost:3001> · `admin` / `admin` · dashboard *Application → APM overview* |

- O nome do projeto Docker vem de `APP_SLUG` (containers e volumes ficam prefixados), e todas as portas do host podem ser trocadas pelas variáveis `*_PORT` do `.env`, permitindo rodar vários projetos derivados do boilerplate ao mesmo tempo ([ADR-0012](./docs/decisions/0012-inicializacao-de-novos-projetos.md)).
- O bucket `S3_BUCKET` é criado automaticamente pelo healthcheck do `rustfs` ([`docker/storage/ensure-bucket.sh`](./docker/storage/ensure-bucket.sh)): o serviço só fica `healthy` quando o bucket existe.
- Containers de outros serviços falam com o Kafka em `redpanda:29092`; a aplicação no host usa `localhost:9092`.

#### Troubleshooting

- **MongoDB encerra no boot com `Linux kernel versions 6.19 and newer has a known incompatibility`:** o MongoDB 8 recusa iniciar em kernels Linux de `6.19` a `7.0.13` (incompatibilidade do TCMalloc, [SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). No Mac/Windows o kernel é o da VM do Docker Desktop (`docker info --format '{{.KernelVersion}}'`): atualize o Docker Desktop para uma versão com kernel `>= 7.0.14`.

