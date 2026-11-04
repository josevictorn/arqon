# Catálogo de Integration Events

Fonte única de **quais eventos existem, quem produz e quem consome**. Toda task que cria, altera ou consome um evento atualiza este arquivo no mesmo PR.

- **Convenção de tópico:** `<bounded-context>.<aggregate>.<action>.v<version>` (ex.: `billing.subscription.paid.v1`)
- **DLQ:** `<topic>.dlq`
- **Chave da mensagem:** `aggregateId` (ordem por agregado). Ver [ADR-0007](../decisions/0007-outbox-relay.md).
- **Contrato (schema Zod + JSON Schema Registry):** `src/shared/contracts/events/<ctx>/<aggregate>-<action>.v<N>.event.ts`. Ver [ADR-0020](../decisions/0020-schema-registry-json-schema.md).
- **Envelope:** `IntegrationEventEnvelope<TPayload>` (`eventId` UUIDv7, `eventName`, `schemaVersion`, `aggregateId`, `aggregateVersion`, `occurredAt`, `tenantId`, `correlationId`, `traceparent`, `actor`, `payload`). Ver [ADR-0019](../decisions/0019-envelope-integration-event.md).
- **Breaking change** → nova versão (`v2`), publicando `v1` e `v2` em paralelo durante a transição.
- **`schemaVersion`** → revisão compatível dentro do tópico: começa em `1`, sobe `+1` a cada mudança `BACKWARD` compatível (ex.: campo opcional novo) e recomeça em `1` em cada novo `.vN`. Ver [ADR-0023](../decisions/0023-semantica-de-schema-version.md).

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
| `tenancy.organization.created.v1` | tenancy · `CreateOrganizationCommand` | billing · subscriber (cria assinatura `Free`); billing · `BillingOverviewProjector` (doc inicial); tenancy · projectors; audit | `organizationId`, `name`, `slug`, `ownerUserId`, `requireMfa` | 📝 Planejado |
| `tenancy.organization.updated.v1` | tenancy · `UpdateOrganizationCommand` | billing · `BillingOverviewProjector` (atualiza nome); tenancy · projectors; audit | `organizationId`, `name`, `slug`, `requireMfa` | 📝 Planejado |
| `tenancy.organization.deleted.v1` | tenancy · `DeleteOrganizationCommand` | billing · subscriber (cancela assinatura) + `BillingOverviewProjector`; tenancy · projectors; audit | `organizationId`, `slug`, `deletedByUserId` | 📝 Planejado |
| `tenancy.role.updated.v1` | tenancy · `CreateOrganizationCommand`, `Create/Update/DeleteCustomRoleCommand` | tenancy · `OrganizationRolesProjector`; audit | `organizationId`, `roleId`, `name`, `isSystemOwner`, `change` (`created`/`updated`/`deleted`), `permissions` | 📝 Planejado |
| `tenancy.member.roles_updated.v1` | tenancy · `AssignRolesToMemberCommand`, `TransferOwnershipCommand` | tenancy · `OrganizationMembersProjector`, `OrganizationRolesProjector`; audit | `organizationId`, `userId`, `previousRoleIds`, `currentRoleIds` | 📝 Planejado |
| `tenancy.member.invited.v1` | tenancy · `InviteMemberCommand`, `ResendInviteCommand` | notifications · e-mail de convite; tenancy · `OrganizationMembersProjector`; audit (sem token) | `organizationId`, `organizationName`, `inviteId`, `email`, `roleIds`, `invitedByUserId`, `inviteToken`, `locale`, `expiresAt` | 📝 Planejado |
| `tenancy.invite.canceled.v1` | tenancy · `CancelInviteCommand` | tenancy · `OrganizationMembersProjector`; audit | `organizationId`, `inviteId`, `email`, `canceledByUserId` | 📝 Planejado |
| `tenancy.member.accepted.v1` | tenancy · `AcceptInviteCommand` | billing · `BillingOverviewProjector` (`$inc usage.currentMembers: 1`); tenancy · `OrganizationMembersProjector`, `OrganizationRolesProjector`; audit | `organizationId`, `userId`, `inviteId`, `roleIds` | 📝 Planejado |
| `tenancy.member.removed.v1` | tenancy · `RemoveMemberCommand`, `LeaveOrganizationCommand`, `OnUserAnonymizedSubscriber` | billing · `BillingOverviewProjector` (`$inc usage.currentMembers: -1`); tenancy · `OrganizationMembersProjector`, `OrganizationRolesProjector`; audit | `organizationId`, `userId`, `roleIds`, `reason` | 📝 Planejado |
| `billing.subscription.updated.v1` | billing · `OnOrganizationCreatedSubscriber`, `ChangeSubscriptionPlanCommand`, `CancelSubscriptionCommand`, `ReactivateSubscriptionCommand`, `ProcessPaymentWebhookCommand` | billing · `BillingOverviewProjector`; audit | `organizationId`, `subscriptionId`, `planCode`, `planName`, `pricingModel`, `status`, `cancelAtPeriodEnd`, `currentPeriodStart`, `currentPeriodEnd`, `quotas`, `features` | 📝 Planejado |
| `billing.invoice.paid.v1` | billing · `ProcessPaymentWebhookCommand` | billing · `BillingOverviewProjector`; audit | `organizationId`, `subscriptionId`, `invoiceId`, `provider`, `amountCents`, `currency`, `hostedInvoiceUrl`, `periodStart`, `periodEnd`, `paidAt` | 📝 Planejado |
| `billing.invoice.payment_failed.v1` | billing · `ProcessPaymentWebhookCommand` | notifications · e-mail + in-app para Owners; billing · `BillingOverviewProjector`; audit | `organizationId`, `subscriptionId`, `invoiceId`, `provider`, `amountCents`, `currency`, `hostedInvoiceUrl`, `reason`, `failedAt` | 📝 Planejado |
| `notifications.notification.created.v1` | notifications · `SendNotificationCommand` | notifications · `NotificationsInboxProjector` | `notificationId`, `recipientUserId`, `organizationId`, `category`, `type`, `titleI18nKey`, `bodyI18nKey`, `interpolationArgs`, `actionUrl`, `createdAt` | 📝 Planejado |
| `notifications.notification.read.v1` | notifications · `MarkNotificationAsReadCommand` | notifications · `NotificationsInboxProjector` | `notificationId`, `recipientUserId`, `readAt` | 📝 Planejado |
| `notifications.notifications.all_read.v1` | notifications · `MarkAllNotificationsAsReadCommand` | notifications · `NotificationsInboxProjector` | `recipientUserId`, `readAt` | 📝 Planejado |

Status: 📝 Planejado · 🚧 Em implementação · ✅ Publicado · 🗑️ Depreciado

