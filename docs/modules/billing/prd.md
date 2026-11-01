# PRD — Módulo `billing` (Freemium, Flat-Rate & Custom Entitlements Extensíveis)

- **Status:** ✅ Aprovado
- **Fase do Roadmap:** F7
- **Spec técnica derivada:** [`./spec.md`](./spec.md)
- **Referências de mercado:**
  - **Gateways & Motores de Assinatura:** Stripe Billing, Asaas Assinaturas.
  - **Gestão de Entitlements & Catálogo Config-Driven:** Stripe Entitlements, Stigg, Schematic, Autumn, Lago.
  - **SaaS B2B de Referência:** Vercel, Linear, Supabase, Clerk.

---

## 1. Visão Geral e Propósito

Para construir um boilerplate altamente comercializável, robusto e **livre de *over-engineering*** no primeiro momento, o módulo **`billing`** entrega na v1 a fundação essencial de monetização SaaS B2B:
1. **O Alicerce Freemium (`FREE`):** todo tenant recém-criado nasce automaticamente vinculado a um plano gratuito persistido no banco local (zero chamada externa ao Stripe/Asaas no onboarding). Isso elimina condicionais `if (!subscription)` em toda a plataforma.
2. **Suporte Completo a Flat-Rate (`FLAT_RATE`):** cobrança recorrente de valor fixo (`MONTHLY` ou `YEARLY`) via Checkout do Stripe ou Asaas. Quando o webhook confirma o pagamento, o status local vai para `ACTIVE` e libera imediatamente as novas *quotas* numéricas (ex.: `max_members: 25`) e *feature flags* booleanas (ex.: `custom_domain: true`).
3. **Customização Fácil pelo Desenvolvedor (Config-Driven Catalog):** os planos, códigos, preços, limites numéricos (*quotas*) e funcionalidades liga/desliga (*feature flags*) são 100% customizáveis em um único arquivo declarativo e fortemente tipado (`plans.catalog.ts`).
4. **Design Extensível para Futuros Modelos de Cobrança (Open-Closed):** a modelagem de domínio (`Plan`, `Subscription`, `PricingModel`) e o contrato do `PaymentGateway` já nascem desacoplados via *Strategy*, permitindo plugar futuramente cobrança por assento (`PER_SEAT`) ou por uso (`USAGE_BASED`) sem refatorar os módulos consumidores nem quebrar o schema do banco.

### Fronteira do Contexto Delimitado (O que é vs. O que não é `billing`)
- **É responsabilidade do `billing`:** catálogo configurável de planos (`Plan`), *entitlements* (quotas numéricas + *feature flags* booleanas), ciclo de vida da assinatura (`Subscription`), cálculo de pró-rata (`Proration`), faturas (`Invoice`), processamento idempotente de webhooks e a `BillingFacade` consumida pelos demais módulos.
- **NÃO é responsabilidade do `billing`:** gerenciar quem são os membros (pertence ao `tenancy`), enviar e-mails diretamente (pertence ao `notifications`) ou acoplar o domínio aos SDKs do Stripe/Asaas (toda comunicação externa vive em `src/integrations/payment/` atrás de `PaymentGateway` + ACL + `@Resilient`).

---

## 2. Benchmark de Mercado e Pilares da Arquitetura

| Pilar | Referência de Mercado | Como funciona no Boilerplate |
|---|---|---|
| **1. Alicerce Freemium (`FREE`)** | Supabase / Clerk / Linear | Ao receber `tenancy.organization.created.v1`, o `billing` cria imediatamente uma `Subscription` local vinculada ao plano marcado como `isDefaultFree: true` (sem bater no Stripe/Asaas). Assim, o módulo `tenancy` e o `RateLimiter` já consomem quotas desde o segundo zero (ex.: travando no 3º membro). |
| **2. Núcleo Flat-Rate (`FLAT_RATE`)** | Stripe Billing / Basecamp | A organização escolhe um plano pago fixo (`MONTHLY` ou `YEARLY`), conclui o checkout e o webhook atualiza a assinatura local para `ACTIVE`, liberando as *feature flags* (`hasFeatureFlag`) e *quotas* (`checkFeatureQuota`) daquele plano. |
| **3. Catálogo Code-First Customizável** | Stigg / Schematic / Stripe Entitlements | O usuário do boilerplate define seus planos, *features* booleanas e *quotas* numéricas em um único arquivo (`plans.catalog.ts`). O TypeScript infere automaticamente os tipos literais de `FeatureKey` e `QuotaKey` em toda a aplicação, e um seed idempotente sincroniza o catálogo com o PostgreSQL. |
| **4. Extensibilidade para Novos Modelos (`PricingModel`)** | Lago / Stripe | O domínio separa o tipo do modelo de precificação (`pricingModel: 'FREE' \| 'FLAT_RATE'`, extensível para `'PER_SEAT'`, `'TIERED'`, etc.) e mantém o rastreamento de uso (`usage.currentMembers`) atualizado por eventos do `tenancy`, deixando o gancho pronto para evoluções futuras. |

