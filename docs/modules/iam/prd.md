# PRD — Módulo `iam` (Identity & Access Management)

- **Status:** ✅ Aprovado
- **Fase do Roadmap:** F6 (Módulo de Referência)
- **Spec técnica derivada:** [`./spec.md`](./spec.md)
- **Referências de mercado:** Clerk, WorkOS User Management, Auth0, GitHub Account Security, Vercel/Linear Account Lifecycle, OWASP ASVS v4.0 (Cap. 2 e 3), NIST SP 800-63B, RFC 6238 (TOTP), RFC 9700 (OAuth 2.0 Security Best Current Practice), LGPD / GDPR (Direito ao Esquecimento com Preservação Fiscal/Auditoria).

---

## 1. Visão Geral e Propósito

O módulo **`iam`** é a autoridade central de **identidade, autenticação (1FA e MFA), gestão de sessões, perfil pessoal e ciclo de vida da conta (incluindo exclusão e anonimização LGPD/GDPR)** na plataforma SaaS.

Uma pessoa se cadastra uma única vez na plataforma (`User`) e, com essa mesma identidade, pode criar ou participar de múltiplas organizações (`Organization` no módulo `tenancy`).

### Fronteira do Contexto Delimitado (O que é vs. O que não é `iam`)
- **É responsabilidade do `iam`:** cadastro de contas, verificação de e-mail, autenticação por senha, autenticação de múltiplos fatores (MFA via TOTP + fallback de OTP por e-mail), ciclo de vida de sessões multi-dispositivo, rotação de tokens, recuperação/troca de senha, dados pessoais do perfil (`name`, `avatar`, `locale`) e exclusão/anonimização de conta.
- **NÃO é responsabilidade do `iam`:** organizações, vínculos de membros (`Membership`), convites de equipe ou permissões RBAC/ABAC (tudo isso pertence a `tenancy`, embora o `iam` inclua a flag `mfa` no JWT e consulte a `TenancyFacade` antes de permitir a exclusão de conta). O envio efetivo de e-mails pertence a `notifications`, e o histórico de conformidade pertence a `audit`.

---

## 2. Benchmark e Padrões de Mercado Adotados

| Fluxo | Referência de Mercado | Padrão Adotado no Boilerplate |
|---|---|---|
| **Verificação de E-mail** | WorkOS / Auth0 | **Bloqueante para login:** o cadastro cria a conta pendente (`emailVerifiedAt = null`) e dispara o token de confirmação. O login só é liberado após a confirmação do e-mail. |
| **Política de Senha** | NIST SP 800-63B / OWASP | **Comprimento + simplicidade pragmática:** 8 a 128 caracteres, exigindo ao menos 1 letra e 1 número. Sem truncamento silencioso e sem regras artificiais de símbolos que reduzem a entropia. |
| **Proteção contra User Enumeration** | OWASP ASVS 2.2 / GitHub | Endpoints públicos de recuperação de senha e reenvio de verificação sempre respondem `202 Accepted` com corpo idêntico. No login, quando o e-mail não existe, executa-se um *dummy hash verification* (Argon2id) para equalizar o tempo de resposta. |
| **MFA (2FA)** | Clerk / WorkOS / RFC 6238 | **TOTP (App Autenticador) + OTP por E-mail como fallback:** configuração opcional pelo usuário, emitindo a claim `mfa: boolean` no JWT para que Organizações (`tenancy`) possam exigir MFA de seus membros. Proteção anti-replay de código TOTP na mesma janela de 30s. |
| **Sessões & Refresh Tokens** | Clerk / RFC 9700 | `accessToken` JWT curto (15 min, EdDSA/Ed25519 com `sid` e `mfa`) + `refreshToken` opaco longo (7 dias) com **Refresh Token Rotation** e **Reuse Detection** (reuso de token já rotacionado revoga toda a família da sessão). |
| **Visibilidade de Dispositivos** | GitHub / Linear / Clerk | O usuário visualiza todas as sessões ativas (IP, User-Agent/dispositivo, última atividade, marcador `isCurrent`) e pode encerrar uma sessão específica ou "sair de todos os outros dispositivos". |
| **Troca vs. Reset de Senha** | Clerk / GitHub | **Reset (esqueci):** revoga **todas** as sessões do usuário. **Change (autenticado):** exige a senha atual e revoga todas as **outras** sessões, preservando a sessão do dispositivo atual. |
| **Upload de Avatar** | Vercel / Linear | **Presigned URL em 2 passos:** (1) solicita URL assinada de upload validando MIME e tamanho máximo; (2) cliente envia direto ao S3/MinIO e confirma a `avatarKey` no `PATCH /me`. |
| **Exclusão e Anonimização (LGPD/GDPR)** | GitHub / Vercel / Linear | **Bloqueio de Último Owner + Grace Period de 15 dias + PII Scrubbing:** impede exclusão se o usuário for o único `Owner` de alguma organização; agenda exclusão por 15 dias (permitindo arrependimento); após 15 dias, anonimiza PII de forma irreversível sem quebrar FKs de faturas/auditoria. |

