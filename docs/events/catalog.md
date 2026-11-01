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
| `iam.email_verification.requested.v1` | iam · `RegisterUserCommand`, `ResendVerificationEmailCommand` | notifications · e-mail de verificação | `userId`, `name`, `email`, `locale`, `verificationToken`, `expiresAt` | 📝 Planejado |
| `iam.user.email_verified.v1` | iam · `VerifyEmailCommand` | iam · `UserProfileProjector`; audit | `userId`, `email`, `verifiedAt` | 📝 Planejado |
| `iam.session.authenticated.v1` | iam · `AuthenticateWithPasswordCommand`, `VerifyMfaChallengeCommand`, `CancelAccountDeletionCommand` | audit | `userId`, `sessionId`, `mfaVerified`, `ipAddress`, `userAgent` | 📝 Planejado |
| `iam.session.revoked.v1` | iam · `RefreshSessionTokenCommand` (reuso), `RevokeSessionCommand`, `RevokeOtherSessionsCommand` | notifications (se `TOKEN_REUSE_DETECTED`); audit | `userId`, `sessionId`, `reason` | 📝 Planejado |
| `iam.mfa.email_otp_requested.v1` | iam · `SendMfaEmailOtpCommand` | notifications · e-mail com OTP de 6 dígitos | `userId`, `name`, `email`, `locale`, `otpCode`, `expiresAt` | 📝 Planejado |
| `iam.mfa.enabled.v1` | iam · `EnableMfaTotpCommand` | iam · `UserProfileProjector`; notifications; audit | `userId`, `method`, `enabledAt` | 📝 Planejado |
| `iam.mfa.disabled.v1` | iam · `DisableMfaCommand` | iam · `UserProfileProjector`; notifications; audit | `userId`, `disabledAt` | 📝 Planejado |
| `iam.password.reset_requested.v1` | iam · `RequestPasswordResetCommand` | notifications · e-mail de reset; audit (sem token) | `userId`, `name`, `email`, `locale`, `resetToken`, `expiresAt` | 📝 Planejado |
| `iam.password.changed.v1` | iam · `ResetPasswordCommand`, `ChangePasswordCommand` | notifications · alerta de segurança; audit | `userId`, `changeType` (`RESET` \| `AUTHENTICATED_CHANGE`) | 📝 Planejado |
| `iam.user.updated.v1` | iam · `UpdateUserProfileCommand` | iam · `UserProfileProjector`; tenancy · `OrganizationMembersProjector`; audit | `userId`, `name`, `avatarUrl`, `locale` | 📝 Planejado |
| `iam.user.deletion_requested.v1` | iam · `RequestAccountDeletionCommand` | notifications · e-mail de agendamento (15 dias); audit | `userId`, `name`, `email`, `locale`, `deletionScheduledFor` | 📝 Planejado |
| `iam.user.deletion_canceled.v1` | iam · `CancelAccountDeletionCommand` | notifications · e-mail de restauração; audit | `userId`, `name`, `email`, `locale`, `canceledAt` | 📝 Planejado |
| `iam.user.anonymized.v1` | iam · `AnonymizeExpiredAccountsCommand` | iam · `UserProfileProjector` (delete); tenancy (remove memberships); notifications (limpa inbox); audit | `userId`, `anonymizedAt` | 📝 Planejado |
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

- `billing.subscription.plan_changed.v1` → `BillingOverviewProjector` (troca de plano altera `plan` na view).
- `billing.subscription.created.v1` → `BillingOverviewProjector` (assinatura Free inicial).
- `notifications.notification.created.v1` / `read.v1` → `NotificationsInboxProjector` (se a inbox for projetada via Kafka).
- `tenancy.invite.canceled.v1` → `CancelInviteCommand` aparece no exemplo do §7.2.