---

## 3. Customização pelo Desenvolvedor (`plans.catalog.ts`)

Quem utiliza o boilerplate precisa conseguir definir seus próprios planos, nomes, preços, limites e flags em poucos minutos, sem caçar valores hardcoded pelo código.

Por isso, toda a configuração comercial vive em **`src/modules/billing/domain/catalog/plans.catalog.ts`**, dividida em 3 partes que o desenvolvedor customiza livremente:

1. **Quotas Numéricas (`QuotaKey`):** limites quantitativos (`number | 'unlimited'`).
   - *Quotas nativas usadas pelo boilerplate:*
     - `max_members`: limite máximo de membros + convites pendentes na organização (validado pelo `tenancy`).
     - `rate_limit_rpm`: limite de requisições por minuto da organização (aplicado pelo `RateLimiter` distribuído em Redis).
   - *Fácil adição pelo desenvolvedor:* basta adicionar uma chave no objeto do catálogo (ex.: `max_projects`, `max_webhooks`) para que ela fique imediatamente tipada no `BillingFacade.checkFeatureQuota`.
2. **Feature Flags Booleanas (`FeatureKey`):** capacidades liberadas pelo plano (`boolean`).
   - *Exemplos padrão no catálogo:* `custom_roles` (permite criar cargos customizados no `tenancy`), `audit_logs` (permite consultar logs de auditoria no `audit`), `custom_domain`, `priority_support`.
   - *Fácil adição pelo desenvolvedor:* basta declarar uma nova chave booleana no catálogo (ex.: `ai_assistant: true`) para consultá-la via `BillingFacade.hasFeatureFlag`.
3. **Catálogo de Planos (`PlanDefinition[]`):**
   - Totalmente customizável (quantidade de planos, nomes, slugs, descrições, preços em `BRL` e `USD` e mapeamento para IDs de preço do Stripe/Asaas via `.env`).
   - A única regra estrutural exigida pelo boilerplate é que **exista exatamente 1 plano com `isDefaultFree: true` (`pricingModel: 'FREE'`)**, que servirá como alicerce Freemium para novas organizações e fallback pós-cancelamento.

### Exemplo Default que Acompanha o Boilerplate (Editável pelo Usuário)

| `code` (Exemplo) | Nome | `pricingModel` | Intervalo | Preço Exemplo (`BRL` / `USD`) | `quotas` (`max_members` / `rate_limit_rpm`) | `features` (Exemplos) |
|---|---|---|---|---|---|---|
| `free` (`isDefaultFree: true`) | **Free** | `FREE` | `MONTHLY` | `0` / `0` | `3` membros · `60` rpm | `custom_roles: false`, `audit_logs: false`, `custom_domain: false` |
| `pro_monthly` | **Pro** | `FLAT_RATE` | `MONTHLY` | `9900` (R$ 99) / `2000` ($ 20) | `25` membros · `300` rpm | `custom_roles: true`, `audit_logs: false`, `custom_domain: true` |
| `pro_yearly` | **Pro Anual** | `FLAT_RATE` | `YEARLY` | `99000` (R$ 990) / `20000` ($ 200) | `25` membros · `300` rpm | `custom_roles: true`, `audit_logs: false`, `custom_domain: true` |
| `enterprise_monthly` | **Enterprise** | `FLAT_RATE` | `MONTHLY` | `49900` (R$ 499) / `9900` ($ 99) | `'unlimited'` · `1000` rpm | `custom_roles: true`, `audit_logs: true`, `custom_domain: true` |

---

## 4. Personas e Jornadas do Usuário

### J1 — O Alicerce Freemium (Provisionamento Local Automático)
1. Qualquer visitante ou usuário consulta `GET /billing/plans` para listar o catálogo de planos, preços, *quotas* e *features* configurados na aplicação.
2. Quando um usuário cria uma nova organização no módulo `tenancy` (`tenancy.organization.created.v1`), o subscriber `OnOrganizationCreatedSubscriber` do `billing` cria automaticamente no PostgreSQL uma `Subscription` vinculada ao plano `isDefaultFree: true` (`status: 'ACTIVE'`, sem chamar Stripe ou Asaas) e inicializa a view `billing_overview_views` no MongoDB (`currentMembers: 1`).
3. A partir do primeiro milissegundo, qualquer consulta do `tenancy` ou de outros módulos à `BillingFacade` já opera sobre essa assinatura `Free` sem lógica condicional especial.