---

## 3. Personas e Jornadas do Usuário

### J1 — Cadastro e Ativação de Conta (Onboarding)
1. **Visitante** envia nome, e-mail, senha e idioma opcional (`POST /auth/register`).
2. O sistema valida os dados, cria o usuário com status de e-mail pendente (`emailVerifiedAt: null`) e publica o evento para envio do e-mail de verificação.
3. Se o usuário tentar fazer login antes de confirmar o e-mail, o sistema valida a senha e retorna erro explícito (`IAM.EMAIL_NOT_VERIFIED` — `403 Forbidden`), orientando-o a verificar a caixa de entrada ou solicitar reenvio.
4. O usuário clica no link do e-mail (que contém o token) e a aplicação chama `POST /auth/email/verify`.
5. O e-mail é marcado como verificado (`emailVerifiedAt: <timestamp>`) e o usuário passa a poder autenticar normalmente.
6. Caso o token tenha expirado ou o e-mail não tenha chegado, o usuário solicita um novo envio em `POST /auth/email/resend-verification` (sujeito a cooldown de 60 segundos por conta).

### J2 — Login (Sem MFA), Refresh e Proteção contra Roubo de Sessão
1. **Usuário verificado (sem MFA ativo)** envia e-mail e senha (`POST /auth/login`).
2. O sistema valida as credenciais, registra uma nova `Session` (`mfaVerified: false`) com metadados do dispositivo (`ipAddress`, `userAgent`) e retorna `{ status: 'AUTHENTICATED', accessToken, refreshToken, expiresIn }`.
3. A cada 15 minutos, o cliente usa o `refreshToken` em `POST /auth/refresh`. O sistema invalida o `refreshToken` anterior daquela sessão, emite um novo par `{ accessToken, refreshToken }` e atualiza `lastActiveAt`.
4. **Cenário de ataque (Token Replay):** se um atacante (ou o cliente legítimo após um roubo) tentar usar um `refreshToken` que **já foi rotacionado**, o sistema detecta o reuso, revoga imediatamente a `Session` inteira (`revokeReason: TOKEN_REUSE_DETECTED`), publica evento de segurança e exige novo login.

### J3 — Ativação de MFA e Login em 2 Etapas (TOTP + Fallback OTP por E-mail)
1. **Configuração (Enrollment em 2 passos):**
   - O usuário autenticado inicia a configuração em `POST /me/mfa/totp/setup`. O sistema gera um segredo TOTP (criptografado em repouso) e retorna `{ secret, otpauthUri }` para exibição do QR Code no app autenticador (Google Authenticator, 1Password, Authy).
   - O usuário escaneia o QR Code e confirma em `POST /me/mfa/totp/enable` enviando `currentPassword` + o primeiro código `totpCode` de 6 dígitos.
   - O sistema valida o código, ativa o MFA (`mfaTotpEnabledAt = now()`), promove a sessão atual para `mfaVerified = true`, revoga todas as outras sessões que não passaram por MFA e emite `iam.mfa.enabled.v1`.
