# ADR-0015: Assinatura de JWT assimétrica com EdDSA (Ed25519) via `jose` e Refresh Token Rotation

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.03, T1.06, T1.09, T5.01, T5.06, F6
- **Docs afetados:** [`docs/architecture/06-security-tenancy-casl.md`](../architecture/06-security-tenancy-casl.md), [`docs/modules/iam/spec.md`](../modules/iam/spec.md)

## Contexto

O boilerplate utiliza autenticação stateless de curta duração via JWT (`accessToken`, 15 min) combinada com sessões revogáveis de longa duração via `refreshToken` (7 dias). Precisávamos fechar:
1. Qual algoritmo de assinatura assimétrica usar para o `accessToken`.
2. Qual biblioteca utilizar no adaptador `JwtEncrypter` (`src/integrations/cryptography/`).
3. Como suportar rotação de chaves criptográficas sem derrubar todos os usuários logados.
4. Quais claims mínimas o `accessToken` deve carregar para suportar revogação de sessão e exigência de MFA por organização.

## Opções consideradas

### Opção A — `EdDSA` com curva `Ed25519` via biblioteca `jose`, com `kid` no header
- ✅ **Chaves e tokens compactos:** chaves Ed25519 têm apenas 32 bytes (contra 256–512 bytes do RSA) e assinaturas de 64 bytes, reduzindo o tamanho do header `Authorization: Bearer` em toda requisição HTTP.
- ✅ **Performance e segurança moderna:** assinatura e verificação muito mais rápidas que RSA-2048/4096, imune a ataques de timing de implementação de curva e recomendada para novos sistemas (RFC 8037).
- ✅ **Zero dependência nativa (`jose`):** biblioteca padrão Web Crypto API mantida pela comunidade OAuth/OIDC, suporte nativo a JWK/JWKS e `kid`.
- ❌ Sistemas legados muito antigos podem só suportar `RS256` (irrelevante para um boilerplate moderno em Node 24+).

### Opção B — `RS256` (RSA 2048-bit)
- ✅ Suporte universal em gateways legados.
- ❌ Chaves PEM longas em variáveis de ambiente, assinatura maior no token e custo de CPU superior na emissão/verificação.

### Opção C — `HS256` (Segredo simétrico HMAC)
- ✅ Configuração trivial com uma única string.
- ❌ Qualquer serviço ou worker que precise apenas *verificar* o token teria posse do mesmo segredo capaz de *forjar* tokens (viola o princípio do menor privilégio).

## Decisão

Adotamos a **Opção A**:
1. **Algoritmo:** `EdDSA` (curva `Ed25519`) implementado com a biblioteca `jose` atrás da porta `TokenEncrypterGateway`.
2. **Suporte a Rotação de Chaves (`kid`):** a configuração aceita a chave privada ativa (`JWT_PRIVATE_KEY`, `JWT_KEY_ID`) e um conjunto de chaves públicas válidas para verificação, permitindo rotacionar chaves sem invalidar os tokens emitidos nos últimos 15 minutos.
3. **Claims do `accessToken`:**
   - `sub`: `userId` (UUIDv7)
   - `sid`: `sessionId` (UUIDv7 da `Session` que originou o token)
   - `mfa`: `boolean` (`true` se a sessão foi autenticada com 2º fator, permitindo que `tenancy` exija MFA por organização)
   - `iat`, `exp`, `iss`: metadados padrão RFC 7519.
4. **Refresh Token:** string opaca criptograficamente aleatória (32 bytes base64url), nunca um JWT, cujo hash SHA-256 é associado à `Session` com detecção de reuso (RFC 9700).

## Consequências

- **Positivas:**
  - Tokens curtos, verificação sub-milissegundo e chaves PEM/JWK enxutas no `.env`.
  - A presença de `sid` no JWT permite identificar `isCurrent` na listagem de dispositivos e fazer logout da sessão atual sem precisar enviar o `refreshToken` no body.
  - A presença de `mfa: boolean` no JWT permite que o módulo `tenancy` aplique políticas de "MFA obrigatório na organização" em `< 1ms` sem consultar o banco do `iam`.
- **Negativas / trade-offs aceitos:**
  - O script `pnpm init:project` (T1.09) deve gerar pares de chaves `Ed25519` (`crypto.generateKeyPairSync('ed25519')`).
- **Ações decorrentes:**
  - Atualizar `docs/architecture/06-security-tenancy-casl.md` e `T1.06` / `T1.09` / `T5.01` para referenciar `EdDSA (Ed25519)`.

## Regras para a IA

1. Sempre assinar e verificar `accessToken` com algoritmo `EdDSA` (`Ed25519`) usando a biblioteca `jose` encapsulada em `JwtEncrypter` (`src/integrations/cryptography/`). Nunca importar `jsonwebtoken` ou `@nestjs/jwt` diretamente nos módulos.
2. Sempre restringir explicitamente o algoritmo aceito na verificação (`algorithms: ['EdDSA']`) para prevenir ataques de *algorithm confusion* (`alg: none` ou downgrade para HMAC).
3. Todo `accessToken` deve conter obrigatoriamente as claims `{ sub, sid, mfa }`.
4. `refreshToken` nunca é um JWT: deve ser um token opaco de 32 bytes aleatórios, persistido apenas como hash SHA-256.