### J2 — Checkout Flat-Rate e Ativação via Webhook (`Stripe` / `Asaas`)
1. **Owner ou Gestor Financeiro** (com permissão CASL `update Subscription`) escolhe um plano `FLAT_RATE` (ex.: `pro_monthly`), a moeda (`BRL` ou `USD`) e o provedor (`stripe` ou `asaas`) em `POST /organizations/:orgId/billing/checkout`.
2. O `CreateCheckoutSessionCommand` resolve o provedor via `PaymentGatewayFactory`, cria a sessão de checkout externa e retorna `{ checkoutUrl, sessionId }`.
3. O usuário conclui o pagamento no ambiente seguro do provedor e o webhook (`POST /webhooks/payments/:provider`) aciona o `ProcessPaymentWebhookCommand`.
4. O Command valida a assinatura criptográfica do provedor, verifica a idempotência pelo `externalEventId`, grava a `Invoice` como `PAID`, promove a `Subscription` local para o plano contratado (`status: 'ACTIVE'`, `currentPeriodStart`, `currentPeriodEnd`), invalida o cache de *entitlements* no Redis e publica:
   - `billing.invoice.paid.v1`
   - `billing.subscription.updated.v1`

### J3 — Troca de Plano (`ChangeSubscriptionPlan` — Upgrade com Pró-Rata vs. Downgrade Seguro)
1. **Usuário com `update Subscription`** solicita troca de plano em `POST /organizations/:orgId/billing/subscription/change-plan` informando `targetPlanCode`.
2. **Proteção de Downgrade (Validação de Uso Atual):**
   - Se o `targetPlan` possuir um limite numérico `max_members` menor do que o uso atual da organização (ex.: a organização tem 8 membros no `Pro` e tenta fazer downgrade para o `Free` cujo limite é 3), a operação é bloqueada com `BILLING.DOWNGRADE_EXCEEDS_TARGET_PLAN_QUOTA` (`422 Unprocessable Entity`), detalhando `{ featureKey: 'max_members', currentUsage: 8, targetLimit: 3 }`.
3. **Cálculo de Pró-Rata (`ProrationCalculatorDomainService`):**
   - Nas trocas entre planos `FLAT_RATE` pagos na mesma moeda, calcula-se a pró-rata proporcional aos dias restantes do ciclo atual (`unusedCredit` vs. `newPlanRemainingCost`), instrui-se o gateway externo a atualizar o plano da assinatura, invalida-se o cache Redis e emite-se `billing.subscription.updated.v1`.

### J4 — Cancelamento no Fim do Período (`cancelAtPeriodEnd`) e Reativação
1. **Cancelamento (`POST /organizations/:orgId/billing/subscription/cancel`):**
   - O gestor solicita o cancelamento da assinatura paga.
   - O sistema configura o cancelamento para o final do ciclo no gateway externo e marca `cancelAtPeriodEnd = true` na `Subscription` local, emitindo `billing.subscription.updated.v1`.
   - A organização mantém todas as *quotas* e *feature flags* pagas até `currentPeriodEnd`.
2. **Reativação antes do vencimento (`POST /organizations/:orgId/billing/subscription/reactivate`):**
   - Enquanto `status === 'ACTIVE'` e `cancelAtPeriodEnd === true`, o gestor pode reativar a assinatura com 1 clique (`cancelAtPeriodEnd = false`).
3. **Retorno ao Alicerce Freemium:**
   - Quando o período pago chega ao fim e o gateway envia o webhook de encerramento da assinatura, o `ProcessPaymentWebhookCommand` reverte a `Subscription` da organização de volta para o plano `isDefaultFree: true` (`status: 'ACTIVE'`, `provider: null`), garantindo que o tenant continue operando sob os limites do plano gratuito.

### J5 — Falha de Pagamento na Renovação (`PAST_DUE`) e Dashboard Financeiro
1. Quando uma cobrança recorrente falha no gateway, o webhook registra a `Invoice` como `FAILED`, coloca a `Subscription` em `PAST_DUE` (mantendo as quotas atuais durante o *grace period* de retentativas do provedor) e emite `billing.invoice.payment_failed.v1` (para o `notifications` alertar os `Owners` da organização) + `billing.subscription.updated.v1`.
2. Em `GET /organizations/:orgId/billing/overview`, membros com `read Subscription` consultam a view `billing_overview_views` no MongoDB contendo o plano atual, *features* ativas, uso das quotas (`currentMembers / maxMembers`) e as últimas 5 faturas.

---

## 5. Requisitos Funcionais (RF) e Pontos de Extensão

