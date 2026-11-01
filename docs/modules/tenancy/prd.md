# PRD — Módulo `tenancy` (Organizations, Custom Roles & Dynamic ABAC)

- **Status:** ✅ Aprovado
- **Fase do Roadmap:** F8
- **Spec técnica derivada:** [`./spec.md`](./spec.md)
- **Referências de mercado:** GitHub Enterprise (Custom Repository/Org Roles), Vercel Teams, Linear Workspaces, WorkOS RBAC, Clerk Organizations, AWS IAM (Policy Conditions), CASL Isomorphic Authorization.

---

## 1. Visão Geral e Propósito

O módulo **`tenancy`** é a autoridade central de **multi-tenancy (Organizações), gestão de equipe (Membros e Convites) e autorização dinâmica (RBAC + ABAC via CASL)** na plataforma SaaS.

Enquanto o módulo `iam` responde **"Quem é este usuário?"**, o módulo `tenancy` responde **"A quais organizações ele pertence e o que exatamente ele pode fazer dentro de cada uma?"**.

### Fronteira do Contexto Delimitado (O que é vs. O que não é `tenancy`)
- **É responsabilidade do `tenancy`:** ciclo de vida das organizações (`Organization`), políticas de segurança por organização (como exigência de MFA), vínculo de membros (`Membership`), ciclo de vida de convites (`Invite`), catálogo de cargos customizados (`Role`) com regras ABAC compiladas para CASL e hidratação de permissões em tempo real no Redis.
- **NÃO é responsabilidade do `tenancy`:** credenciais de login/senha/TOTP (pertencem ao `iam`) e planos comerciais, cobrança ou cálculo de limites contratados (pertencem ao `billing`, que é consultado via `BillingFacade`).

---

## 2. Benchmark e Padrões de Mercado Adotados

| Fluxo / Capacidade | Referência de Mercado | Padrão Adotado no Boilerplate |
|---|---|---|
| **Resolução do Tenant Ativo** | Vercel / Linear / GitHub | **Por requisição (Stateless no JWT):** o JWT identifica apenas o usuário (`sub`, `sid`, `mfa`). A organização ativa é informada na rota (`/organizations/:orgId/...`) ou no header `X-Organization-Id`, validada em `< 1ms` via Redis. Permite múltiplas abas abertas em organizações distintas e troca instantânea de contexto. |
| **Isolamento de Dados Multi-Tenant** | AWS SaaS Lens / Citus | **Defesa em profundidade em 3 camadas:** (1) Guard HTTP (`PoliciesGuard`), (2) Filtro CASL `{ organizationId }` em memória no UseCase e (3) **PostgreSQL Row-Level Security (RLS)** via `SET LOCAL app.current_tenant_id` na transação do `UnitOfWork`. |
| **Cargos Dinâmicos + ABAC Seguro** | GitHub Enterprise / AWS IAM | Em vez de `enum` fixo no código, cada organização define seus próprios cargos combinando recursos, ações e **atributos seguros pré-homologados** (`onlyOwnResource`, `maxAmountCents`, `allowedStatuses`). O usuário nunca envia operadores crus de banco pela API. |
| **Cargos Iniciais (Seeds da Org)** | Clerk / Linear | Toda organização nasce com dois cargos criados pela `RoleDomainFactory`: **`Owner`** (`isSystemOwner: true`, imutável, permissão total `manage all`) e **`Member`** (`isSystemOwner: false`, editável, permissões básicas de leitura). |
| **Proteção contra Orfandade (Sole Owner)** | GitHub / Vercel / Stripe | Uma organização jamais pode ficar com `< 1` membro detentor do cargo `Owner`. Também é bloqueada a exclusão de conta no `iam` se o usuário for o único `Owner` de alguma organização ativa. |
| **Exigência de MFA por Organização** | GitHub / Slack / WorkOS | Organizações podem ativar a flag `requireMfa: true`. Se ativada, membros cuja sessão não foi autenticada com 2º fator (`jwt.mfa === false`) recebem erro `403 Forbidden` (`TENANCY.MFA_REQUIRED_BY_ORGANIZATION`) ao tentar acessar recursos da organização, sendo instruídos a ativar/validar o MFA. |
| **Exclusão Segura de Cargos** | AWS IAM / GitHub | Tentar deletar um cargo customizado que ainda está atribuído a membros ou convites pendentes é bloqueado com `409 Conflict` (`TENANCY.ROLE_ASSIGNED_TO_MEMBERS`), exigindo reatribuição explícita antes. |

---

## 3. Personas e Jornadas do Usuário

