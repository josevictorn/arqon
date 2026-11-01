# Spec Técnica — Módulo `notifications` (In-App Inbox, Transactional Emails & Preferences)

> Fonte da verdade de **engenharia e modelo de domínio** do módulo `notifications`. Derivada do [PRD aprovado (`./prd.md`)](./prd.md). Arquitetura técnica: [03-module-anatomy.md](../../architecture/03-module-anatomy.md), [04-cqrs-and-events.md](../../architecture/04-cqrs-and-events.md), [05-integrations-resilience.md](../../architecture/05-integrations-resilience.md).

- **Status:** ✅ Especificado
- **PRD:** [`./prd.md`](./prd.md)
- **Fase do roadmap:** F9
- **ADRs relevantes:** [0005](../../decisions/0005-biblioteca-de-resiliencia.md), [0008](../../decisions/0008-idempotencia-de-consumers.md), [0009](../../decisions/0009-domain-events-e-unit-of-work.md), [0014](../../decisions/0014-identificadores-uuidv7.md)

---

## 1. Modelo de Domínio (`src/modules/notifications/domain/`)

> Regra inegociável: `domain/` é TypeScript puro (zero imports de NestJS, Prisma, MongoDB, `nodemailer` ou Zod).

### 1.1. Aggregates, Entities e Value Objects

| Tipo | Nome | Identidade | Responsabilidade e Propriedades |
|---|---|---|---|
| **Aggregate Root** | `Notification` | `UniqueEntityID` (UUIDv7) | Mensagem na Inbox In-App de um usuário destinatário.<br/>**Props:** `recipientUserId: UniqueEntityID`, `organizationId: UniqueEntityID \| null`, `category: NotificationCategory`, `type: string` (ex.: `'billing.invoice_payment_failed'`), `titleI18nKey: string`, `bodyI18nKey: string`, `interpolationArgs: Record<string, string \| number>`, `actionUrl: string \| null`, `readAt: Date \| null`, `createdAt: Date` |
| **Aggregate Root** | `NotificationPreference` | `UniqueEntityID` (UUIDv7) | Preferências de entrega de um usuário para uma categoria configurável.<br/>**Props:** `userId: UniqueEntityID`, `category: NotificationCategory`, `inAppEnabled: boolean`, `emailEnabled: boolean`, `updatedAt: Date` |
| **Value Object / Enum** | `NotificationCategory` | Valor (`'SECURITY_ALERT' \| 'BILLING_ALERT' \| 'TEAM_ACTIVITY'`) | Categoria configurável de notificação. *(E-mails transacionais críticos de acesso à conta operam fora dessa preferência por serem obrigatórios).* |

---

## 2. Invariantes e Catálogo Fechado de Erros

Toda violação retorna `Left<DomainError>` com `code` e `i18nKey` traduzidos em `src/shared/infra/i18n/locales/{en,pt-BR}/notifications.json`.

| Invariante | Regra de Domínio / Aplicação | Código de Erro (`code`) | Chave i18n (`i18nKey`) | HTTP |
|---|---|---|---|---|
| **INV-01** | Todo processamento de evento em consumers e projectors de notificação é idempotente (`processed_events` / `BaseProjector`) | — | — | — |
| **INV-02** | Um usuário só pode ler ou marcar como lida uma notificação cujo `recipientUserId === currentUserId` | `COMMON.RESOURCE_NOT_FOUND` | `errors.common.resource_not_found` | `404 Not Found` |
| **INV-03** | Marcar como lida uma notificação já lida (`readAt !== null`) é *no-op* idempotente (não reemite evento nem altera `readAt`) | — | — | `204 No Content` |
| **INV-04** | Categorias de preferência aceitas em `UpdateNotificationPreferences` são estritamente `SECURITY_ALERT`, `BILLING_ALERT` e `TEAM_ACTIVITY` | `NOTIFICATIONS.INVALID_NOTIFICATION_CATEGORY` | `errors.notifications.invalid_notification_category` | `422 Unprocessable Entity` |

---

## 3. Commands, Queries, Subscribers e Projectors (`src/modules/notifications/application/`)

### 3.1. Commands (Write — PostgreSQL + Outbox + `MailGateway`)

