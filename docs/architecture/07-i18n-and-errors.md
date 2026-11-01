> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 8. Internacionalização (`i18n` — `en` e `pt-BR`) e Tratamento de Erros

As entidades e casos de uso **não** retornam mensagens de erro hardcoded em um único idioma.
1. Todo erro de domínio herda de `DomainError` e define uma chave semântica de tradução (`i18nKey`) e argumentos dinâmicos:

```typescript
// src/modules/billing/domain/errors/plan-quota-exceeded.error.ts
export class PlanQuotaExceededError extends DomainError {
  constructor(feature: string, limit: number) {
    super({
      code: 'BILLING.PLAN_QUOTA_EXCEEDED',
      i18nKey: 'billing.errors.plan_quota_exceeded',
      args: { feature, limit },
      httpStatus: 403,
    })
  }
}
```

2. O `GlobalDomainExceptionFilter` intercepta qualquer `Left<DomainError>` ou exceção HTTP, resolve o idioma do usuário via `nestjs-i18n` (Header `Accept-Language: pt-BR` ou `en`) e retorna um JSON padronizado (RFC 7807 Problem Details):

```json
{
  "code": "BILLING.PLAN_QUOTA_EXCEEDED",
  "message": "O limite do seu plano para 'max_members' (5) foi atingido. Faça upgrade para continuar.",
  "statusCode": 403,
  "traceId": "0af7651916cd43dd8448eb211c80319c",
  "timestamp": "2026-10-29T20:05:00.000Z"
}
```