2. **Login com Desafio MFA (Step-up Challenge):**
   - Ao fazer `POST /auth/login` com e-mail e senha válidos em uma conta com MFA ativo, o sistema **não** emite sessão ainda: retorna `{ status: 'MFA_REQUIRED', mfaChallengeToken, expiresIn: 300, availableMethods: ['totp', 'email_otp'] }`.
   - **Caminho principal (TOTP):** o usuário informa o código de 6 dígitos do app autenticador em `POST /auth/mfa/verify` (`method: 'totp'`).
   - **Caminho de contingência (OTP por E-mail):** se o usuário estiver sem o celular/app autenticador, ele clica em "Enviar código por e-mail" (`POST /auth/mfa/email-otp/send` com `mfaChallengeToken`). O sistema gera um código numérico de 6 dígitos (TTL 5 min) e dispara por e-mail via `notifications`. O usuário submete esse código em `POST /auth/mfa/verify` (`method: 'email_otp'`).
   - Validado o desafio, o sistema cria a `Session` com `mfaVerified: true` e retorna `{ status: 'AUTHENTICATED', accessToken, refreshToken, expiresIn }` (com a claim `mfa: true` no JWT).
3. **Desativação do MFA:**
   - Em `POST /me/mfa/disable`, o usuário informa `currentPassword` + um código MFA válido (TOTP ou OTP por e-mail) para desativar o MFA da conta.

### J4 — Gestão de Dispositivos Conectados e Logout
1. **Usuário autenticado** acessa "Segurança → Dispositivos conectados" (`GET /me/sessions`).
2. Ele vê a lista de sessões ativas com navegador/SO, IP, se foi autenticada com MFA, data de criação, última atividade e qual é a sessão atual (`isCurrent: true`).
3. Ele pode:
   - Fazer logout do dispositivo atual (`POST /auth/logout`).
   - Encerrar um dispositivo específico que esqueceu aberto (`DELETE /me/sessions/:sessionId`).
   - Encerrar todas as outras sessões de uma vez, mantendo apenas a atual (`POST /me/sessions/revoke-others`).

### J5 — Recuperação de Senha (Esqueci minha senha)
1. **Usuário** informa seu e-mail em `POST /auth/password/forgot`.
2. O sistema responde sempre `202 Accepted` (mesmo que o e-mail não exista ou não esteja verificado).
3. Se o usuário existir (e não estiver anonimizado), gera um token de reset de uso único (expiração de 30 minutos), invalida qualquer token de reset anterior daquele usuário e dispara o evento para envio do e-mail.
4. O usuário submete o token + nova senha em `POST /auth/password/reset`. *(Nota de segurança: se a conta tiver MFA ativo, o reset de senha exige também a verificação do segundo fator ou mantém o MFA intacto exigindo-o no próximo login).*
5. O sistema valida o token, atualiza o hash da senha, consome o token e **revoga todas as sessões ativas** do usuário.

### J6 — Troca de Senha Autenticada
1. **Usuário autenticado** acessa as configurações da conta e envia `currentPassword` e `newPassword` em `POST /me/password`.
2. O sistema verifica se `currentPassword` está correta, garante que `newPassword` respeita a política e é diferente da atual, atualiza o hash e **revoga todas as outras sessões** do usuário, mantendo a sessão atual ativa.

### J7 — Gestão de Perfil e Upload de Avatar
1. **Usuário autenticado** consulta seus dados em `GET /me` (leitura rápida via Read Model no MongoDB).
2. Para trocar a foto de perfil:
   - **Passo 1:** chama `POST /me/avatar/upload-url` informando `fileName`, `mimeType` (`image/jpeg`, `image/png`, `image/webp`) e `fileSizeBytes` (máx. 5 MB). Recebe uma `uploadUrl` pré-assinada (S3/MinIO) com validade de 5 minutos e a `avatarKey` gerada.
   - **Passo 2:** o frontend faz `PUT` do arquivo binário diretamente para a `uploadUrl` no storage.
   - **Passo 3:** o frontend chama `PATCH /me` enviando `{ avatarKey }` (podendo enviar também `name` e `locale`).
3. O sistema valida que a `avatarKey` pertence ao namespace do próprio usuário (`avatars/{userId}/...`), confirma que o objeto existe no storage, remove o avatar antigo (se houver), atualiza o usuário e projeta a mudança nas views de perfil e de membros das organizações.