### J1 — Criação de Organização e Seletor de Contexto (Workspace Switcher)
1. **Usuário autenticado** acessa a plataforma e cria uma nova organização (`POST /organizations`) informando `name` e `slug` (ex.: `acme-corp`).
2. O sistema valida que o `slug` é único, cria a `Organization`, instancia os cargos iniciais **`Owner`** (imutável) e **`Member`** (editável), vincula o criador como membro detentor do cargo `Owner` e emite `tenancy.organization.created.v1` (que aciona o módulo `billing` para criar a assinatura inicial no plano `Free`).
3. Na barra lateral da aplicação, o usuário consulta `GET /me/organizations` para listar todas as organizações das quais faz parte (com seu papel, nome, slug e se a org exige MFA) e alterna entre elas instantaneamente apenas mudando o `:orgId` / header `X-Organization-Id`.

### J2 — Governança de Cargos Customizados e ABAC Dinâmico
1. **Owner ou Administrador de Cargos** acessa "Configurações → Cargos e Permissões" (`GET /organizations/:orgId/roles`).
2. Ele cria um novo cargo customizado `"Analista Financeiro Júnior"` (`POST /organizations/:orgId/roles`) selecionando na UI:
   - `Invoice`: ações `['read', 'update']` com restrição de atributo `maxAmountCents: 500000` (até R$ 5.000,00).
   - `Invite`: ações `['create', 'read']`, e ação `['delete']` com restrição `onlyOwnResource: true` (só pode cancelar convites que ele mesmo enviou).
3. O sistema compila essas escolhas no Value Object `PermissionRule`, salva na tabela `roles` e projeta no MongoDB.
4. Quando o cargo de um membro é alterado (`PATCH /organizations/:orgId/Roles/:roleId` ou `PUT /organizations/:orgId/members/:userId/roles`), o cache Redis (`permissions:org:{orgId}:user:{userId}`) é invalidado imediatamente, aplicando as novas regras na próxima requisição em `< 1ms`.
5. Se o administrador tentar excluir um cargo customizado (`DELETE /organizations/:orgId/roles/:roleId`):
   - Se for o cargo `Owner` (`isSystemOwner: true`) → bloqueado (`TENANCY.SYSTEM_ROLE_IMMUTABLE`).
   - Se houver qualquer membro ativo ou convite pendente usando esse cargo → bloqueado (`TENANCY.ROLE_ASSIGNED_TO_MEMBERS`), informando quantos membros/convites o utilizam.

### J3 — Ciclo de Vida de Convites e Controle de Quotas (`BillingFacade`)
1. **Membro com permissão `create Invite`** convida `maria@empresa.com` (`POST /organizations/:orgId/invites`) atribuindo um ou mais cargos (ex.: `Member`).
2. O sistema verifica:
   - Se `maria@empresa.com` já é membro da organização (`TENANCY.USER_ALREADY_MEMBER`).
   - Se já existe um convite `PENDING` não expirado para `maria@empresa.com` naquela organização (`TENANCY.INVITE_ALREADY_PENDING`).
   - Se todos os `roleIds` informados pertencem àquela organização (`TENANCY.INVALID_ORGANIZATION_ROLES`).
   - **Quota do Plano (`BillingFacade.checkFeatureQuota`):** soma `membros ativos + convites pendentes não expirados + 1` e verifica contra a quota `max_members` do plano da organização. Se exceder, bloqueia com `BILLING.PLAN_QUOTA_EXCEEDED` (`402 Payment Required` / `403 Forbidden`).
3. O convite é criado com validade de **7 dias** e emite `tenancy.member.invited.v1` (disparando o e-mail de convite via `notifications`).
4. **Reenvio e Cancelamento:**
   - Caso o e-mail não tenha sido visto ou esteja perto de vencer, pode-se chamar `POST /organizations/:orgId/invites/:inviteId/resend` (cooldown de 60s), que renova a validade por mais 7 dias, rotaciona o token e reenvia o e-mail.
   - O convite pode ser cancelado em `DELETE /organizations/:orgId/invites/:inviteId` (avaliando CASL Nível 2 sobre a instância do `Invite`, respeitando `onlyOwnResource` se configurado no cargo).
5. **Aceite do Convite (`POST /invites/:token/accept`):**
   - A pessoa convidada clica no link do e-mail. A tela pública pode consultar `GET /invites/:token` para exibir o nome da organização e quem convidou.
   - Se ela ainda não tiver conta na plataforma, ela faz o cadastro e verifica o e-mail no `iam` (`J1` do `iam`), e em seguida faz login.
   - Autenticada, ela chama `POST /invites/:token/accept`.
   - O sistema valida que o convite está `PENDING` e dentro da validade, confirma que **o e-mail da conta logada no `iam` é exatamente igual ao e-mail do convite** (`TENANCY.INVITE_EMAIL_MISMATCH`), revalida a quota `max_members` no `BillingFacade` e, numa única transação (`UnitOfWork`), marca o convite como `ACCEPTED` e cria o `Membership` com os cargos definidos, emitindo `tenancy.member.accepted.v1`.

