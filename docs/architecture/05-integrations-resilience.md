> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 6. Padrões de Integração Externa e Resiliência

Toda chamada para fora da aplicação (Gateways de Pagamento, ERPs, APIs governamentais, provedores de e-mail) passa por **3 camadas de proteção**:

## 6.1. Gateway Contract + Anti-Corruption Layer (ACL) + Provider Factory
1. **Gateway (`abstract class`)**: Contrato limpo que fala a linguagem do nosso domínio.
2. **ACL Mapper**: Classe estática que converte o JSON externo (ex: Stripe `Stripe.Invoice`) para o DTO do nosso contrato, protegendo o domínio contra mudanças na API de terceiros.
3. **Provider Factory**: Resolve de forma explícita qual provedor configurado/solicitado utilizar (ex: `stripe` ou `asaas`), **sem troca automática por Circuit Breaker** (ver [ADR-0005](../decisions/0005-biblioteca-de-resiliencia.md)).

## 6.2. Pipeline de Resiliência (`cockatiel` + decorator `@Resilient`)
Nenhuma chamada HTTP externa é feita "crua". Aplicamos políticas compostas via `@Resilient('<integration>')` na seguinte ordem:

```text
[Chamada do Gateway]
  └─> 1. Bulkhead (Limita concorrência máxima, ex: 20 reqs simultâneas)
       └─> 2. Circuit Breaker (Abre o circuito após 5 falhas consecutivas por 30s)
            └─> 3. Retry (3 tentativas com Exponential Backoff: 500ms, 1s, 2s + Full Jitter)
                 └─> 4. Timeout (Cancela tentativa individual se passar de 5000ms)
```

## 6.3. Rate Limiting Distribuído (Redis)
- Configurado na camada HTTP (Fastify) com armazenamento no **Redis**.
- Suporta limites diferenciados por **IP** (rotas públicas como `/auth/login`), por **User ID** e por **Tier do Plano da Organização** (ex: Plano `Free` = 60 req/min; Plano `Enterprise` = 1000 req/min).