### J8 — Exclusão de Conta com Grace Period (15 dias) e Anonimização (LGPD/GDPR)
1. **Solicitação (`POST /me/delete`):**
   - O usuário autenticado solicita a exclusão da própria conta informando `currentPassword` (e código MFA, se o MFA estiver ativo na conta).
   - **Verificação de Último Owner:** o `iam` consulta síncronamente a `TenancyFacade.getOrganizationsWhereUserIsSoleOwner(userId)`. Se o usuário for o único `Owner` de qualquer organização ativa, a operação é bloqueada com `IAM.CANNOT_DELETE_SOLE_ORGANIZATION_OWNER` (`409 Conflict`), listando as organizações que precisam ter a propriedade transferida ou ser encerradas antes.
   - Se não houver bloqueio, a conta entra no estado `PENDING_DELETION` (`deletionRequestedAt = now()`, `deletionScheduledFor = now() + 15 dias`), **todas as sessões ativas são revogadas imediatamente** e o evento `iam.user.deletion_requested.v1` é emitido (enviando um e-mail com a data programada de anonimização e instruções de como cancelar fazendo login).
   - Durante esses 15 dias, os dados do usuário e seus vínculos (`Membership`) nas organizações permanecem **congelados/intactos** (nada é removido ainda) e o e-mail continua reservado.
2. **Arrependimento e Reativação durante os 15 dias (`POST /auth/account-deletion/cancel`):**
   - O usuário acessa a tela normal de login (`POST /auth/login`) e informa seu e-mail e senha.
   - Se a conta tiver MFA ativo, ele completa normalmente o desafio de segundo fator (`POST /auth/mfa/verify`).
   - Uma vez que as credenciais (1FA e MFA, se ativo) foram validadas com sucesso, o sistema identifica que `deletionRequestedAt !== null`. Em vez de criar a sessão silenciosamente, retorna `{ status: 'ACCOUNT_PENDING_DELETION', deletionScheduledFor, reactivationToken, expiresIn: 300 }`.
   - O frontend exibe o modal de confirmação: *"Sua conta está agendada para exclusão definitiva em `<deletionScheduledFor>`. Deseja cancelar a exclusão e restaurar seu acesso?"*.
   - Ao confirmar, o frontend envia `POST /auth/account-deletion/cancel` com `{ reactivationToken }`.
   - O sistema valida o `reactivationToken` (uso único, TTL 5 min), restaura a conta para `ACTIVE` (`deletionRequestedAt = null`, `deletionScheduledFor = null`), **já cria a `Session` autenticada** retornando `{ status: 'AUTHENTICATED', accessToken, refreshToken, expiresIn }` e emite `iam.user.deletion_canceled.v1` (que envia um e-mail de alerta confirmando a restauração da conta).
3. **Anonimização Definitiva após 15 dias (`AnonymizeExpiredAccountsCommand`):**
   - Um job agendado processa contas com `deletionScheduledFor <= now()`.
   - **PII Scrubbing Irreversível:** sem deletar a linha física no PostgreSQL (para preservar integridade referencial com faturas históricas e trilhas de auditoria), o sistema sobrescreve os dados pessoais:
     - `name = 'Deleted User'`
     - `email = 'deleted+<userId>@deleted.invalid'` (liberando o e-mail original caso a pessoa queira criar uma conta nova no futuro)
     - `passwordHash = null`
     - `avatarKey = null` (apagando o objeto físico no S3/MinIO via `StorageGateway`)
     - `mfaTotpSecretEncrypted = null`, `mfaTotpEnabledAt = null`
     - `anonymizedAt = now()` (estado `ANONYMIZED`)
   - Emite `iam.user.anonymized.v1`, que dispara:
     - Remoção do documento em `user_profile_views` (MongoDB do `iam`).
     - Remoção dos vínculos (`Membership`) do usuário nas organizações em que era membro (`tenancy`).
     - Limpeza de notificações e preferências (`notifications`).

---

## 4. Requisitos Funcionais (RF) e Regras de Negócio

### RF-01 — Cadastro de Usuário (`RegisterUser`)
- **Normalização de e-mail:** `trim()` + `toLowerCase()`, formato válido segundo RFC 5322 simplificado, máximo de 254 caracteres.
- **Unicidade:** não podem existir dois usuários com o mesmo e-mail normalizado (`IAM.EMAIL_ALREADY_IN_USE`).
- **Nome:** obrigatório, `trim()`, mínimo 2 e máximo 120 caracteres.
- **Locale:** opcional no cadastro (`en` ou `pt-BR`), assumindo `pt-BR` (ou o `Accept-Language` da requisição) como default.
- **Política de senha:**
  - Mínimo de **8 caracteres** e máximo de **128 caracteres** (proteção contra DoS em hashing Argon2id).
  - Deve conter pelo menos **1 letra** Unicode (`\p{L}`) e **1 dígito** numérico (`\p{N}`).
  - Espaços internos ou nas extremidades são preservados (suporte a *passphrases* segundo NIST SP 800-63B).
