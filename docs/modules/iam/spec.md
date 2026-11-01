# Módulo `iam` — Identity & Access Management

> Fonte da verdade de **negócio** do módulo. Arquitetura técnica: [03-module-anatomy.md](../../architecture/03-module-anatomy.md).

- **Status:** 📝 Planejado
- **Fase do roadmap:** F6 (**módulo de referência**: as skills serão extraídas dele)
- **ADRs relevantes:** 0008, 0009

## Propósito
Identidade do usuário (cadastro, credenciais, sessões, perfil). **Não** cuida de organizações nem de permissões por tenant (isso é `tenancy`).

## Modelo de domínio
| Tipo | Nome | Descrição |
|---|---|---|
| Aggregate Root | `User` | Nome, e-mail, hash de senha, avatar, locale |
| Entity | `Session` | Sessão por dispositivo, com família de refresh tokens |
| Value Object | `Email` | Normalizado (lowercase, trim) e validado |
| Value Object | `Password` | Política de força; o hash vem via `CryptographyGateway` (Argon2id) |

## Invariantes
- **INV-01:** e-mail único na plataforma → `IAM.EMAIL_ALREADY_IN_USE`
- **INV-02:** senha cumpre a política mínima → `IAM.WEAK_PASSWORD` *(definir a política)*
- **INV-03:** reuso de refresh token já rotacionado invalida toda a família da sessão → `IAM.REFRESH_TOKEN_REUSED`

## Commands (Write — PostgreSQL)
| Command | Regras | Emite |
|---|---|---|
| `RegisterUserCommand` | INV-01, INV-02; hash Argon2id | `iam.user.registered.v1` |
| `AuthenticateWithPasswordCommand` | Verifica hash; cria `Session`; access (15 min) + refresh (7 dias, hash no Redis) | — (audit de login? ver perguntas) |
| `RefreshSessionTokenCommand` | Rotação; INV-03 | — |
| `RequestPasswordResetCommand` | Token de uso único com expiração; resposta neutra (não revela se o e-mail existe) | ⚠️ evento a definir |
| `ResetPasswordCommand` | Consome o token; invalida todas as sessões | — |
| `UpdateUserAvatarCommand` | Presigned URL via `StorageGateway` | `iam.user.updated.v1` |

## Queries (Read — MongoDB)
| Query | Collection | Permissão |
|---|---|---|
| `GetUserProfileQuery` | `user_profile_views` | Próprio usuário |

## Read Models / Projectors
| Projector | Collection | Eventos |
|---|---|---|
| `UserProfileProjector` | `user_profile_views` | `iam.user.registered.v1`, `iam.user.updated.v1` |

## Facade pública (`IamFacadeContract`)
| Método | Retorno |
|---|---|
| `getUserSummaryById(userId)` | `{ id, name, email, avatarUrl } \| null` |
| `getUserByEmail(email)` | `{ id, name, email } \| null` |

## Endpoints HTTP (proposta)
| Método | Rota | Use case |
|---|---|---|
| POST | `/auth/register` | RegisterUser |
| POST | `/auth/login` | AuthenticateWithPassword (rate limit por IP) |
| POST | `/auth/refresh` | RefreshSessionToken |
| POST | `/auth/password/forgot` | RequestPasswordReset |
| POST | `/auth/password/reset` | ResetPassword |
| POST | `/me/avatar` | UpdateUserAvatar |
| GET | `/me` | GetUserProfile |

## Perguntas abertas
- Como o e-mail de reset é enviado? Evento `iam.password.reset_requested.v1` consumido por `notifications`? (Recomendado: sim.)
- Logout / revogação de sessão (`RevokeSessionCommand`) entra no escopo?
- Verificação de e-mail no cadastro entra no escopo?
- Login / falha de login gera audit log?
- Upload de avatar: o Command gera a presigned URL e um segundo endpoint confirma o upload? Definir o fluxo.

---
<details><summary>Escopo original do blueprint (§12.1)</summary>

- **Entities / VOs (Postgres Write)**: `User` (AggregateRoot), `Session`, `Email` (VO), `Password` (VO com validação e hash Argon2).
- **Commands**: `RegisterUserCommand` (Emite `iam.user.registered.v1`), `AuthenticateWithPasswordCommand`, `RefreshSessionTokenCommand`, `RequestPasswordResetCommand` & `ResetPasswordCommand`, `UpdateUserAvatarCommand` (`StorageGateway` + `iam.user.updated.v1`).
- **Projectors & Queries**: `UserProfileProjector` → `user_profile_views`; `GetUserProfileQuery`.
- **Facade (`IamFacade`)**: `getUserSummaryById`, `getUserByEmail`.
</details>

