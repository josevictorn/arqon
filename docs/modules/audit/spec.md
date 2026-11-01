# Spec Técnica — Módulo `audit` (Audit Logs & Personal Security Trail)

> Fonte da verdade de **engenharia e modelo de domínio** do módulo `audit`. Derivada do [PRD aprovado (`./prd.md`)](./prd.md). Arquitetura técnica: [03-module-anatomy.md](../../architecture/03-module-anatomy.md), [04-cqrs-and-events.md](../../architecture/04-cqrs-and-events.md), [06-security-tenancy-casl.md](../../architecture/06-security-tenancy-casl.md).

- **Status:** ✅ Especificado
- **PRD:** [`./prd.md`](./prd.md)
- **Fase do roadmap:** F10
- **ADRs relevantes:** [0008](../../decisions/0008-idempotencia-de-consumers.md), [0014](../../decisions/0014-identificadores-uuidv7.md), [0016](../../decisions/0016-resolucao-tenant-ativo-por-requisicao.md), [0018](../../decisions/0018-taxonomia-eventos-billing-e-catalogo-planos.md), [0019](../../decisions/0019-envelope-integration-event.md), [0020](../../decisions/0020-schema-registry-json-schema.md)

---

## 1. Modelo de Domínio e Sanitização (`src/modules/audit/domain/`)

> O módulo `audit` é um contexto *Read-Only / Append-Only Projection* puro no MongoDB (zero tabelas no PostgreSQL).

### 1.1. Value Objects e Serviços Puros de Domínio

| Tipo | Nome | Responsabilidade |
|---|---|---|
| **Value Object** | `AuditEntry` | Representação imutável de um evento auditável já mapeado e sanitizado antes de persistir no Read Model. |
| **Domain Service** | `AuditLogSanitizer` | Função pura recursiva que remove chaves sensíveis de qualquer payload (`password`, `passwordHash`, `refreshToken`, `verificationToken`, `resetToken`, `otpCode`, `inviteToken`, `secret`, `mfaTotpSecretEncrypted`) e calcula `expiresAt` (`Date \| null`) com base na política de retenção (`number \| 'unlimited'`). |

---

## 2. Invariantes e Catálogo Fechado de Erros

| Invariante | Regra de Domínio / Aplicação | Código de Erro (`code`) | Chave i18n (`i18nKey`) | HTTP |
|---|---|---|---|---|
| **INV-01** | Todo registro de auditoria é 100% imutável e gravado de forma idempotente usando `_id = envelope.eventId` (UUIDv7) | — | — | — |
| **INV-02** | Eventos de organização só são gravados se `organization.auditLogsEnabled === true` (`TenancyFacade`) **e** `planPolicy.enabled === true && planPolicy.retentionDays !== 0` (`BillingFacade`) | — | — | — |
| **INV-03** | Consultar a trilha de auditoria da organização exige simultaneamente permissão CASL `read AuditLog` **e** que o plano da organização tenha `features.audit_logs === true` (`BillingFacade.hasFeatureFlag`) | `COMMON.FORBIDDEN`<br/>`BILLING.FEATURE_NOT_AVAILABLE_IN_PLAN` | `errors.common.forbidden`<br/>`errors.billing.feature_not_available_in_plan` | `403 Forbidden`<br/>`403 Forbidden` |
| **INV-04** | Nenhum segredo ou token temporário de entrega pode ser persistido em `metadata` (`AuditLogSanitizer`) | — | — | — |

---

## 3. Projectors e Queries (`src/modules/audit/application/`)

### 3.1. Projectors (`src/modules/audit/application/projectors/`)

| Projector | Collections MongoDB | Eventos Consumidos | Comportamento Idempotente (`_id = eventId` — ADR-0008 / ADR-0019) |
|---|---|---|---|
| `OrganizationAuditLogProjector` | `organization_audit_logs_views` | • `tenancy.organization.created.v1`<br/>• `tenancy.organization.updated.v1`<br/>• `tenancy.organization.deleted.v1`<br/>• `tenancy.role.updated.v1`<br/>• `tenancy.member.invited.v1`<br/>• `tenancy.invite.canceled.v1`<br/>• `tenancy.member.accepted.v1`<br/>• `tenancy.member.roles_updated.v1`<br/>• `tenancy.member.removed.v1`<br/>• `billing.subscription.updated.v1`<br/>• `billing.invoice.paid.v1`<br/>• `billing.invoice.payment_failed.v1`<br/>• `iam.user.anonymized.v1` | 1. Em `tenancy.organization.deleted.v1`: remove os logs da `organizationId` excluída.<br/>2. Em `iam.user.anonymized.v1`: preserva todos os documentos históricos das organizações, mas executa `updateMany({ 'actor.actorId': userId }, { $set: { 'actor.actorName': 'Deleted User', 'actor.actorEmail': 'deleted@deleted.invalid' } })`.<br/>3. Para os demais eventos: consulta `TenancyFacade.getOrganizationSummary(orgId)` e `BillingFacade.getOrganizationAuditLogPolicy(orgId)`. Se `!org.auditLogsEnabled \|\| !policy.enabled \|\| policy.retentionDays === 0`, retorna imediatamente (*no-op*). Caso contrário, hidrata `actorName`/`actorEmail` via `IamFacade.getUserSummaryById`, sanitiza o payload via `AuditLogSanitizer`, calcula `expiresAt` (`null` se `'unlimited'`, ou `occurredAt + retentionDays`) e insere com `updateOne({ _id: eventId }, { $setOnInsert: doc }, { upsert: true })`. |
| `PersonalSecurityAuditLogProjector` | `user_security_audit_logs_views` | • `iam.user.registered.v1`<br/>• `iam.user.email_verified.v1`<br/>• `iam.session.authenticated.v1`<br/>• `iam.session.revoked.v1`<br/>• `iam.mfa.enabled.v1`<br/>• `iam.mfa.disabled.v1`<br/>• `iam.password.reset_requested.v1`<br/>• `iam.password.changed.v1`<br/>• `iam.user.deletion_requested.v1`<br/>• `iam.user.deletion_canceled.v1`<br/>• `iam.user.anonymized.v1` | 1. Em `iam.user.anonymized.v1`: remove todos os documentos com `userId` em `user_security_audit_logs_views`.<br/>2. Para os demais eventos: sanitiza o payload, calcula `expiresAt = occurredAt + PERSONAL_SECURITY_LOG_RETENTION_DAYS` (default `90` dias via `.env`) e insere idempotentemente por `_id = eventId`. |