- **Estado inicial:** `emailVerifiedAt = null`, `mfaTotpEnabledAt = null`, `deletionRequestedAt = null`, `anonymizedAt = null`.

### RF-02 — Verificação de E-mail (`VerifyEmail` & `ResendVerificationEmail`)
- **Token de verificação:** string aleatória criptograficamente segura (32 bytes / 256 bits em base64url). Apenas o **hash SHA-256** do token é persistido; o token em texto puro é enviado exclusivamente na carga de disparo de e-mail.
- **Validade (TTL):** 24 horas.
- **Uso único:** ao ser utilizado com sucesso, o token é invalidado imediatamente. Se o usuário já estiver verificado, retorna erro de token inválido/expirado (`IAM.INVALID_OR_EXPIRED_VERIFICATION_TOKEN`).
- **Cooldown de reenvio:** máximo de 1 reenvio a cada **60 segundos** por usuário para evitar abuso de envio de e-mails. Se solicitado dentro da janela de cooldown ou para um e-mail inexistente/já verificado, a API ainda retorna `202 Accepted` sem disparar novo e-mail.

### RF-03 — Autenticação com Senha (`AuthenticateWithPassword`)
- **Prevenção de Timing Attack:** se o e-mail não for encontrado (ou a conta estiver `ANONYMIZED`), o caso de uso executa `PasswordHasher.verify` contra um hash Argon2id estático pré-computado antes de retornar `IAM.INVALID_CREDENTIALS`.
- **Ordem estrita de verificação:**
  1. Verifica se o usuário existe, não está `ANONYMIZED` e se a senha confere. Se falhar → `IAM.INVALID_CREDENTIALS` (`401 Unauthorized`).
  2. Verifica se `emailVerifiedAt !== null`. Se for `null` → `IAM.EMAIL_NOT_VERIFIED` (`403 Forbidden`).
  3. Verifica se `mfaTotpEnabledAt !== null`:
     - Se **sim**: gera `mfaChallengeToken` (TTL de **5 minutos** no Redis) e retorna `{ status: 'MFA_REQUIRED', mfaChallengeToken, expiresIn: 300, availableMethods: ['totp', 'email_otp'] }`. *(A verificação de `PENDING_DELETION` ocorrerá logo após concluir o desafio MFA).*
     - Se **não**: avança para o passo 4.
  4. Verifica se `deletionRequestedAt !== null`:
     - Se **sim** (conta em *grace period*): gera `reactivationToken` (uso único, TTL de **5 minutos** no Redis, guardando `mfaVerified`) e retorna `{ status: 'ACCOUNT_PENDING_DELETION', deletionScheduledFor, reactivationToken, expiresIn: 300 }`.
     - Se **não**: cria a `Session` e emite `{ status: 'AUTHENTICATED', accessToken, refreshToken, expiresIn }`.
- **Emissão de Tokens:**
  - `accessToken`: JWT assinado com `EdDSA (Ed25519)`, header contendo `kid`, payload contendo `{ sub: userId, sid: sessionId, mfa: boolean, iat, exp }`, TTL de **15 minutos** (configurável via env).
  - `refreshToken`: token opaco vinculado à `Session`, TTL de **7 dias** (configurável via env).

### RF-04 — Autenticação de Múltiplos Fatores (`SetupMfaTotp`, `EnableMfaTotp`, `DisableMfa`, `SendMfaEmailOtp`, `VerifyMfaChallenge`)
- **TOTP (RFC 6238):** algoritmo SHA-1, 6 dígitos, período de 30 segundos, tolerância de ±1 janela (±30s) para compensar desvio de relógio (*clock skew*).
- **Criptografia do Segredo TOTP:** o segredo TOTP é armazenado criptografado com **AES-256-GCM** (usando chave de criptografia da aplicação `MFA_ENCRYPTION_KEY`) e nunca é exposto após o setup inicial.
- **Proteção Anti-Replay TOTP (RFC 6238 §5.2):** cada código TOTP validado registra o *time-step* no Redis (`mfa:totp:used:{userId}:{timeStep}`, TTL 90s). Tentar reutilizar o mesmo código dentro da mesma janela de 30–90s é rejeitado com `IAM.INVALID_MFA_CODE`.
- **Fallback OTP por E-mail:**
  - Só pode ser solicitado apresentando um `mfaChallengeToken` válido (ou por usuário autenticado em fluxo de desativação/exclusão).
  - Código numérico de 6 dígitos criptograficamente aleatório, persistido como hash SHA-256 no Redis, TTL de **5 minutos**, cooldown de envio de **60 segundos**.
