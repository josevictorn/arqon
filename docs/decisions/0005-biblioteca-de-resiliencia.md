# ADR-0005: Biblioteca de resiliência e seleção de provedor externo

- **Status:** Aceito
- **Data:** 2026-10-31
- **Decisores:** José Victor
- **Tasks relacionadas:** T3.10, T5.02, T5.03, T5.04, T5.05
- **Docs afetados:** [01-tech-stack.md](../architecture/01-tech-stack.md), [05-integrations-resilience.md](../architecture/05-integrations-resilience.md), [docs/modules/billing/spec.md](../modules/billing/spec.md)

## Contexto

O blueprint apresentava duas inconsistências:
1. O §2 citava `nestjs-resilience` / `cockatiel` e o §6.2 citava `@nestjs/resilience` (três pacotes distintos).
2. O §6.1 sugeria troca automática de provedor na `Provider Factory` caso o Circuit Breaker principal estivesse aberto.

O pipeline exigido é **Bulkhead → Circuit Breaker → Retry (backoff exponencial + full jitter) → Timeout**, aplicado nos **Gateways/Adapters** (`src/integrations/`) e reportando métricas no Prometheus (`/metrics`).

## Opções consideradas

### Opção A — `@nestjs/resilience`
- ✅ Idiomático no Nest (`ResilienceModule.forRoot`, decorators nativos).
- ❌ Decorators padrão isolam o estado por método (e não por provedor); depende do container de DI do Nest para testes unitários; menos controle direto sobre eventos (`onBreak`, `onReset`) para métricas Prometheus.

### Opção B — `cockatiel` + decorator próprio `@Resilient('<integration>')`
- ✅ Maduro, composição explícita (`wrap(bulkhead, breaker, retry, timeout)`), zero dependência de framework (testável com `new Adapter()` puro no Vitest).
- ✅ O nosso `ResilienceRegistry` + decorator `@Resilient('payment.stripe')` compartilha o mesmo Circuit Breaker e Bulkhead entre todos os métodos do mesmo provedor e expõe hooks (`onBreak`, `onReset`, `onRetry`) para logs e métricas Prometheus.
- ✅ Permite filtrar apenas `TransientIntegrationError` (5xx, rede, timeout, 429) para não abrir o circuito com erros 4xx de negócio.
- ❌ Exige ~100 linhas em `src/shared/infra/resilience/` para o registry e o decorator.

### Opção C — `nestjs-resilience` (comunidade)
- ❌ Menor adoção; não oferece vantagem clara.

## Decisão

Adotar a **Opção B (`cockatiel`)**, encapsulada em `src/shared/infra/resilience/` através do `ResilienceRegistry` e do decorator `@Resilient('<integration>', overrides?)`.

Além disso, sobre a **Provider Factory (`PaymentGatewayFactory`)**:
- **Não haverá troca/fallback automático de provedor baseado em Circuit Breaker.**
- A seleção do provedor na Factory é **explícita e determinística** (definida por configuração/parâmetro explícito, sem alternar silenciosamente de provedor em runtime quando o circuito abrir). Se o circuito do provedor escolhido estiver aberto, a chamada falha rapidamente (*fail-fast*).

## Consequências

- **Positivas:** ergonomia de decorator (`@Resilient('payment.stripe')`), circuito compartilhado por integração, comportamento previsível (sem troca silenciosa de gateway de pagamento) e métricas Prometheus diretas.
- **Ações decorrentes:** atualizar [01-tech-stack.md](../architecture/01-tech-stack.md), [05-integrations-resilience.md](../architecture/05-integrations-resilience.md), [billing/spec.md](../modules/billing/spec.md) e `ROADMAP.md` (T5.05).

## Regras para a IA

1. Toda chamada a um sistema externo em `src/integrations/` deve ser decorada com `@Resilient('<dominio>.<provedor>')` (ou executada via `ResilienceRegistry`). Nunca chame SDK/HTTP externo "cru".
2. A ordem da composição no `ResilienceRegistry` é fixa: `Bulkhead → CircuitBreaker → Retry → Timeout`.
3. Apenas erros que herdam de `TransientIntegrationError` (5xx, timeout, falha de rede, 429) acionam Retry e contam para o Circuit Breaker.
4. A `Provider Factory` resolve o provedor de forma explícita/determinística; nunca implemente fallback automático entre provedores diferentes quando o Circuit Breaker abrir.

