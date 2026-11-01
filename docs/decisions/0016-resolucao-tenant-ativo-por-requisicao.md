# ADR-0016: Resolução do Tenant ativo por requisição (parâmetro `:orgId` / header `X-Organization-Id`)

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.04, T5.06, F8
- **Docs afetados:** [`docs/architecture/06-security-tenancy-casl.md`](../architecture/06-security-tenancy-casl.md), [`docs/modules/tenancy/spec.md`](../modules/tenancy/spec.md)

## Contexto

Em uma aplicação SaaS B2B multi-tenant onde um mesmo `User` pode pertencer a várias `Organizations` com diferentes cargos em cada uma, toda requisição a um recurso de organização precisa responder de forma rápida e segura:
1. Qual organização (`organizationId` / `tenantId`) está sendo acessada nesta requisição?
2. O usuário autenticado (`jwt.sub`) é membro ativo dessa organização, cumpre os requisitos de segurança dela (`requireMfa`) e possui as permissões CASL necessárias?

O blueprint original continha uma pergunta em aberto sobre embutir `activeTenantId` no payload do `accessToken` JWT versus resolver o tenant por requisição validado contra o Redis.

## Opções consideradas

### Opção A — Resolução por requisição (`:orgId` na rota ou header `X-Organization-Id`) validada no Redis (`< 1ms`), mantendo o JWT livre de tenant
- ✅ **Suporte nativo a múltiplas abas e clientes concorrentes:** o usuário pode manter duas abas do navegador abertas em organizações diferentes sem que a troca de organização em uma aba invalide ou altere silenciosamente o contexto da outra.
- ✅ **Troca de organização instantânea (Zero Re-Auth):** alternar no seletor de organizações da UI não exige chamar endpoint de reemissão de JWT.
- ✅ **Desacoplamento limpo entre `iam` e `tenancy`:** o `iam` emite o JWT contendo apenas dados de identidade e sessão (`{ sub, sid, mfa }`), sem precisar conhecer organizações.
- ✅ **Latência sub-milissegundo:** o `PoliciesGuard` busca `permissions:org:{orgId}:user:{userId}` no Redis em `< 1ms` (com *fallback* para `TenancyFacade` em caso de *cache miss*).
- ❌ Exige que rotas de contexto de organização incluam `:orgId` no path (ex.: `/organizations/:orgId/roles`) ou enviem o header `X-Organization-Id`.

### Opção B — `activeTenantId` embutido no payload do `accessToken` JWT
- ✅ Não exige enviar `:orgId` ou header em todas as rotas.
- ❌ **Quebra o uso em múltiplas abas:** se o usuário trocar para a "Org B" na Aba 2, qualquer requisição subsequente da Aba 1 (que ainda exibe a UI da "Org A") seria executada contra a "Org B" se o token for compartilhado, ou exigiria estado complexo por aba.
- ❌ Exige um endpoint extra de `switch-organization` para reemitir o `accessToken` a cada troca de contexto.
- ❌ Acopla a emissão de tokens do `iam` ao módulo `tenancy`.

## Decisão

Adotamos a **Opção A**:
1. O `accessToken` JWT **não** carrega `activeTenantId` (contém apenas `{ sub, sid, mfa, iat, exp }`, conforme [ADR-0015](./0015-jwt-assimetrico-eddsa-ed25519.md)).
2. O contexto da organização ativa é resolvido por requisição pelo `TenantContextGuard` / `PoliciesGuard` na seguinte ordem de precedência:
   - Parâmetro de rota `:orgId` (ou `:organizationId`), quando a rota for aninhada sob `/organizations/:orgId/...`;
   - Header HTTP `x-organization-id`, para rotas de módulos de negócio que operam no escopo do tenant ativo. Se ambos forem enviados na mesma requisição e divergirem, a requisição é rejeitada com `400 Bad Request`.
3. O Guard valida em `< 1ms` no Redis (`permissions:org:{orgId}:user:{userId}`) se o usuário é membro da organização, se a política `requireMfa` da organização é atendida por `jwt.mfa` e hidrata a instância `AppAbility` do CASL na requisição (`request.tenantContext = { organizationId, ability }`).

## Consequências

- **Positivas:**
  - Fronteira 100% limpa entre `iam` (identidade) e `tenancy` (organização e autorização).
  - Revogação de acesso a uma organização ou alteração de cargo tem efeito **imediato** (basta deletar a chave `permissions:org:{orgId}:user:{userId}` no Redis), sem esperar os 15 minutos de expiração do JWT.
- **Negativas / trade-offs aceitos:**
  - Clientes HTTP devem enviar o `:orgId` na URL ou o header `X-Organization-Id` nas rotas protegidas por tenant.
- **Ações decorrentes:**
  - Implementar na **T5.06** o decorator `@CurrentTenant()`, o `TenantAbilityFactory` e o `PoliciesGuard` seguindo esta resolução.

## Regras para a IA

1. Nunca inclua `activeTenantId` ou permissões de organização dentro do payload do JWT (`accessToken`).
2. Toda rota que opera no escopo de uma organização deve usar o `PoliciesGuard` e obter o contexto via `@CurrentTenant()` (que resolve `:orgId` ou `X-Organization-Id` e garante que o usuário é membro ativo daquela organização).
3. Se uma requisição enviar simultaneamente `:orgId` na rota e `X-Organization-Id` no header com valores diferentes, rejeite imediatamente com `400 Bad Request`.