### J4 — Gestão de Membros, Transferência de Propriedade e Saída
1. **Listagem da Equipe:** membros com `read Member` consultam `GET /organizations/:orgId/members` (view desnormalizada no MongoDB com nome, e-mail, avatar sincronizado do `iam`, cargos e convites pendentes).
2. **Alteração de Cargos (`PUT /organizations/:orgId/members/:memberUserId/roles`):**
   - Atualiza a lista de cargos do membro (mínimo de 1 cargo obrigatório).
   - Se a alteração remover o cargo `Owner` de alguém, o domínio valida se restará pelo menos 1 `Owner` na organização (`TENANCY.LAST_OWNER_REQUIRED`).
3. **Transferência ou Promoção de Propriedade (`POST /organizations/:orgId/transfer-ownership`):**
   - Exclusivo de um `Owner` atual. Transfere o cargo `Owner` para outro membro da organização (podendo manter o antigo Owner em outro cargo informado, ex.: `Member`, de forma atômica).
4. **Remoção de Membro (`DELETE /organizations/:orgId/members/:memberUserId`):**
   - Remove o vínculo do membro da organização, invalida o cache de permissões no Redis e emite `tenancy.member.removed.v1` (que decrementa `currentMembers` no `BillingOverviewProjector`). Impede remover o último `Owner`.
5. **Saída Voluntária (`POST /organizations/:orgId/leave`):**
   - Qualquer membro pode sair voluntariamente de uma organização, **exceto** se ele for o único `Owner` (`TENANCY.LAST_OWNER_REQUIRED` — precisa transferir a propriedade ou excluir a organização antes).

### J5 — Configurações da Organização, Exigência de MFA e Exclusão da Organização
1. **Atualização (`PATCH /organizations/:orgId`):**
   - Permite alterar `name`, `slug` (validando unicidade) e a política `requireMfa: boolean`.
   - **Trava de segurança ao ativar `requireMfa`:** um administrador só pode ativar `requireMfa: true` na organização se a sua própria sessão atual já estiver autenticada com MFA (`jwt.mfa === true`), evitando que ele tranque a si mesmo para fora imediatamente (`TENANCY.CANNOT_ENABLE_MFA_POLICY_WITHOUT_MFA_SESSION`).
2. **Exclusão da Organização (`DELETE /organizations/:orgId`):**
   - Exclusivo de um membro com o cargo `Owner`. Exige informar `confirmationSlug` igual ao `slug` atual da organização para evitar cliques acidentais.
   - Marca a organização como encerrada/removida, limpa o cache de permissões de todos os membros no Redis e emite `tenancy.organization.deleted.v1` (para o `billing` cancelar imediatamente a assinatura ativa no gateway de pagamento e os projectors removerem as views).

---

## 4. Requisitos Funcionais (RF) e Regras de Negócio

### RF-01 — Modelagem de Agregados e Cargos Iniciais
- O domínio do `tenancy` é dividido em **3 Aggregate Roots independentes** para garantir transações curtas e zero contenção de lock ao convidar pessoas ou editar cargos:
  1. `Organization` (contendo `OrganizationMemberList` como `WatchedList<Membership>`).
  2. `Role` (cargo vinculado a `organizationId`, contendo `PermissionRule[]`).
  3. `Invite` (convite vinculado a `organizationId`).
- **`Slug` Value Object:** normalizado (`trim().toLowerCase()`), apenas letras minúsculas ASCII, números e hífens (`^[a-z0-9]+(?:-[a-z0-9]+)*$`), tamanho entre 3 e 60 caracteres, bloqueando palavras reservadas (`admin`, `api`, `auth`, `me`, `billing`, `organizations`, `invites`, `health`, `docs`, `metrics`).
- **Seeds de Cargos na Criação (`RoleDomainFactory`):**
  - `Owner`: `isSystemOwner: true`, `permissions: [{ action: ['manage'], subject: 'all' }]`.
  - `Member`: `isSystemOwner: false`, `permissions: [{ action: ['read'], subject: 'Organization' }, { action: ['read'], subject: 'Member' }, { action: ['read'], subject: 'Role' }]`.

### RF-02 — Motor de Permissões ABAC Dinâmico (CASL em 2 Níveis)
- **Subjects suportados:** `'Organization' | 'Member' | 'Invite' | 'Role' | 'Subscription' | 'Invoice' | 'AuditLog' | 'all'`.
- **Actions suportadas:** `'create' | 'read' | 'update' | 'delete' | 'manage'`.
- **Atributos ABAC homologados (Input Seguro):**
  - `onlyOwnResource?: boolean` → compila para `{ createdById: '{{userId}}' }`.
  - `maxAmountCents?: number` → compila para `{ amountCents: { $lte: <valor> } }`.
  - `allowedStatuses?: string[]` → compila para `{ status: { $in: [<status>] } }`.
