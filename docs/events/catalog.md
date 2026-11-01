# Catálogo de Integration Events

Fonte única de **quais eventos existem, quem produz e quem consome**. Toda task que cria, altera ou consome um evento atualiza este arquivo no mesmo PR.

- **Convenção de tópico:** `<bounded-context>.<aggregate>.<action>.v<version>` (ex.: `billing.subscription.paid.v1`)
- **DLQ:** `<topic>.dlq`
- **Chave da mensagem:** `aggregateId` (ordem por agregado). Ver [ADR-0007](../decisions/0007-outbox-relay.md).
- **Contrato (schema + tipo):** `src/shared/contracts/events/<ctx>/<aggregate>-<action>.v<N>.event.ts`
- **Envelope:** a definir na T2.05 (`eventId` UUIDv7, `aggregateId`, `aggregateVersion`, `occurredAt`, `tenantId`, `traceparent`, `payload`)
- **Breaking change** → nova versão (`v2`), publicando `v1` e `v2` em paralelo durante a transição.

## Eventos

| Tópico | Produtor (Command) | Consumidores | Payload (resumo) | Status |
|---|---|---|---|---|
| `iam.user.registered.v1` | iam · `RegisterUserCommand` | iam · `UserProfileProjector`; audit | `userId`, `name`, `email`, `locale` | 📝 Planejado |
| `iam.user.updated.v1` | iam · `UpdateUserAvatarCommand` (e futuros updates de perfil) | iam · `UserProfileProjector`; tenancy · `OrganizationMembersProjector`; audit | `userId`, campos alterados (`name`, `avatarUrl`) | 📝 Planejado |
| `tenancy.organization.created.v1` | tenancy · `CreateOrganizationCommand` | billing · subscriber (cria assinatura `Free`); billing · `BillingOverviewProjector` (doc inicial); tenancy · projectors; audit | `organizationId`, `name`, `slug`, `ownerUserId` | 📝 Planejado |
| `tenancy.role.updated.v1` | tenancy · `Create/Update/DeleteCustomRoleCommand` | tenancy · invalidação de cache de permissões; `OrganizationRolesProjector`; audit | `organizationId`, `roleId`, `change` (`created`/`updated`/`deleted`), `permissions` | 📝 Planejado |
| `tenancy.member.roles_updated.v1` | tenancy · `AssignRolesToMemberCommand`, `TransferOwnershipCommand` | tenancy · invalidação de cache; `OrganizationMembersProjector`; `OrganizationRolesProjector`; audit | `organizationId`, `userId`, `roleIds` | 📝 Planejado |
| `tenancy.member.invited.v1` | tenancy · `InviteMemberCommand` | notifications · e-mail de convite; tenancy · `OrganizationMembersProjector` (convites pendentes?); audit | `organizationId`, `inviteId`, `email`, `roleIds`, `invitedByUserId`, `locale` | 📝 Planejado |
| `tenancy.member.accepted.v1` | tenancy · `AcceptInviteCommand` | billing · `BillingOverviewProjector` (`$inc usage.currentMembers`); tenancy · `OrganizationMembersProjector`, `OrganizationRolesProjector`; audit | `organizationId`, `userId`, `inviteId`, `roleIds` | 📝 Planejado |
| `billing.subscription.paid.v1` ⚠️ | billing · `ProcessPaymentWebhookCommand` | billing · `BillingOverviewProjector`; audit | `organizationId`, `subscriptionId`, `invoiceSummary` | 📝 Planejado |
| `billing.invoice.payment_failed.v1` | billing · `ProcessPaymentWebhookCommand` | notifications · e-mail + in-app para Owners; billing · `BillingOverviewProjector`; audit | `organizationId`, `invoiceId`, `amountCents`, `currency`, `reason` | 📝 Planejado |

Status: 📝 Planejado · 🚧 Em implementação · ✅ Publicado · 🗑️ Depreciado

> [!WARNING]
> ⚠️ **Inconsistência no blueprint:** o §5.2 usa `billing.invoice.paid.v1` e o `BillingOverviewProjector.onInvoicePaid`; o §12 e `shared/contracts` usam `billing.subscription.paid.v1`. Decidir antes da T7.05 (ver [Perguntas abertas](../decisions/README.md#perguntas-abertas-viram-adr-quando-a-task-correspondente-se-aproximar)).

## Eventos possivelmente faltantes (avaliar na fase do módulo)

- `iam.password.reset_requested.v1` → notifications (e-mail de reset). O blueprint não define como o e-mail de reset é enviado.
- `billing.subscription.plan_changed.v1` → `BillingOverviewProjector` (troca de plano altera `plan` na view).
- `billing.subscription.created.v1` → `BillingOverviewProjector` (assinatura Free inicial).
- `notifications.notification.created.v1` / `read.v1` → `NotificationsInboxProjector` (se a inbox for projetada via Kafka).
- `tenancy.invite.canceled.v1` → `CancelInviteCommand` aparece no exemplo do §7.2.