- **Limite de Tentativas por Desafio:** um `mfaChallengeToken` suporta no máximo **5 tentativas falhas** de verificação. Na 5ª falha, o desafio é destruído imediatamente (`IAM.MFA_CHALLENGE_LOCKED`), exigindo que o usuário reinicie o login com senha.
- **Integração com `tenancy` (Enforcement por Organização):** como o JWT carrega `mfa: true | false`, o guard de autorização da organização (`tenancy`) pode bloquear o acesso a organizações que marcaram a política `requireMfa: true` caso o usuário ainda não tenha configurado MFA (`TENANCY.MFA_REQUIRED_BY_ORGANIZATION`).

### RF-05 — Rotação de Refresh Token e Reuse Detection (`RefreshSessionToken`)
- Todo refresh válido gera um **novo** `refreshToken` (e um novo `accessToken` preservando a flag `mfa` da sessão) e marca o token anterior daquela sessão como substituído.
- **Detecção de reuso:** se o cliente apresentar um `refreshToken` que pertence a uma sessão, mas não é o token atual ativo daquela sessão (ou seja, já foi rotacionado anteriormente), o sistema:
  1. Marca a `Session` como revogada (`revokedAt = now()`, `revokeReason = 'TOKEN_REUSE_DETECTED'`).
  2. Emite o evento `iam.session.revoked.v1` para trilha de auditoria.
  3. Retorna `IAM.REFRESH_TOKEN_REUSED` (`401 Unauthorized`).
- Se a sessão estiver expirada ou já revogada por logout/troca de senha/exclusão, retorna `IAM.SESSION_EXPIRED_OR_REVOKED` (`401 Unauthorized`).

### RF-06 — Gestão de Sessões (`ListMySessions`, `RevokeSession`, `RevokeOtherSessions`)
- O usuário só pode visualizar ou revogar sessões cujo `userId` seja igual ao seu próprio `sub`. Tentar revogar sessão de outro usuário (ou inexistente) retorna `COMMON.RESOURCE_NOT_FOUND` (`404`).
- Quando uma sessão é revogada, seu estado no Redis/Postgres é invalidado imediatamente.

### RF-07 — Recuperação e Troca de Senha (`RequestPasswordReset`, `ResetPassword`, `ChangePassword`)
- **Reset Token:** 32 bytes aleatórios (hash SHA-256 persistido), TTL de **30 minutos**, uso único. Gerar um novo token invalida o anterior.
- **Efeito nas sessões:**
  - `ResetPassword` (fluxo "esqueci a senha") revoga **100% das sessões ativas** do usuário (`revokeReason = 'PASSWORD_RESET'`).
  - `ChangePassword` (fluxo autenticado) exige `currentPassword` válida, rejeita `newPassword === currentPassword` (`IAM.PASSWORD_MUST_BE_DIFFERENT`) e revoga **todas as sessões exceto a atual** (`revokeReason = 'PASSWORD_CHANGED'`).

### RF-08 — Atualização de Perfil e Avatar (`RequestAvatarUploadUrl`, `UpdateUserProfile`, `GetUserProfile`)
- **Formatos de avatar aceitos:** `image/jpeg`, `image/png`, `image/webp` (`IAM.UNSUPPORTED_AVATAR_MIME_TYPE`).
- **Tamanho máximo do avatar:** 5 MB (`5_242_880` bytes) (`IAM.AVATAR_FILE_TOO_LARGE`).
- **Isolamento de chave de storage:** no `PATCH /me`, se `avatarKey` for enviado, deve obrigatoriamente respeitar o prefixo `avatars/{userId}/` e existir no bucket (`StorageGateway.exists(avatarKey)`), caso contrário retorna `IAM.INVALID_AVATAR_KEY`.
- **Propagação assíncrona:** atualizar `name`, `locale` ou `avatarKey` emite `iam.user.updated.v1`, permitindo que o `UserProfileProjector` (`iam`) e o `OrganizationMembersProjector` (`tenancy`) atualizem suas views desnormalizadas no MongoDB.