### RF-01 — Value Object `Money` e Aritmética Monetária Segura
- Todo valor monetário no domínio é representado por `Money` (`amountCents: number` inteiro `>= 0` + `currency: 'BRL' | 'USD'`).
- Proibido usar ponto flutuante para dinheiro; operações entre moedas distintas retornam `Left(CurrencyMismatchError)` (`BILLING.CURRENCY_MISMATCH`).

### RF-02 — Invariante do Alicerce Freemium (`INV-01`)
- O validador do catálogo (`PlanCatalogValidator`) verifica no boot que existe **exatamente 1 plano** com `isDefaultFree: true` e `pricingModel: 'FREE'`.
- Cada `Organization` possui exatamente 1 `Subscription` (relação `1:1` por `organizationId` único). Se a organização for deletada no `tenancy` (`tenancy.organization.deleted.v1`), qualquer assinatura paga ativa no gateway externo é cancelada imediatamente.

### RF-03 — `BillingFacade` (Verificação de Quotas Numéricas e Feature Flags Booleanas)
Com cache no Redis (`billing:entitlements:{orgId}`, TTL 15 min, invalidado em qualquer atualização da `Subscription`):
1. **`checkFeatureQuota({ organizationId, featureKey: QuotaKey, currentUsage })`:**
   - Retorna `{ allowed: boolean, limit: number | null, isUnlimited: boolean, currentUsage: number, planCode: string, planName: string }`.
2. **`hasFeatureFlag({ organizationId, featureKey: FeatureKey })`:**
   - Retorna `{ allowed: boolean, planCode: string, planName: string }`.
3. **`getOrganizationRateLimitRpm(organizationId)`:**
   - Retorna o limite numérico `rate_limit_rpm` do plano ativo da organização.

### RF-04 — Arquitetura Extensível para Novos Modelos de Cobrança (Como evoluir no futuro)
Para garantir que a adição futura de modelos como **`PER_SEAT`** (por assento) ou **`USAGE_BASED`** (por consumo) seja plugável sem reescrever o módulo:
1. **Coluna e Propriedade `pricingModel` + `quantity` na `Subscription`:** a entidade `Subscription` e a tabela `subscriptions` já possuem `pricingModel` (`'FREE' | 'FLAT_RATE'`, aberto para novos literais) e `quantity: number` (que em `FLAT_RATE` vale `1`).
2. **Strategy de Cálculo (`SubscriptionPricingStrategy`):** o cálculo de valor de checkout e de pró-rata recebe a estratégia correspondente ao `plan.pricingModel`. Na v1, implementamos `FreePricingStrategy` e `FlatRatePricingStrategy`. Para adicionar `PerSeatPricingStrategy` no futuro, basta criar a nova classe implementando a interface e registrá-la no mapa de estratégias.
3. **Rastreamento de Uso Já Conectado por Eventos:** o `BillingOverviewProjector` já consome `tenancy.member.accepted.v1` (`+1`) e `tenancy.member.removed.v1` (`-1`) mantendo `usage.currentMembers` sempre atualizado.

### RF-05 — Idempotência e Segurança de Webhooks (`ProcessPaymentWebhookCommand`)
- Validação obrigatória da assinatura criptográfica do provedor (`stripe-signature` / `asaas-access-token` → `BILLING.INVALID_WEBHOOK_SIGNATURE` `401`).
- Registro único de `(provider, externalEventId)` na tabela `payment_webhook_events` dentro da mesma transação `UnitOfWork` (`INV-03`).

---

## 6. Requisitos Não-Funcionais e Resiliência

- **Resiliência (`@Resilient` — ADR-0005):** todas as chamadas ao Stripe/Asaas executam sob Bulkhead + Circuit Breaker + Retry com Exponential Backoff + Timeout de 5s.
- **PostgreSQL RLS (ADR-0017):** as tabelas `subscriptions` e `invoices` possuem `organization_id UUID NOT NULL` com políticas de Row-Level Security ativas.

---

## 7. Fora de Escopo (Non-Goals para o Boilerplate v1)

- Cobrança dinâmica por assento (`PER_SEAT`) e cobrança pós-paga por telemetria (`USAGE_BASED`) — *a arquitetura já deixa os pontos de extensão prontos (`pricingModel`, `quantity`, `SubscriptionPricingStrategy`), mas a v1 implementa apenas `FREE` e `FLAT_RATE`*.
- Painel/API CRUD para editar planos dinamicamente pelo banco sem deploy (a definição na v1 é *Code-First* via `plans.catalog.ts` sincronizada por seed).
- Emissão de Nota Fiscal Eletrônica municipal (NFS-e), cupons de desconto e coleta direta de cartão fora do Hosted Checkout do provedor.
