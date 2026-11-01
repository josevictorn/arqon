# ADR-0018: Taxonomia de eventos do `billing` e catálogo declarativo de planos (`FREE` + `FLAT_RATE` extensível)

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.05, T7.01, T7.02, T7.05, T7.06, T7.07
- **Docs afetados:** [`docs/events/catalog.md`](../events/catalog.md), [`docs/modules/billing/prd.md`](../modules/billing/prd.md), [`docs/modules/billing/spec.md`](../modules/billing/spec.md)

## Contexto

Havia duas decisões arquiteturais pendentes para o módulo `billing`:
1. **Inconsistência de eventos no blueprint original:** o §5.2 do blueprint usava `billing.invoice.paid.v1` (no `BillingOverviewProjector.onInvoicePaid`), enquanto o §12 e a árvore de contratos usavam `billing.subscription.paid.v1`. Além disso, faltava um evento semântico claro quando a assinatura era criada no plano `Free`, trocava de plano ou tinha seu cancelamento agendado/reativado.
2. **Modelagem de planos e precificação em um boilerplate comercializável:** precisávamos definir como os planos, *quotas* numéricas e *feature flags* booleanas são configurados pelo desenvolvedor que utiliza o boilerplate e quais modelos de cobrança vêm implementados na v1 sem gerar *over-engineering*, mas mantendo a porta aberta para novos modelos no futuro.

## Opções consideradas

### Opção A — Padronizar `billing.invoice.paid.v1` + `billing.subscription.updated.v1` e Catálogo Code-First (`FREE` + `FLAT_RATE` na v1, extensível via `SubscriptionPricingStrategy`)
- ✅ **Semântica DDD exata nos eventos:**
  - `billing.invoice.paid.v1`: emitido quando uma fatura (`Invoice`) é efetivamente paga no gateway (seja no 1º checkout ou em renovações).
  - `billing.invoice.payment_failed.v1`: emitido quando o pagamento de uma fatura falha.
  - `billing.subscription.updated.v1`: emitido sempre que o estado da `Subscription` muda (provisionamento `Free` inicial, ativação de plano pago, upgrade/downgrade, agendamento de cancelamento `cancelAtPeriodEnd`, reativação ou retorno ao plano `Free`).
- ✅ **Simplicidade + Alta Comercializabilidade:** o arquivo `plans.catalog.ts` permite que o comprador do boilerplate customize nomes de planos, preços, *quotas* (`QuotaKey`) e *features* (`FeatureKey`) com inferência completa do TypeScript, suportando nativamente **Freemium (`FREE`)** e **Taxa Fixa (`FLAT_RATE`)** na v1.
- ✅ **Extensibilidade (Open-Closed):** `Plan` e `Subscription` já possuem `pricingModel` + `quantity` e delegam cálculos para `SubscriptionPricingStrategy`, permitindo adicionar `PER_SEAT` ou `USAGE_BASED` no futuro sem quebrar contratos nem migrations existentes.

### Opção B — Manter apenas `billing.subscription.paid.v1` e planos gerenciados via CRUD Admin no banco
- ❌ `subscription.paid` mistura os conceitos de `Subscription` (ciclo de vida do contrato) e `Invoice` (cobrança financeira de um período).
- ❌ CRUD dinâmico de planos no banco perde a tipagem estática de `FeatureKey` e `QuotaKey` na IDE quando outros módulos chamam a `BillingFacade`.

## Decisão

Adotamos a **Opção A**:
1. **Taxonomia de Eventos do `billing`:**
   - `billing.invoice.paid.v1` (substitui `billing.subscription.paid.v1` em toda a documentação e contratos).
   - `billing.invoice.payment_failed.v1`.
   - `billing.subscription.updated.v1`.
2. **Catálogo Declarativo e Extensível (`plans.catalog.ts`):**
   - Na v1, o boilerplate implementa os modelos `FREE` (alicerce Freemium automático para todo novo tenant, sem chamar gateway externo) e `FLAT_RATE` (assinatura fixa mensal/anual via Stripe/Asaas).
   - O cálculo de preço e pró-rata é encapsulado atrás de `SubscriptionPricingStrategy` para facilitar a adição futura de novos modelos (`PER_SEAT`, `TIERED`, etc.).

## Consequências

- **Positivas:**
  - Elimina a duplicidade/ambiguidade entre `invoice.paid` e `subscription.paid`.
  - O `BillingOverviewProjector` tem eventos claros para atualizar tanto os dados do plano (`billing.subscription.updated.v1`) quanto a lista das últimas 5 faturas (`billing.invoice.paid.v1` / `billing.invoice.payment_failed.v1`).
  - Zero lógica condicional `if (!subscription)` nos módulos consumidores graças ao alicerce Freemium obrigatório (`isDefaultFree: true`).
- **Negativas / trade-offs aceitos:**
  - Alterar o catálogo de planos (`plans.catalog.ts`) é uma mudança de código/configuração sincronizada no boot/seed.
- **Ações decorrentes:**
  - Atualizar `docs/events/catalog.md` removendo o alerta `⚠️` de `billing.subscription.paid.v1`.

## Regras para a IA

1. Nunca use o tópico `billing.subscription.paid.v1`; use `billing.invoice.paid.v1` para faturas pagas e `billing.subscription.updated.v1` para mudanças de plano/status da assinatura.
2. Nunca hardcode nomes de planos ou limites dentro dos Use Cases: sempre consulte o catálogo tipado (`plans.catalog.ts`) ou a `BillingFacadeContract` (`checkFeatureQuota` / `hasFeatureFlag`).
3. Todo novo tenant criado (`tenancy.organization.created.v1`) deve receber imediatamente uma `Subscription` local vinculada ao plano com `isDefaultFree: true` sem realizar chamadas HTTP a gateways de pagamento.