### RF-09 — Exclusão e Anonimização de Conta (`RequestAccountDeletion`, `CancelAccountDeletion`, `AnonymizeExpiredAccounts`)
- **Confirmação Forte (Step-up):** exigir `currentPassword` válida. Se o usuário tiver MFA habilitado (`mfaTotpEnabledAt !== null`), exigir também `mfaCode` (TOTP ou OTP por e-mail) válido na requisição de exclusão.
- **Invariante Cross-Module (Sole Owner Check):** consultar `TenancyFacade.getOrganizationsWhereUserIsSoleOwner(userId)` antes de agendar a exclusão. Se retornar ≥ 1 organização, abortar com `IAM.CANNOT_DELETE_SOLE_ORGANIZATION_OWNER` (`409 Conflict`).
- **Janela de Arrependimento (Grace Period):** **15 dias corridos** (`15 * 24 * 60 * 60 * 1000` ms) a partir de `deletionRequestedAt`. Durante essa janela, os vínculos nas organizações permanecem congelados, o e-mail continua reservado e o fluxo de recuperação de senha ("Esqueci minha senha") continua permitido caso o usuário precise recuperar a senha para reativar a conta.
- **Reativação Explícita (`CancelAccountDeletion`):** consome o `reactivationToken` (emitido após login 1FA + MFA válido), limpa `deletionRequestedAt` e `deletionScheduledFor`, cria imediatamente uma nova `Session` autenticada (retornando `{ accessToken, refreshToken }`) e emite `iam.user.deletion_canceled.v1`.
- **Irreversibilidade pós-anonimização:** uma vez executada a anonimização (`anonymizedAt !== null`), a conta jamais pode ser recuperada ou fazer login, e o e-mail original fica livre caso a pessoa decida criar uma conta nova do zero no futuro.

---

## 5. Requisitos Não-Funcionais, Segurança e Rate Limiting

| Endpoint / Operação | Limite de Taxa (Rate Limit) | Objetivo |
|---|---|---|
| `POST /auth/register` | 5 req / min por IP | Mitigar criação massiva de contas (bots) |
| `POST /auth/login` | 10 req / min por IP + 5 falhas / 15 min por `(ip, email)` | Mitigar *Brute Force* e *Credential Stuffing* |
| `POST /auth/mfa/verify` | 10 req / min por IP + máx. 5 tentativas por `mfaChallengeToken` | Impedir brute force de códigos de 6 dígitos |
| `POST /auth/mfa/email-otp/send` | 3 req / min por IP + cooldown de 60s por desafio | Evitar *Email Bombing* no fallback de MFA |
| `POST /auth/password/forgot` | 3 req / min por IP | Evitar *Email Bombing* e enumeração |
| `POST /auth/email/resend-verification` | 3 req / min por IP + cooldown de 60s por conta | Evitar *Email Bombing* |
| `POST /auth/refresh` | 30 req / min por IP | Permitir refresh normal sem abrir vetor de abuso |

### Segurança de Segredos em Eventos (Regra Crítica)
- Senhas em texto puro, hashes Argon2id, segredos TOTP e `refreshTokens` **jamais** saem em logs (ver ADR-0013) nem em payloads do Kafka.
- Para os e-mails de verificação, reset de senha e OTP de MFA por e-mail: o evento publicado para o módulo `notifications` carrega o token/código de uso único (TTL curto), mas o módulo `audit` **não** persiste campos de código/token na trilha de auditoria.

---

## 6. Fora de Escopo (Non-Goals para o Boilerplate v1)

Para manter o boilerplate enxuto e focado nos padrões arquiteturais de referência, os itens abaixo **não** entram na F6 (podem ser adicionados por projetos derivados):
- Social Login / OAuth2 externo (Google, GitHub, Microsoft) e SAML/OIDC Enterprise SSO.
- WebAuthn / Passkeys (chaves de segurança físicas FIDO2 / biometria).
- Alteração de endereço de e-mail após o cadastro (fluxo de dupla confirmação de e-mail antigo/novo).
- Impersonation de usuários por administradores da plataforma.
