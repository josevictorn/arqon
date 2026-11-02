# ADR-0021: Usar Redpanda (mensageria) e RustFS (object storage) na infraestrutura local

- **Status:** Aceito
- **Data:** 2026-11-02
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.06, T1.07, T4.01, T4.02
- **Docs afetados:** [ADR-0011](./0011-infraestrutura-local.md) (parcialmente substituído), [11-code-quality.md](../architecture/11-code-quality.md), [01-tech-stack.md](../architecture/01-tech-stack.md), [T1.06](../roadmap/tasks/T1.06-docker-compose.md)

## Contexto

O [ADR-0011](./0011-infraestrutura-local.md) definiu os profiles do Docker Compose com **Apache Kafka (KRaft) + Schema Registry** em `messaging` e **MinIO** em `mail-storage`. Ao executar a T1.06 surgiram dois problemas:

1. **Inconsistência entre ADRs sobre a mensageria local:** o [ADR-0003](./0003-runtime-versoes-e-package-manager.md) e o ADR-0011 citam Apache Kafka 4.x + Schema Registry separado, enquanto o [ADR-0020](./0020-schema-registry-json-schema.md) e a própria T1.06 assumem o Schema Registry "provido pelo Redpanda localmente". O critério de aceite da T1.06 exige que o profile `full` suba saudável numa máquina com 8 GB.
2. **MinIO deixou de distribuir imagens públicas:** `minio/minio` e `minio/mc` não existem mais no Docker Hub e `quay.io/minio/*` responde `401 UNAUTHORIZED` a pulls anônimos (verificado em 2026-11-02, enquanto outras imagens públicas do quay.io baixam normalmente). Um boilerplate público não pode depender de credenciais de registry para subir o ambiente local nem o CI.

## Opções consideradas

### Mensageria (`messaging`)

#### Opção A — Redpanda (single binary: Kafka API + Schema Registry)
- ✅ Um único container entrega a API Kafka (`9092`) e a API do Confluent Schema Registry (`8081`), exatamente o que o ADR-0020 precisa.
- ✅ Leve (≈1 GB com `--memory 1G`), sobe em segundos e tem imagem multi-arch (arm64/amd64).
- ✅ Compatível com o cliente `@confluentinc/kafka-javascript` ([ADR-0004](./0004-cliente-kafka.md)) e com `@confluentinc/schemaregistry`.
- ❌ Não é o mesmo binário do Apache Kafka usado em produção; diferenças sutis de comportamento podem existir em features de borda.

#### Opção B — Apache Kafka 4.x (KRaft) + Confluent Schema Registry
- ✅ Idêntico ao broker de produção.
- ❌ Duas JVMs (≈1,5–2 GB), boot mais lento, pesa no limite de 8 GB do profile `full`.

### Object storage (`mail-storage`)

#### Opção A — RustFS
- ✅ Apache-2.0, S3-compatible, imagem pública multi-arch, mesmas portas do MinIO (API `9000`, console web `9001`).
- ✅ Troca transparente para a aplicação: o código usa apenas `@aws-sdk/client-s3` com `S3_ENDPOINT`.
- ❌ Projeto mais jovem que o MinIO.

#### Opção B — MinIO autenticado no quay.io
- ❌ Exige credenciais em toda máquina de dev e no CI; inviável para um boilerplate público.

#### Opção C — SeaweedFS / Garage
- ✅ Maduros e S3-compatible.
- ❌ Sem console web equivalente (critério de aceite da T1.06) e com bootstrap mais trabalhoso.

## Decisão

1. **Mensageria local:** **Redpanda** (`redpandadata/redpanda`) com Kafka API em `9092` e Schema Registry em `8081`, mais o **Redpanda Console** como UI no mesmo profile `messaging`. Em produção o alvo continua sendo qualquer broker compatível com a API Kafka (Apache Kafka 4.x KRaft, Confluent Cloud, Redpanda, MSK), como define o ADR-0003; nenhum código de `src/` depende de feature exclusiva do Redpanda.
2. **Object storage local:** **RustFS** (`rustfs/rustfs`) no lugar do MinIO, com o bucket criado de forma idempotente pelo próprio healthcheck do serviço (requisições S3 assinadas com SigV4 pelo `curl` da imagem). Não usamos job *one-shot*: o `docker compose up --wait` tem condição de corrida com containers que encerram rápido e pode falhar com `container ... exited (0)`.
3. O restante do ADR-0011 (profiles, healthchecks, reuso do compose nos testes) continua válido.

## Consequências

- **Positivas:** profile `full` cabe com folga numa máquina de 8 GB; zero credenciais de registry; ADR-0020 e T1.06 ficam consistentes com a infra.
- **Negativas / trade-offs aceitos:** o broker local não é o Apache Kafka oficial; testes que dependam de comportamento muito específico do broker devem ser validados também contra Apache Kafka antes de ir para produção.
- **Ações decorrentes:**
  - ADR-0011 marcado como parcialmente substituído por este ADR.
  - Atualizar `11-code-quality.md` e `01-tech-stack.md` (Kafka/Schema Registry → Redpanda local; MinIO → RustFS local).
  - T4.01/T4.02 usam `KAFKA_BROKERS` e `SCHEMA_REGISTRY_URL` (sem nada específico de Redpanda).

## Regras para a IA

1. Nunca adicione dependência de API exclusiva do Redpanda (Admin API, `rpk`, Wasm transforms) em `src/`; use apenas a API Kafka e a API do Schema Registry compatível com Confluent.
2. Nunca use imagens `minio/*` ou `quay.io/minio/*` no compose ou no CI; o storage S3 local é o RustFS, acessado só via `@aws-sdk/client-s3` e `S3_ENDPOINT`.
3. Toda imagem nova no `docker-compose.yml` deve ser pública, multi-arch (arm64 + amd64) e com tag exata.
