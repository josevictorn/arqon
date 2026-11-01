# Módulo `billing` — Plans, Subscriptions, Invoices & Quotas

> Fonte da verdade de **negócio** do módulo. Arquitetura técnica: [04-cqrs-and-events.md](../../architecture/04-cqrs-and-events.md), [05-integrations-resilience.md](../../architecture/05-integrations-resilience.md).

- **Status:** 📝 Planejado
- **Fase do roadmap:** F7
- **ADRs relevantes:** 0005, 0008, 0009

## Propósito
Planos, assinaturas, faturas, quotas e integração com provedores de pagamento (Stripe/Asaas via `src/integrations/payment`).

## Modelo de domínio
| Tipo | Nome | Descrição |
|---|---|---|
| Aggregate Root | `Subscription` | Organização, plano, status (`ACTIVE`/`TRIALING`/`PAST_DUE`/`CANCELED`), período |
| Entity | `Plan` | Nome, preço (`Money`), quotas (`max_members`, `max_storage_mb`) |
| Entity | `Invoice` | Valor, status (`PAID`/`OPEN`/`FAILED`), `paidAt` |
| Value Object | `Money` | Centavos (inteiro) + moeda ISO 4217; aritmética só entre mesma moeda |
| Factory | `SubscriptionDomainFactory` | |
| Domain Service | `ProrationCalculatorDomainService` | |

## Invariantes
- **INV-01:** uma organização tem no máximo 1 assinatura não cancelada
- **INV-02:** `Money` nunca é negativo e nunca mistura moedas → `BILLING.CURRENCY_MISMATCH`
- **INV-03:** webhooks são idempotentes (mesmo evento do provedor processado uma única vez)
- **INV-04:** uso acima da quota é bloqueado → `BILLING.PLAN_QUOTA_EXCEEDED`

## Commands (Write — PostgreSQL)
| Command | Regras | Emite |
|---|---|---|
| `CreateCheckoutSessionCommand` | `PaymentGatewayFactory` (Stripe/Asaas) | — |
| `ChangeSubscriptionPlanCommand` | Pró-rata | ⚠️ `billing.subscription.plan_changed.v1`? |
| `ProcessPaymentWebhookCommand` | INV-03; payload já traduzido pela ACL | `billing.subscription.paid.v1` ⚠️ / `billing.invoice.payment_failed.v1` |

## Subscribers
| Evento | Efeito |
|---|---|
| `tenancy.organization.created.v1` | Cria assinatura no plano `Free` |

## Queries / Projectors
| Item | Collection | Detalhe |
|---|---|---|
| `BillingOverviewProjector` | `billing_overview_views` | Plano, uso (`$inc`), últimas 5 faturas (`$push` + `$slice: 5`) |
| `GetBillingOverviewQuery` | `billing_overview_views` | Policy `read Subscription` |

## Facade pública (`BillingFacadeContract`)
| Método | Retorno |
|---|---|
| `checkFeatureQuota({ organizationId, featureKey, currentUsage })` | `{ allowed, limit, currentUsage, planName }` |

## Perguntas abertas
- `billing.invoice.paid.v1` vs `billing.subscription.paid.v1` (inconsistência do blueprint).
- `BillingOverviewProjector` precisa de `organizationName`: vem de `tenancy.organization.created.v1` (projeção cross-module). Confirmar.
-Planos ficam em seed (código) ou são gerenciáveis via API admin?
- Cancelamento de assinatura e downgrade com uso acima da nova quota.
- `storageUsedMb`: quem emite o evento de uso de storage?

---
<details><summary>Escopo original do blueprint (§12.3)</summary>

- **Entities / VOs**: `Plan`, `Subscription` (AggregateRoot), `Invoice`, `Money`.
- **Domain Factory & Service**: `SubscriptionDomainFactory`, `ProrationCalculatorDomainService`.
- **Commands**: `CreateCheckoutSessionCommand`, `ChangeSubscriptionPlanCommand`, `ProcessPaymentWebhookCommand`.
- **Projectors & Queries**: `BillingOverviewProjector`, `GetBillingOverviewQuery`.
- **Subscribers**: `tenancy.organization.created.v1` → plano `Free`.
- **Facade**: `checkFeatureQuota(organizationId, featureKey, currentUsage)`.
</details>

