# Módulo `audit` — Audit Logs & Security Trail

- **Status:** 📝 Planejado
- **Fase do roadmap:** F10
- **ADRs relevantes:** 0008

## Propósito
Trilha de auditoria imutável e consultável por organização, alimentada por eventos críticos de todos os módulos.

## Modelo
- `AuditLog`: `actorId`, `actorName`, `actorEmail`, `tenantId`, `ipAddress`, `action`, `target`, `metadata`, `createdAt`. Imutável.
- Collection `organization_audit_logs_views` com índice composto `(organizationId, createdAt DESC)` e TTL/retenção configurável.

## Consumers / Projectors
| Eventos | Efeito |
|---|---|
| `iam.*`, `tenancy.*`, `billing.*` (críticos) | Grava log desnormalizado com dados do ator |

## Queries
| Query | Filtros | Permissão |
|---|---|---|
| `FetchOrganizationAuditLogsQuery` | data, ação, ator (paginação por cursor) | `read AuditLog` |

## Perguntas abertas
- Gravação só no Mongo (projeção) ou também no Postgres para imutabilidade e compliance? O blueprint diz "gravado de forma imutável **e** projetado". Definir a fonte da verdade.
- `ipAddress` e `actorName`: os eventos precisam carregar metadados do ator (ator e IP no envelope?). Impacta a T2.05.
- Eventos de `iam` não têm `organizationId`: como entram num log "por organização"?
- Política de retenção padrão (dias).

---
<details><summary>Escopo original do blueprint (§12.5)</summary>

- **Entities / Storage**: `AuditLog` imutável, projetado em `organization_audit_logs_views` com índices `(organizationId, createdAt DESC)` e TTL.
- **Consumers / Projectors**: eventos críticos (`tenancy.*`, `billing.*`, `iam.*`) → trilha desnormalizada (`actorId`, `actorName`, `actorEmail`, `tenantId`, `ipAddress`, `action`, `metadata`).
- **Queries**: `FetchOrganizationAuditLogsQuery` protegido por `can('read', 'AuditLog')`.
</details>

