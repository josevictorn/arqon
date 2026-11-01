# ADR-0017: Isolamento Multi-Tenant com Defesa em Profundidade (Aplicação + CASL + PostgreSQL RLS)

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.04, T3.05, T5.06, T8.01, T8.06
- **Docs afetados:** [`docs/architecture/06-security-tenancy-casl.md`](../architecture/06-security-tenancy-casl.md), [`docs/modules/tenancy/spec.md`](../modules/tenancy/spec.md)

## Contexto

Em um SaaS multi-tenant com banco de dados compartilhado (*pool model* no PostgreSQL), o maior risco de segurança é o vazamento de dados entre organizações (*Cross-Tenant Data Leakage*), tipicamente causado por uma query ou repositório que esquece de filtrar por `organizationId`.

Precisávamos decidir se o isolamento no PostgreSQL ficaria restrito aos filtros explícitos na aplicação (`WHERE organization_id = ...` + CASL) ou se adicionaríamos **PostgreSQL Row-Level Security (RLS)** como camada final de defesa no próprio banco de dados.

## Opções consideradas

### Opção A — Defesa em Profundidade: Aplicação + CASL + PostgreSQL Row-Level Security (RLS)
- ✅ **Garantia no nível do motor do banco:** mesmo que um desenvolvedor ou agente de IA cometa um erro em um repositório Prisma e escreva um `findMany()` sem `where: { organizationId }`, o PostgreSQL bloqueia automaticamente qualquer linha cujo `organization_id` não corresponda a `current_setting('app.current_tenant_id', true)`.
- ✅ **Compatibilidade com Connection Pooling transacional:** como usamos `SET LOCAL app.current_tenant_id = '<orgId>'` dentro da transação gerenciada pelo `PrismaUnitOfWork` (`AsyncLocalStorage`), a configuração vale **exclusivamente para a transação atual** e é limpa automaticamente no `COMMIT`/`ROLLBACK`, sendo 100% segura com PgBouncer em modo *transaction pooling*.
- ❌ Exige migrations SQL explícitas para criar as policies RLS (`ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY`) nas tabelas com `organization_id` e requer que operações de sistema/workers (como Outbox Relay ou crons globais) definam um bypass explícito ou rodem fora da restrição de tenant único.

### Opção B — Apenas filtro `organizationId` na Aplicação + CASL
- ✅ Mais simples nas migrations SQL.
- ❌ Um único `findUnique({ where: { id } })` ou `updateMany` sem validar `organizationId` em um novo módulo ou query customizada pode expor dados de outro tenant.

## Decisão

Adotamos a **Opção A (Defesa em Profundidade em 3 Camadas)**:
1. **Camada 1 — Guard HTTP + Redis (`PoliciesGuard`):** valida se o usuário pertence à organização e possui a permissão de rota antes de entrar no UseCase.
2. **Camada 2 — Domínio / Aplicação (`TenantAbilityFactory` + Repositórios):** o `TenantAbilityFactory` injeta `{ organizationId }` em todas as regras CASL (avaliadas com `subject()`), e todos os métodos de repositório exigem `organizationId` explícito nas cláusulas `where`.
3. **Camada 3 — Banco de Dados (PostgreSQL RLS):**
   - Todas as tabelas de negócio pertencentes a um tenant (`roles`, `memberships`, `invites`, `subscriptions`, `invoices`, etc.) possuem `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
   - A policy padrão do PostgreSQL verifica:
     `USING (current_setting('app.current_tenant_id', true) = 'SYSTEM_BYPASS' OR organization_id::text = current_setting('app.current_tenant_id', true))`
   - O `PrismaUnitOfWork` (e o helper de transação do Prisma) executa `SELECT set_config('app.current_tenant_id', $1, true)` (`is_local = true`) quando há um `tenantId` ativo no `AsyncLocalStorage`, ou `'SYSTEM_BYPASS'` para workers/consumers internos autorizados.

## Consequências

- **Positivas:**
  - Proteção estrutural contra vazamento cross-tenant mesmo diante de falha humana ou de código gerado por IA.
  - Testável de ponta a ponta na **T8.06** (testes de tentativa de acesso cross-tenant).
- **Negativas / trade-offs aceitos:**
  - Toda nova tabela com `organization_id` deve incluir o bloco SQL de ativação do RLS na sua migration Prisma.
- **Ações decorrentes:**
  - Na **T3.05** (`PrismaUnitOfWork`), incluir a propagação de `app.current_tenant_id` via `set_config(..., true)` a partir do contexto do `AsyncLocalStorage`.
  - Na **T8.01** e **T8.06**, criar as policies RLS e a suíte de testes de isolamento cross-tenant.

## Regras para a IA

1. Nunca confie *apenas* no RLS para filtrar dados: todo repositório de entidade associada a uma organização ainda deve receber e filtrar explicitamente por `organizationId` na cláusula `where` (defesa em profundidade).
2. Toda tabela no PostgreSQL que possuir a coluna `organization_id` deve ter `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` na sua migration.
3. Sempre configure o contexto do tenant no banco usando `set_config('app.current_tenant_id', tenantId, true)` (`SET LOCAL`, escopo de transação) — nunca use `SET SESSION`, que vaza estado entre conexões do pool.