| Command | Input | Regras e Efeitos | Integration Event (Outbox) |
|---|---|---|---|
| `SendNotificationCommand` | `{ recipientUserId, recipientEmail, recipientName, recipientLocale, organizationId?, category, type, titleI18nKey, bodyI18nKey, interpolationArgs, actionUrl?, emailTemplate? }` | Consulta `NotificationPreference` do `recipientUserId` para `category` (default se não existir: `{ inAppEnabled: true, emailEnabled: true }`):<br/>• Se `inAppEnabled`: persiste `Notification` no Postgres e adiciona evento no Outbox.<br/>• Se `emailEnabled` e `emailTemplate` fornecido: envia e-mail via `MailGateway`. | `notifications.notification.created.v1` *(se `inAppEnabled === true`)* |
| `MarkNotificationAsReadCommand` | `{ userId, notificationId }` | INV-02, INV-03; se `readAt === null`, define `notification.markAsRead(now)` | `notifications.notification.read.v1` *(apenas se transicionou de não lida para lida)* |
| `MarkAllNotificationsAsReadCommand` | `{ userId }` | Marca todas as notificações com `recipientUserId === userId && readAt === null` como `readAt = now()` | `notifications.notifications.all_read.v1` |
| `UpdateNotificationPreferencesCommand` | `{ userId, preferences: Array<{ category: NotificationCategory, inAppEnabled: boolean, emailEnabled: boolean }> }` | INV-04; faz upsert das preferências por `(userId, category)` no PostgreSQL | — |

### 3.2. Subscribers / Consumers de Eventos Externos (`src/modules/notifications/presentation/consumers/`)

Todos herdam de `BaseSubscriber` (`processed_events` no PostgreSQL — [ADR-0008](../../decisions/0008-idempotencia-de-consumers.md)):

| Subscriber | Eventos Consumidos | Pipeline | Comportamento |
|---|---|---|---|
| `TransactionalAuthEmailsSubscriber` | • `iam.email_verification.requested.v1`<br/>• `iam.mfa.email_otp_requested.v1`<br/>• `iam.password.reset_requested.v1`<br/>• `iam.user.deletion_requested.v1`<br/>• `iam.user.deletion_canceled.v1` | **Pipeline 1 (Apenas E-mail Obrigatório)** | Renderiza o template i18n correspondente no `locale` do evento e envia via `MailGateway` (`@Resilient('mail')`). |
| `OrganizationInviteEmailSubscriber` | • `tenancy.member.invited.v1` | **Pipeline 1 (Apenas E-mail Obrigatório)** | Renderiza `emails.tenancy.organization_invite` no `locale` do convite e envia para `email` via `MailGateway`. |
| `SecurityAlertsNotificationSubscriber` | • `iam.password.changed.v1`<br/>• `iam.mfa.enabled.v1`<br/>• `iam.mfa.disabled.v1`<br/>• `iam.session.revoked.v1` *(quando `reason === 'TOKEN_REUSE_DETECTED'`)* | **Pipeline 2 (`SendNotificationCommand` — `SECURITY_ALERT`)** | Consulta `IamFacade.getUserSummaryById(userId)` (se não estiver anonimizado) e executa `SendNotificationCommand`. |
| `BillingAlertsNotificationSubscriber` | • `billing.invoice.payment_failed.v1` | **Pipeline 2 (`SendNotificationCommand` — `BILLING_ALERT`)** | Consulta `TenancyFacade.getOrganizationOwnerUserIds(organizationId)` + `IamFacade.getUsersSummaryByIds(ownerIds)` e executa `SendNotificationCommand` para cada `Owner`. |
| `TeamActivityNotificationSubscriber` | • `tenancy.member.accepted.v1` | **Pipeline 2 (`SendNotificationCommand` — `TEAM_ACTIVITY`)** | Notifica o membro que enviou o convite (`invitedByUserId`) que o novo membro ingressou na organização. |
| `OnUserAnonymizedNotificationsSubscriber` | • `iam.user.anonymized.v1` | **Limpeza LGPD/GDPR** | Deleta todas as linhas de `notifications` e `notification_preferences` do `userId` no Postgres e remove os documentos em `user_notifications_views` e `user_notification_counters_views` no MongoDB. |

### 3.3. Queries (Read — MongoDB / PostgreSQL)

| Query | Fonte de Leitura | Input | Output |
|---|---|---|---|
| `FetchUserNotificationsQuery` | MongoDB (`user_notifications_views` + `user_notification_counters_views`) | `{ userId, locale, unreadOnly?: boolean, cursor?: string, limit?: number }` | `{ unreadCount: number, items: Array<{ id, organizationId, category, type, title, body, actionUrl, readAt, createdAt }>, nextCursor: string \| null }` *(traduz `titleI18nKey` e `bodyI18nKey` usando `I18nService` em tempo de leitura)* |
| `GetNotificationPreferencesQuery` | PostgreSQL (`notification_preferences`) | `{ userId }` | `Array<{ category: NotificationCategory, inAppEnabled: boolean, emailEnabled: boolean }>` *(mesclando com defaults `true` para categorias ainda não persistidas)* |

### 3.4. Read Models / Projectors (`src/modules/notifications/presentation/projectors/`)

