# Módulo `<ctx>` — Especificação

> Fonte da verdade de **negócio** do módulo. Arquitetura técnica: [03-module-anatomy.md](../architecture/03-module-anatomy.md).

- **Status:** 📝 Planejado | 🚧 Em implementação | ✅ Implementado
- **Fase do roadmap:** F<N>
- **ADRs relevantes:** —

## Propósito
<1–3 frases: o que este bounded context resolve e o que **não** é responsabilidade dele.>

## Modelo de domínio
| Tipo | Nome | Descrição |
|---|---|---|
| Aggregate Root | | |
| Entity | | |
| Value Object | | |
| Domain Service / Factory | | |

## Invariantes
- **INV-01:** <regra que o domínio nunca permite violar> → erro `<Ctx>.<CODE>`

## Commands (Write — PostgreSQL)
| Command | Entrada | Regras / Invariantes | Emite | Erros |
|---|---|---|---|---|

## Queries (Read — MongoDB)
| Query | Collection | Filtros | Permissão |
|---|---|---|---|

## Read Models / Projectors
| Projector | Collection | Eventos consumidos | Operações |
|---|---|---|---|

## Eventos consumidos (Subscribers)
| Evento | Handler | Efeito |
|---|---|---|

## Facade pública
| Método | Retorno (DTO) | Usado por |
|---|---|---|

## Endpoints HTTP
| Método | Rota | Command/Query | Policy CASL |
|---|---|---|---|

## Erros de domínio (i18n)
| Code | i18nKey | HTTP |
|---|---|---|

## Perguntas abertas
- 

