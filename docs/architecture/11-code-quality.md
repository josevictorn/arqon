> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 13. Padrão de Qualidade de Código e Fluxo de Desenvolvimento

1. **Biome + Ultracite (`biome.json`)**:
   - Substitui ESLint + Prettier com execução em milissegundos.
   - Regras estritas de TypeScript: proibido `any` explícito, imports não utilizados são removidos no save, ordenação automática de imports.
2. **Lefthook (`lefthook.yml`)**:
   - `pre-commit`: Executa `npx @biomejs/biome check --write --staged` e `tsc --noEmit` em paralelo.
   - `commit-msg`: Valida Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`).
   - `pre-push`: Executa `vitest related --run` (roda os testes unitários dos arquivos modificados).
3. **Docker Compose (`docker-compose.yml` — organizado em profiles conforme [ADR-0011](../decisions/0011-infraestrutura-local.md))**:
   - `postgres`: PostgreSQL 17 Alpine (Write DB — Commands & Outbox — profile `core`).
   - `mongodb`: MongoDB 8 em replica set de 1 nó (Read DB — CQRS Views & Projections — profile `core`).
   - `redis`: Redis 7 / Valkey 8 Alpine (Sessions, Locks & Rate Limit — profile `core`).
   - `kafka`: Apache Kafka 4.x em modo KRaft (sem Zookeeper) + `schema-registry` (profile `messaging`).
   - `mailpit`: Servidor SMTP fake com interface web na porta `8025` (profile `mail-storage`).
   - `minio`: Storage S3-compatible local para testar uploads e Presigned URLs (profile `mail-storage`).
   - `otel-lgtm`: `grafana/otel-lgtm` com OTel Collector + Loki + Tempo + Prometheus + Grafana na porta `3001` (profile `observability`).
4. **Inicialização de Novos Projetos (`create-arqon-app` + `pnpm init:project` — conforme [ADR-0012](../decisions/0012-inicializacao-de-novos-projetos.md))**:
   - Novos projetos são criados via `pnpm create arqon-app <slug>` (ou `pnpm init:project` após clone/template).
   - O inicializador renomeia o projeto (`package.json`, `docker-compose.yml`, `.env.example`, docs), gera o `.env` com segredos e chaves criptográficas assimétricas exclusivas (`node:crypto`) e reseta o `docs/roadmap/` para o backlog do novo produto.
   - Qualquer identificador da aplicação em runtime (`APP_NAME`, `APP_SLUG`, prefixo de cache, `clientId` do Kafka, bucket S3) vem de variáveis de ambiente — nunca hardcoded em `src/`.

