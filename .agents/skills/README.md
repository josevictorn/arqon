# Skills do projeto

Procedimentos passo a passo que os agentes carregam sob demanda (só o `name` e a `description` ficam sempre visíveis).

## Disponíveis

| Skill | Use quando |
|---|---|
| [`execute-roadmap-task`](./execute-roadmap-task/SKILL.md) | Implementar uma task `T<F>.<NN>` |
| [`detail-task`](./detail-task/SKILL.md) | Transformar uma linha do ROADMAP numa task completa |
| [`write-adr`](./write-adr/SKILL.md) | Registrar, aceitar ou substituir uma decisão |

## Planejadas (extraídas do módulo `iam` na T6.08)

Elas são o que torna o boilerplate "otimizado para IA" no futuro: cada uma aponta para código de referência real e tem um checklist verificável.

| Skill | Propósito |
|---|---|
| `create-module` | Novo bounded context completo (pastas, módulo Nest, spec, AGENTS.md) |
| `create-command` | Command + invariantes + repositório Prisma + UoW + Outbox + controller + testes |
| `create-query-projector` | Read model + projector idempotente + query + índices + testes |
| `add-integration-event` | Contrato versionado + catálogo + Schema Registry + consumidores |
| `add-external-integration` | Gateway + ACL + provider + factory + resiliência + fake |
| `add-permission-subject` | Novo subject/ação CASL + catálogo de atributos ABAC + testes cross-tenant |
| `evolve-event-version` | Criar `v2` de um evento mantendo `v1` durante a transição |

> [!TIP]
> Regra de manutenção: se um agente errou o mesmo padrão duas vezes, a correção vai para a skill (ou vira regra automática de lint/arquitetura).

