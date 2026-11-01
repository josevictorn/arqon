# Módulo `notifications` — In-App & Transactional

- **Status:** 📝 Planejado
- **Fase do roadmap:** F9
- **ADRs relevantes:** 0008

## Propósito
Entregar notificações in-app e e-mails transacionais (internacionalizados) em reação a eventos de outros módulos.

## Modelo de domínio
| Tipo | Nome | Descrição |
|---|---|---|
| Aggregate Root | `Notification` | Destinatário, tipo, conteúdo (chave i18n + args), `readAt` |
| Aggregate Root | `NotificationPreference` | Canais por tipo de notificação |

## Commands
| Command | Emite |
|---|---|
| `SendNotificationCommand` | ⚠️ `notifications.notification.created.v1`? |
| `MarkNotificationAsReadCommand` | ⚠️ `notifications.notification.read.v1`? |

## Consumers (Kafka)
| Evento | Efeito |
|---|---|
| `tenancy.member.invited.v1` | E-mail de convite no `locale` do convite |
| `billing.invoice.payment_failed.v1` | E-mail + in-app para os Owners da organização (via `TenancyFacade`?) |
| `iam.password.reset_requested.v1` ⚠️ | E-mail de reset (evento a confirmar no iam) |

## Queries / Projectors
| Item | Collection |
|---|---|
| `NotificationsInboxProjector` | `user_notifications_views` (contador de não lidas pré-calculado) |
| `FetchUnreadNotificationsQuery` | `user_notifications_views` |

## Perguntas abertas
- O e-mail é enviado direto no consumer (com idempotência) ou via `SendNotificationCommand`, que registra no Postgres antes?
- Como descobrir os Owners e os e-mails deles: Facades de tenancy + iam?
- Tempo real (SSE/WebSocket) está fora do escopo?

---
<details><summary>Escopo original do blueprint (§12.4)</summary>

- **Entities**: `Notification`, `NotificationPreference`.
- **Commands**: `SendNotificationCommand`, `MarkNotificationAsReadCommand`.
- **Projectors & Queries**: `NotificationsInboxProjector` → `user_notifications_views`; `FetchUnreadNotificationsQuery`.
- **Consumers**: `tenancy.member.invited.v1` → e-mail; `billing.invoice.payment_failed.v1` → e-mail + in-app para OWNER.
</details>

