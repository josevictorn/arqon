# PRD — Módulo `audit` (Audit Logs & Personal Security Trail)

- **Status:** ✅ Aprovado
- **Fase do Roadmap:** F10
- **Spec técnica derivada:** [`./spec.md`](./spec.md)
- **Referências de mercado:** WorkOS Audit Logs, GitHub Enterprise Audit Log & Personal Security Log, Stripe Events, Clerk Security Activity, SOC 2 / ISO 27001 / LGPD / GDPR.

---

## 1. Visão Geral e Propósito

O módulo **`audit`** é a autoridade de **rastreabilidade, conformidade e trilha de segurança imutável** da plataforma SaaS.

Por ser um sistema orientado a eventos (Outbox → Kafka), o `audit` opera como um **contexto 100% de leitura e projeção (*Read-Only / Append-Only Projection Context*)**: ele não possui comandos de escrita HTTP nem duplica dados no PostgreSQL. Em vez disso, o `AuditLogProjector` consome os eventos de integração de toda a plataforma, enriquece-os com os dados do ator e persiste os documentos imutáveis diretamente no MongoDB com índices otimizados para busca e retenção automática (TTL).

### Fronteira do Contexto Delimitado (O que é vs. O que não é `audit`)
- **É responsabilidade do `audit`:** consumir eventos críticos de `iam`, `tenancy` e `billing`, sanitizar quaisquer tokens/segredos de entrega, desnormalizar nome e e-mail do ator (`IamFacade`), manter duas visões separadas (**Auditoria da Organização** vs. **Histórico de Segurança Pessoal**), aplicar controle de acesso CASL + *feature flag* do plano (`BillingFacade.hasFeatureFlag('audit_logs')`) e anonimizar PII quando uma conta é anonimizada (`iam.user.anonymized.v1`).
- **NÃO é responsabilidade do `audit`:** logs técnicos de infraestrutura/debug (que pertencem ao Pino/Loki — ver [ADR-0013](../../decisions/0013-estrategia-de-logging-canonical-logs-e-custo.md)) ou bloquear ações síncronas de outros módulos.

---

## 2. Benchmark e Padrões de Mercado Adotados

| Capacidade / Fluxo | Referência de Mercado | Padrão Adotado no Boilerplate |
|---|---|---|
| **Captura Automática de Contexto no Envelope** | WorkOS / Stripe | O `PrismaUnitOfWork` extrai automaticamente do `AsyncLocalStorage` os metadados do ator (`actorId`, `actorType: 'USER' \| 'SYSTEM' \| 'WEBHOOK'`, `ipAddress`, `userAgent`, `tenantId`, `traceparent`) e os injeta no envelope padrão do `IntegrationEvent`. Os Use Cases de negócio não precisam passar IP/User-Agent manualmente. |
| **Duas Visões Separadas (Org vs. Pessoal)** | GitHub Enterprise / Linear | **1. Audit Log da Organização (`GET /organizations/:orgId/audit-logs`):** eventos de `tenancy.*` e `billing.*` daquele tenant.<br/>**2. Security Log Pessoal (`GET /me/security-logs`):** eventos de `iam.*` da própria conta do usuário logado (logins, MFA, trocas de senha, sessões revogadas). |
| **Governança por Plano (`audit_logs` + Retenção Customizada)** | GitHub Enterprise / Vercel / WorkOS | Tanto a **gravação** quanto a **leitura** e o **tempo de retenção (TTL)** dos logs de uma organização são governados pelo seu plano na `BillingFacade` (`features.audit_logs` e `quotas.audit_log_retention_days`). Organizações sem a feature ativa não consomem armazenamento no MongoDB; planos maiores podem ter 90 dias, 365 dias ou retenção ilimitada (`'unlimited'` → `expiresAt: null`). |
| **Armazenamento 100% MongoDB (Zero Duplicação PG)** | Arquitetura CQRS Poliglota | Gravação *append-only* idempotente direto no MongoDB (`_id = eventId`), aproveitando paginação por cursor de alta velocidade e índice TTL nativo por documento (`expireAfterSeconds: 0` sobre `expiresAt`). |
| **Conformidade LGPD/GDPR (Preservação de Rastro)** | SOC 2 + LGPD Art. 16 | Quando um usuário é anonimizado (`iam.user.anonymized.v1`), os logs pessoais dele (`user_security_audit_logs_views`) são apagados, mas os logs das organizações em que ele atuou (`organization_audit_logs_views`) **são preservados** mantendo o `actorId` e mascarando `actorName = 'Deleted User'` e `actorEmail = 'deleted@deleted.invalid'`. |

---

## 3. Personas e Jornadas do Usuário

