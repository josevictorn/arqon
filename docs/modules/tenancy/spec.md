# Módulo `tenancy` — Organizations, Custom Roles & Dynamic ABAC

> Fonte da verdade de **negócio** do módulo. Arquitetura técnica: [06-security-tenancy-casl.md](../../architecture/06-security-tenancy-casl.md).

- **Status:** 📝 Planejado
- **Fase do roadmap:** F8
- **ADRs relevantes:** 0008, 0009

## Propósito
Organizações (tenants), membros, convites, cargos customizados e o motor de permissões (CASL). **Não** cuida de cobrança (billing) nem de credenciais (iam).

## Modelo de domínio
| Tipo | Nome | Descrição |
|---|---|---|
| Aggregate Root | `Organization` | Nome, `Slug`, membros (`OrganizationMemberList` como `WatchedList`) |
| Entity | `Membership` | `userId` + `roleIds[]` |
| Aggregate Root? | `Role` | Nome, descrição, `permissions: PermissionRule[]`, `isSystemOwner` *(definir se é agregado próprio ou parte de `Organization`)* |
| Aggregate Root? | `Invite` | E-mail, `roleIds`, status, expiração, `createdById` |
| Value Object | `Slug`, `PermissionRule` | |
| Factory | `RoleDomainFactory` | Cria o cargo `Owner` (`manage all`, `isSystemOwner: true`) |

## Invariantes
- **INV-01:** cargo `isSystemOwner` não pode ser deletado nem ter permissões alteradas → `TENANCY.SYSTEM_ROLE_IMMUTABLE`
- **INV-02:** organização sempre tem ≥ 1 membro com o cargo Owner → `TENANCY.LAST_OWNER_REQUIRED`
- **INV-03:** slug único → `TENANCY.SLUG_TAKEN`
- **INV-04:** convite respeita a quota `max_members` do plano (via `BillingFacade`) → `BILLING.PLAN_QUOTA_EXCEEDED`
- **INV-05:** toda regra CASL é forçada com `{ organizationId }` (sem vazamento cross-tenant)
- **INV-06:** o usuário nunca envia condições CASL cruas; só atributos do catálogo (`onlyOwnResource`, `maxAmountCents`, `allowedStatuses`)

## Commands (Write — PostgreSQL)
| Command | Regras | Emite |
|---|---|---|
| `CreateOrganizationCommand` | INV-03; cria Owner via factory; vincula criador | `tenancy.organization.created.v1` |
| `CreateCustomRoleCommand` | INV-06 | `tenancy.role.updated.v1` |
| `UpdateRolePermissionsCommand` | INV-01, INV-06; invalida cache Redis | `tenancy.role.updated.v1` |
| `DeleteCustomRoleCommand` | INV-01; *o que acontece com membros que têm o cargo?* | `tenancy.role.updated.v1` |
| `AssignRolesToMemberCommand` | INV-02; invalida cache | `tenancy.member.roles_updated.v1` |
| `TransferOwnershipCommand` | INV-02 | `tenancy.member.roles_updated.v1` |
| `InviteMemberCommand` | INV-04 | `tenancy.member.invited.v1` |
| `AcceptInviteCommand` | UoW: convite + membership + cargos | `tenancy.member.accepted.v1` |
| `CancelInviteCommand` | CASL nível 2 (`subject('Invite', invite)`) | ⚠️ evento a definir |

## Queries (Read — MongoDB)
| Query | Collection | Permissão |
|---|---|---|
| `FetchOrganizationMembersQuery` | `organization_members_views` | `read Member` |
| `FetchOrganizationRolesQuery` | `organization_roles_views` | `read Role` |

## Read Models / Projectors
| Projector | Collection | Eventos |
|---|---|---|
| `OrganizationMembersProjector` | `organization_members_views` | `tenancy.*`, `iam.user.updated.v1` |
| `OrganizationRolesProjector` | `organization_roles_views` | `tenancy.role.updated.v1`, `tenancy.member.*` (contagem `$inc`) |

## Facade pública (`TenancyFacadeContract`)
| Método | Retorno |
|---|---|
| `getMemberPermissionsInOrganization(userId, orgId)` | regras CASL cruas (já unidas) |
| `getOrganizationSummary(orgId)` | `{ id, name, slug }` |

## Autorização (resumo)
Zod input → `PermissionRule` VO → JSONB em `roles.permissions` → cache Redis `permissions:org:{orgId}:user:{userId}` → `TenantAbilityFactory` → `PoliciesGuard` (nível 1) + `subject()` no Command (nível 2).

## Perguntas abertas
- `Role` e `Invite`: agregados próprios ou parte de `Organization`? (Impacta concorrência e o tamanho do agregado.)
- Ao deletar um cargo customizado, os membros perdem o cargo automaticamente ou a deleção é bloqueada se houver membros?
- Expiração de convites (prazo) e reenvio.
- Um usuário que ainda não tem conta aceita convite como? (Cadastro + aceite.)
- Tenant ativo: `activeTenantId` no JWT ou header por request? (Ver [Perguntas abertas](../../decisions/README.md).)
- Remover membro / sair da organização entra no escopo?

---
<details><summary>Escopo original do blueprint (§12.2)</summary>

- **Entities / VOs**: `Organization` (AggregateRoot), `Role`, `PermissionRule`, `Membership`, `OrganizationMemberList` (`WatchedList`), `Invite`, `Slug`.
- **Domain Factory**: `RoleDomainFactory`.
- **Commands**: `CreateOrganizationCommand`, `CreateCustomRoleCommand`, `UpdateRolePermissionsCommand`, `DeleteCustomRoleCommand`, `AssignRolesToMemberCommand`, `TransferOwnershipCommand`, `InviteMemberCommand` (BillingFacade.checkFeatureQuota), `AcceptInviteCommand` (UnitOfWork).
- **Projectors & Queries**: `OrganizationMembersProjector`, `OrganizationRolesProjector`, `FetchOrganizationMembersQuery`, `FetchOrganizationRolesQuery`.
- **Facade**: `getMemberPermissionsInOrganization`, `getOrganizationSummary`.
</details>