### 3.2. Queries (Read — MongoDB)

| Query | Collection MongoDB | Permissão / Guard | Input (Filtros + Cursor) | Output |
|---|---|---|---|---|
| `FetchOrganizationAuditLogsQuery` | `organization_audit_logs_views` | `PoliciesGuard` (`read AuditLog`) + **INV-03** (`BillingFacade.hasFeatureFlag('audit_logs')`) | `{ organizationId, actorId?, action?, targetType?, from?: Date, to?: Date, cursor?: string, limit?: number }` | `{ items: OrganizationAuditLogDto[], nextCursor: string \| null }` |
| `FetchMySecurityLogsQuery` | `user_security_audit_logs_views` | `JwtAuthGuard` | `{ userId, action?, from?: Date, to?: Date, cursor?: string, limit?: number }` | `{ items: PersonalSecurityLogDto[], nextCursor: string \| null }` |

---

## 4. Contratos Cross-Module Consumidos pelo `audit`

- **`BillingFacadeContract.hasFeatureFlag({ organizationId, featureKey: 'audit_logs' })`:** validado na `FetchOrganizationAuditLogsQuery`.
- **`BillingFacadeContract.getOrganizationAuditLogPolicy(organizationId)`:** consultado no `OrganizationAuditLogProjector` para saber se deve gravar (`enabled`) e por quantos dias (`retentionDays: number | 'unlimited'`).
- **`TenancyFacadeContract.getOrganizationSummary(organizationId)`:** consultado no `OrganizationAuditLogProjector` para verificar `auditLogsEnabled: boolean`.
- **`IamFacadeContract.getUserSummaryById(actorId)`:** consultado no `OrganizationAuditLogProjector` para desnormalizar `actorName` e `actorEmail`.

---

## 5. Modelagem de Dados e Índices no MongoDB

### 5.1. Collection `organization_audit_logs_views`

```typescript
export interface OrganizationAuditLogViewDocument {
  _id: string // eventId (UUIDv7 — k-sortable)
  organizationId: string
  action: string // ex.: 'role.updated' | 'invoice.paid'
  targetType: 'Organization' | 'Role' | 'Member' | 'Invite' | 'Subscription' | 'Invoice'
  targetId: string // aggregateId
  actor: {
    actorId: string | null
    actorType: 'USER' | 'SYSTEM' | 'WEBHOOK' | 'ANONYMOUS'
    actorName: string | null
    actorEmail: string | null
    ipAddress: string | null
    userAgent: string | null
  }
  metadata: Record<string, unknown> // Sanitizado pelo AuditLogSanitizer
  correlationId: string
  occurredAt: Date
  expiresAt: Date | null // null quando retentionDays === 'unlimited'
}
```

**Índices de `organization_audit_logs_views`:**
1. `{ organizationId: 1, _id: -1 }` — listagem principal ordenada cronologicamente e paginação por cursor O(1) (já que `_id` é UUIDv7).
2. `{ organizationId: 1, action: 1, _id: -1 }` — filtro por tipo de ação.
3. `{ organizationId: 1, 'actor.actorId': 1, _id: -1 }` — filtro por autor da ação + atualização em caso de anonimização.
4. `{ expiresAt: 1 }` com `{ expireAfterSeconds: 0 }` — **índice TTL nativo do MongoDB** (apaga automaticamente documentos cujo `expiresAt <= now()` e ignora documentos com `expiresAt: null`).

### 5.2. Collection `user_security_audit_logs_views`

```typescript
export interface PersonalSecurityAuditLogViewDocument {
  _id: string // eventId (UUIDv7)
  userId: string
  action: string // ex.: 'session.authenticated' | 'mfa.enabled' | 'password.changed'
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown>
  correlationId: string
  occurredAt: Date
  expiresAt: Date
}
```

**Índices de `user_security_audit_logs_views`:**
1. `{ userId: 1, _id: -1 }` — listagem e paginação por cursor do histórico de segurança do próprio usuário.
2. `{ expiresAt: 1 }` com `{ expireAfterSeconds: 0 }` — índice TTL nativo do MongoDB.

---

## 6. Endpoints HTTP (`src/modules/audit/presentation/http/`)

| Método | Rota | Use Case (Query) | Guard / Permissão | HTTP Status Sucesso |
|---|---|---|---|---|
| `GET` | `/organizations/:orgId/audit-logs` | `FetchOrganizationAuditLogsQuery` | `PoliciesGuard` (`read AuditLog`) + Feature Flag `audit_logs` | `200 OK` |
| `GET` | `/me/security-logs` | `FetchMySecurityLogsQuery` | `JwtAuthGuard` | `200 OK` |
