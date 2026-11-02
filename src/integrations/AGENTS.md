# src/integrations — gateways externos (regras locais)

Todo I/O com terceiros (pagamento, e-mail, storage, JWT, APIs externas) mora aqui.

## Estrutura por integração
```text
<name>/
├── contracts/<name>.gateway.ts        # abstract class na linguagem do domínio (o que os módulos importam)
├── providers/<provider>/
│   ├── <provider>-<name>.adapter.ts   # implementa o Gateway; único lugar com o SDK/HTTP externo
│   └── <provider>-acl.mapper.ts       # classe estática: payload externo → DTO do contrato
├── factories/<name>-gateway.factory.ts
└── <name>-integration.module.ts
```

## Regras
- Tipos do SDK externo (`Stripe.Invoice`...) **não vazam** do `providers/`: o adapter devolve só DTOs do contrato, via ACL mapper.
- Factory **explícita e determinística** (config/parâmetro). **Sem fallback automático** de provedor quando o circuito abre: falha rápido (ADR-0005).
- Todo método do adapter que faz I/O usa `@Resilient('<integration>')` (bulkhead → circuit breaker → retry → timeout via `cockatiel`). Chamada "crua" é bug.
- Erros do provedor viram erros tipados do contrato (com `code` + `i18nKey`), não exceções do SDK.
- JWT: `jose` com `EdDSA`/Ed25519, `kid` no header e chaves de `JWT_*` do env, atrás de `TokenEncrypterGateway` (ADR-0015).
- Credenciais só por env validado; nada de segredo em código ou teste.

## Testes
- Unit dos módulos usam Fake Gateways (`test/fakes/`), nunca o adapter real.
- ACL mapper é função pura: cubra com unit (`*.spec.ts`) a conversão de cada payload externo.

## Referência
[05-integrations-resilience.md](../../docs/architecture/05-integrations-resilience.md) · `payment/` chega na F5.