- **Hidratação e Isolamento Cross-Tenant:**
  - `TenantAbilityFactory` une (`flatMap`) as regras de todos os cargos do membro na organização, interpola `{{userId}}` e injeta obrigatoriamente `organizationId: context.organizationId` em todas as condições (mesmo no `manage all`).
  - Cache no Redis em `permissions:org:{orgId}:user:{userId}` (TTL de 1 hora, invalidado proativamente por eventos/commands sempre que cargos ou vínculos mudam).

### RF-03 — Enforcement de MFA por Organização (`requireMfa`)
- Quando `organization.requireMfa === true`, o guard de contexto da organização verifica a claim `mfa` do `accessToken` JWT (definida no ADR-0015).
- Se `jwt.mfa !== true`, qualquer operação naquela organização é negada imediatamente no Guard HTTP com `TENANCY.MFA_REQUIRED_BY_ORGANIZATION` (`403 Forbidden`).

### RF-04 — Regras de Integridade de Membros e Proprietários
- **Invariante do Último Owner (`INV-02`):** toda operação que altera cargos de um membro (`AssignRolesToMember`), remove um membro (`RemoveMember`) ou processa a saída voluntária (`LeaveOrganization`) deve verificar, dentro do agregado `Organization`, se após a operação ainda resta `>= 1` membro com o `ownerRoleId`. Caso contrário, retorna `TENANCY.LAST_OWNER_REQUIRED` (`422 Unprocessable Entity`).
- **Mínimo de 1 Cargo por Membro:** todo `Membership` deve possuir `roleIds.length >= 1` (`TENANCY.MEMBER_REQUIRES_AT_LEAST_ONE_ROLE`).
- **Consulta de Último Owner para o `iam`:** a `TenancyFacade` expõe `getOrganizationsWhereUserIsSoleOwner(userId)` para que o módulo `iam` bloqueie pedidos de exclusão de conta enquanto o usuário for o único `Owner` de qualquer organização ativa.

### RF-05 — Regras de Convites e Quotas
- **Contagem de Quota:** para evitar que uma organização no plano `Free` (ex.: limite de 3 membros) dispare 50 convites simultâneos e estoure o limite, o `InviteMemberCommand` passa para o `BillingFacade.checkFeatureQuota` o valor `currentUsage = activeMembersCount + pendingInvitesCount`. No `AcceptInviteCommand`, valida-se novamente `activeMembersCount < limit`.
- **Verificação de Identidade no Aceite:** `AcceptInviteCommand` consulta `IamFacade.getUserSummaryById(currentUserId)` e exige que `user.email === invite.email`.

### RF-06 — Reação Assíncrona a Eventos do `iam`
- Quando o usuário atualiza seu nome ou avatar no `iam` (`iam.user.updated.v1`), o `OrganizationMembersProjector` atualiza os campos desnormalizados `name` e `avatarUrl` em todas as organizações em que aquele `userId` aparece.
- Quando uma conta é anonimizada após os 15 dias de *grace period* (`iam.user.anonymized.v1`), um Subscriber do `tenancy` remove os `Membership`s daquele `userId` (e cancela convites pendentes associados), emitindo `tenancy.member.removed.v1` para atualizar as views e liberar assentos na quota do `billing`.

---

## 5. Requisitos Não-Funcionais, Segurança e Isolamento (RLS)

### PostgreSQL Row-Level Security (Defesa em Profundidade)
- As tabelas `memberships`, `roles` e `invites` possuem a coluna `organization_id UUID NOT NULL` e políticas de RLS ativas (`ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`).
- Quando um Command ou Query executa dentro do contexto de um tenant, o `PrismaUnitOfWork` (via `AsyncLocalStorage`) configura `SET LOCAL app.current_tenant_id = '<orgId>'` no início da transação.

### Performance do Guard de Autorização
- A resolução de `Membership` + `requireMfa` + regras CASL da organização ativa deve responder em **p99 < 2ms** através do cache Redis (`permissions:org:{orgId}:user:{userId}`), indo ao PostgreSQL apenas em caso de *cache miss*.

---

## 6. Fora de Escopo (Non-Goals para o Boilerplate v1)

- Hierarquia de sub-organizações (Organizações filhas / Pastas / Departamentos aninhados).
- Domínios verificados com *Auto-Join* (ex.: qualquer pessoa com `@empresa.com.br` entra automaticamente sem convite).
- Provisionamento automático de diretórios corporativos via protocolo SCIM 2.0.
- Convites por link público aberto (sem e-mail de destinatário específico).