### J1 — Investigação de Auditoria na Organização (Compliance / Admin)
1. **Owner ou Auditor de Segurança** (membro com permissão CASL `read AuditLog` em uma organização cujo plano possui `features.audit_logs === true`) acessa "Configurações → Logs de Auditoria" (`GET /organizations/:orgId/audit-logs`).
2. O sistema verifica:
   - Permissão CASL Nível 1 (`PoliciesGuard`: `read AuditLog`).
   - *Feature Flag* do plano via `BillingFacade.hasFeatureFlag({ organizationId, featureKey: 'audit_logs' })`. Se `false`, retorna `403 Forbidden` (`BILLING.FEATURE_NOT_AVAILABLE_IN_PLAN`), incentivando o upgrade de plano.
3. O auditor filtra os eventos por intervalo de datas (`from`, `to`), ator (`actorId`), categoria/ação (`action`, ex.: `tenancy.role.updated`, `billing.subscription.updated`) e navega via paginação por cursor em `< 5ms`.
4. Cada item exibe: quem fez (`actorName`, `actorEmail`, `actorType`), de onde (`ipAddress`, `userAgent`), quando (`occurredAt`), qual ação (`action`), qual recurso foi afetado (`targetType`, `targetId`) e os metadados sanitizados da mudança (`metadata`).

### J2 — Consulta do Histórico Pessoal de Segurança (`GET /me/security-logs`)
1. **Qualquer usuário autenticado** (independentemente de plano pago) acessa "Minha Conta → Atividade de Segurança" (`GET /me/security-logs`).
2. Ele visualiza os eventos de segurança da sua própria conta (`iam.*`: logins realizados, ativação/desativação de MFA, alterações de senha, sessões revogadas por reuso de token) com IP, navegador/dispositivo e data/hora, paginados por cursor.

### J3 — Sanitização de Segredos e Anonimização LGPD (`iam.user.anonymized.v1`)
1. Ao projetar eventos que carregam tokens temporários de entrega no payload (como `iam.password.reset_requested.v1` ou `tenancy.member.invited.v1`), o `AuditLogSanitizer` remove obrigatoriamente campos sensíveis (`resetToken`, `verificationToken`, `otpCode`, `inviteToken`) antes de persistir `metadata` no MongoDB.
2. Quando o evento `iam.user.anonymized.v1` é emitido após os 15 dias de *grace period*:
   - O `AuditLogProjector` remove todos os documentos daquele `userId` em `user_security_audit_logs_views`.
   - Em `organization_audit_logs_views`, executa `updateMany({ 'actor.actorId': userId }, { $set: { 'actor.actorName': 'Deleted User', 'actor.actorEmail': 'deleted@deleted.invalid' } })`, preservando a integridade histórica da organização sem reter PII.

---

## 4. Eventos Auditados e Classificação

### 4.1. Trilha da Organização (`organization_audit_logs_views`)

| Evento Consumido | `action` Registrada | `targetType` | Metadados Auditados (após sanitização) |
|---|---|---|---|
| `tenancy.organization.created.v1` | `organization.created` | `Organization` | `{ name, slug, requireMfa }` |
| `tenancy.organization.updated.v1` | `organization.updated` | `Organization` | `{ name, slug, requireMfa }` |
| `tenancy.role.updated.v1` | `role.created` \| `role.updated` \| `role.deleted` | `Role` | `{ roleId, name, isSystemOwner, permissions }` |
| `tenancy.member.invited.v1` | `member.invited` | `Invite` | `{ inviteId, email, roleIds, expiresAt }` *(sem `inviteToken`)* |
| `tenancy.invite.canceled.v1` | `invite.canceled` | `Invite` | `{ inviteId, email }` |
| `tenancy.member.accepted.v1` | `member.joined` | `Member` | `{ userId, inviteId, roleIds }` |
| `tenancy.member.roles_updated.v1` | `member.roles_updated` | `Member` | `{ userId, previousRoleIds, currentRoleIds }` |
| `tenancy.member.removed.v1` | `member.removed` | `Member` | `{ userId, roleIds, reason }` |
| `billing.subscription.updated.v1` | `subscription.updated` | `Subscription` | `{ subscriptionId, planCode, status, cancelAtPeriodEnd }` |
| `billing.invoice.paid.v1` | `invoice.paid` | `Invoice` | `{ invoiceId, provider, amountCents, currency }` |
| `billing.invoice.payment_failed.v1` | `invoice.payment_failed` | `Invoice` | `{ invoiceId, provider, amountCents, currency, reason }` |

*(Quando `tenancy.organization.deleted.v1` ocorre, os logs da organização excluída também são removidos ou marcados conforme a política de encerramento do tenant).*

### 4.2. Trilha Pessoal de Segurança (`user_security_audit_logs_views`)

