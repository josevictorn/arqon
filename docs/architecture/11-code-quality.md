> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 13. Padrão de Qualidade de Código e Fluxo de Desenvolvimento

1. **Biome + Ultracite (`biome.json`)**:
   - Substitui ESLint + Prettier com execução em milissegundos.
   - Regras estritas de TypeScript: proibido `any` explícito, imports não utilizados são removidos no save, ordenação automática de imports.
2. **Lefthook (`lefthook.yml`)**:
   - `pre-commit`: Executa `npx @biomejs/biome check --write --staged` e `tsc --noEmit` em paralelo.
   - `commit-msg`: Valida Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`).
   - `pre-push`: Executa `vitest related --run` (roda os testes unitários dos arquivos modificados).
   - Os hooks são um subconjunto rápido; a checagem completa e obrigatória roda no CI — ver [12-ci.md](./12-ci.md).
3. **Docker Compose (`docker-compose.yml` — organizado em profiles conforme [ADR-0011](../decisions/0011-infraestrutura-local.md) e [ADR-0021](../decisions/0021-redpanda-e-rustfs-na-infra-local.md))**:
   - `postgres`: PostgreSQL 17 Alpine (Write DB — Commands & Outbox — profile `core`).
   - `mongodb`: MongoDB 8 em replica set de 1 nó (Read DB — CQRS Views & Projections — profile `core`).
   - `redis`: Valkey 8 Alpine (Sessions, Locks & Rate Limit — profile `core`).
   - `redpanda`: Kafka API (`9092`) + Schema Registry compatível com Confluent (`8081`) num único binário, + `redpanda-console` (`8080`) (profile `messaging`). Em produção, qualquer broker compatível com a API Kafka (ex.: Apache Kafka 4.x KRaft).
   - `mailpit`: Servidor SMTP fake com interface web na porta `8025` (profile `mail-storage`).
   - `rustfs`: Storage S3-compatible local (API `9000`, console `9001`) para testar uploads e Presigned URLs; o healthcheck cria o bucket `S3_BUCKET` de forma idempotente (profile `mail-storage`).
   - `otel-lgtm`: `grafana/otel-lgtm` com OTel Collector + Loki + Tempo + Prometheus + Grafana na porta `3001` (profile `observability`).
4. **Inicialização de Novos Projetos (`create-arqon-app` + `pnpm init:project` — conforme [ADR-0012](../decisions/0012-inicializacao-de-novos-projetos.md))**:
   - Novos projetos são criados via `pnpm create arqon-app <slug>` (ou `pnpm init:project` após clone/template).
   - O inicializador renomeia o projeto (`package.json`, `docker-compose.yml`, `.env.example`, docs), gera o `.env` com segredos e chaves criptográficas assimétricas exclusivas (`node:crypto`) e reseta o `docs/roadmap/` para o backlog do novo produto.
   - Qualquer identificador da aplicação em runtime (`APP_NAME`, `APP_SLUG`, prefixo de cache, `clientId` do Kafka, bucket S3) vem de variáveis de ambiente — nunca hardcoded em `src/`.