| Projector | Collections MongoDB | Eventos Consumidos | Comportamento Idempotente (`BaseProjector` — ADR-0008) |
|---|---|---|---|
| `NotificationsInboxProjector` | • `user_notifications_views`<br/>• `user_notification_counters_views` | • `notifications.notification.created.v1`<br/>• `notifications.notification.read.v1`<br/>• `notifications.notifications.all_read.v1` | • `created`: insere doc em `user_notifications_views` e faz `$inc: { unreadCount: 1 }` em `user_notification_counters_views`.<br/>• `read`: define `readAt` e `ttlExpiresAt` (+90d) no doc e faz `$inc: { unreadCount: -1 }` (garantindo `>= 0`).<br/>• `all_read`: atualiza todos os docs com `readAt: null` do `userId` e define `unreadCount: 0`. |

---

## 4. Contratos Cross-Module e Gateways

### 4.1. Facades Consumidas pelo `notifications`
- **`IamFacadeContract.getUserSummaryById(userId)` / `getUsersSummaryByIds(userIds)`:** obtém `name`, `email` e `locale` atualizados do(s) destinatário(s).
- **`TenancyFacadeContract.getOrganizationOwnerUserIds(organizationId)` e `getOrganizationSummary(organizationId)`:** obtém os `Owners` e o nome da organização para alertas de cobrança e equipe.

### 4.2. Integration Events Publicados pelo `notifications`

| Tópico | Quando é emitido | Payload (Resumo) | Consumidores |
|---|---|---|---|
| `notifications.notification.created.v1` | `SendNotificationCommand` | `{ notificationId, recipientUserId, organizationId, category, type, titleI18nKey, bodyI18nKey, interpolationArgs, actionUrl, createdAt }` | `notifications` (`NotificationsInboxProjector`) |
| `notifications.notification.read.v1` | `MarkNotificationAsReadCommand` | `{ notificationId, recipientUserId, readAt }` | `notifications` (`NotificationsInboxProjector`) |
| `notifications.notifications.all_read.v1` | `MarkAllNotificationsAsReadCommand` | `{ recipientUserId, readAt }` | `notifications` (`NotificationsInboxProjector`) |

---

## 5. Modelagem de Dados e Armazenamento

### 5.1. PostgreSQL — Prisma Schema (`notifications` e `notification_preferences`)

```prisma
model Notification {
  id                String    @id @db.Uuid
  recipientUserId   String    @map("recipient_user_id") @db.Uuid
  organizationId    String?   @map("organization_id") @db.Uuid
  category          String    @db.VarChar(40) // SECURITY_ALERT | BILLING_ALERT | TEAM_ACTIVITY
  type              String    @db.VarChar(80)
  titleI18nKey      String    @map("title_i18n_key") @db.VarChar(120)
  bodyI18nKey       String    @map("body_i18n_key") @db.VarChar(120)
  interpolationArgs Json      @default("{}") @map("interpolation_args") @db.JsonB
  actionUrl         String?   @map("action_url") @db.VarChar(255)
  readAt            DateTime? @map("read_at") @db.Timestamptz(3)
  createdAt         DateTime  @map("created_at") @db.Timestamptz(3)

  @@index([recipientUserId, readAt, createdAt(sort: Desc)], name: "idx_notifications_recipient_unread")
  @@map("notifications")
}

model NotificationPreference {
  id           String   @id @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  category     String   @db.VarChar(40)
  inAppEnabled Boolean  @default(true) @map("in_app_enabled")
  emailEnabled Boolean  @default(true) @map("email_enabled")
  updatedAt    DateTime @map("updated_at") @db.Timestamptz(3)

  @@unique([userId, category], name: "uq_notification_prefs_user_category")
  @@map("notification_preferences")
}
```

### 5.2. MongoDB Read Models (`user_notifications_views` e `user_notification_counters_views`)

- **`user_notifications_views`:**
  - Índices: `{ recipientUserId: 1, _id: -1 }`, `{ recipientUserId: 1, readAt: 1, _id: -1 }` e índice TTL `{ ttlExpiresAt: 1 }` (`expireAfterSeconds: 0`, preenchido com `readAt + 90 dias` quando a notificação é lida).
- **`user_notification_counters_views`:**
  - `_id`: `recipientUserId`
  - `unreadCount`: `number` (inteiro `>= 0`).

---

## 6. Endpoints HTTP (`src/modules/notifications/presentation/http/`)

| Método | Rota | Use Case (Command / Query) | Auth Guard | HTTP Status Sucesso |
|---|---|---|---|---|
| `GET` | `/me/notifications` | `FetchUserNotificationsQuery` | `JwtAuthGuard` | `200 OK` |
| `PATCH` | `/me/notifications/:notificationId/read` | `MarkNotificationAsReadCommand` | `JwtAuthGuard` | `204 No Content` |
| `POST` | `/me/notifications/read-all` | `MarkAllNotificationsAsReadCommand` | `JwtAuthGuard` | `204 No Content` |
| `GET` | `/me/notification-preferences` | `GetNotificationPreferencesQuery` | `JwtAuthGuard` | `200 OK` |
| `PUT` | `/me/notification-preferences` | `UpdateNotificationPreferencesCommand` | `JwtAuthGuard` | `200 OK` |