| Evento Consumido | `action` Registrada | Metadados Auditados (após sanitização) |
|---|---|---|
| `iam.user.registered.v1` | `account.registered` | `{ email, locale }` |
| `iam.user.email_verified.v1` | `account.email_verified` | `{ verifiedAt }` |
| `iam.session.authenticated.v1` | `session.authenticated` | `{ sessionId, mfaVerified }` |
| `iam.session.revoked.v1` | `session.revoked` | `{ sessionId, reason }` |
| `iam.mfa.enabled.v1` | `mfa.enabled` | `{ method, enabledAt }` |
| `iam.mfa.disabled.v1` | `mfa.disabled` | `{ disabledAt }` |
| `iam.password.reset_requested.v1` | `password.reset_requested` | `{ expiresAt }` *(sem `resetToken`)* |
| `iam.password.changed.v1` | `password.changed` | `{ changeType }` |
| `iam.user.deletion_requested.v1` | `account.deletion_requested` | `{ deletionScheduledFor }` |
| `iam.user.deletion_canceled.v1` | `account.deletion_canceled` | `{ canceledAt }` |

---

## 5. Requisitos Funcionais (RF) e Regras de Negócio

### RF-01 — Gravação e Retenção Governadas pelo Plano (`BillingFacade`) + Opt-Out por Organização (`TenancyFacade`)
- Antes de gravar qualquer evento de organização (`tenancy.*` ou `billing.*`), o `AuditLogProjector` verifica duas condições em `< 1ms` (via cache Redis):
  1. **Política da Organização (`TenancyFacade.getOrganizationSummary(orgId).auditLogsEnabled`):** permite que uma organização específica desative a gravação de logs de auditoria (`auditLogsEnabled: false` em `PATCH /organizations/:orgId`).
  2. **Política do Plano (`BillingFacade.getOrganizationAuditLogPolicy(orgId)`):** retorna `{ enabled: features.audit_logs, retentionDays: quotas.audit_log_retention_days }` definido em `plans.catalog.ts`.
- **Regras de Decisão no Projector:**
  - **Não gravar (`!org.auditLogsEnabled || !planPolicy.enabled || planPolicy.retentionDays === 0`):** se a organização específica desativou a gravação ou se o plano dela não inclui `audit_logs` (ex.: plano `Free`), o projector **descarta o evento sem gravar no MongoDB**.
  - **Gravar com Prazo (`retentionDays: number`):** grava o documento com `expiresAt = occurredAt + retentionDays * 86_400_000`. O índice TTL do MongoDB (`{ expiresAt: 1 }, { expireAfterSeconds: 0 }`) apaga o documento automaticamente quando a data `expiresAt` chega.
  - **Gravar com Retenção Ilimitada (`retentionDays === 'unlimited'`):** grava o documento com `expiresAt = null` (o MongoDB nunca apaga documentos com `expiresAt: null`).
- Na leitura (`GET /organizations/:orgId/audit-logs`), a Query valida `BillingFacade.hasFeatureFlag({ organizationId, featureKey: 'audit_logs' })`, retornando `BILLING.FEATURE_NOT_AVAILABLE_IN_PLAN` (`403 Forbidden`) caso o plano atual não contemple auditoria.

### RF-02 — Imutabilidade e Idempotência por `_id = eventId`
- Não existem endpoints nem comandos de `UPDATE` ou `DELETE` manual de logs de auditoria.
- Todo documento usa o próprio `eventId` (UUIDv7 do envelope Kafka) como `_id` no MongoDB, garantindo idempotência natural (`$setOnInsert`) e ordenação cronológica exata no cursor.

### RF-03 — Sanitização Obrigatória de Segredos (`AuditLogSanitizer`)
- Função pura de domínio/aplicação que remove qualquer propriedade da *denylist* (`password`, `passwordHash`, `refreshToken`, `verificationToken`, `resetToken`, `otpCode`, `inviteToken`, `secret`) antes de persistir o campo `metadata`.

### RF-04 — Retenção dos Logs Pessoais de Segurança (`PERSONAL_SECURITY_LOG_RETENTION_DAYS`)
- Como os eventos pessoais do `iam` (`user_security_audit_logs_views` em `GET /me/security-logs`) pertencem à pessoa física e não a uma organização/plano comercial, sua retenção é controlada pela variável de ambiente `PERSONAL_SECURITY_LOG_RETENTION_DAYS` (default: `90` dias), utilizando a mesma mecânica de índice TTL `{ expiresAt: 1 }` (`expireAfterSeconds: 0`).

---

## 6. Fora de Escopo (Non-Goals para o Boilerplate v1)

- Exportação assíncrona de gigabytes de logs para arquivos CSV/Parquet no S3 ou streaming externo para SIEM corporativo (Datadog / Splunk / AWS Security Hub).
- Assinatura criptográfica em cadeia tipo *Merkle Tree / Blockchain* sobre cada linha de log.

