# ADR-0002: Estrutura de documentação e fluxo de trabalho otimizados para IA

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.01
- **Docs afetados:** [AGENTS.md](../../AGENTS.md), [docs/workflow.md](../workflow.md), [docs/README.md](../README.md)

## Contexto

O blueprint original (`ARCHITECTURE.md`, ~800 linhas) é bom para humanos, mas ruim como contexto para agentes: carregar tudo dilui as regras, e carregar parte faz o agente perder restrições. Queremos (1) assertividade na construção, (2) revisão humana prática e (3) que o boilerplate pronto seja fácil de estender com IA.

## Opções consideradas

### Opção A — Um documento único + prompts ad-hoc
- ❌ Contexto grande e genérico; resultado varia de sessão para sessão.

### Opção B — Documentação em camadas + tasks especificadas + skills + enforcement automático
- ✅ Cada task carrega só o contexto necessário (*progressive disclosure*).
- ✅ Revisão em dois pontos baratos: o plano e um PR pequeno.
- ✅ Skills extraídas do módulo de referência ensinam a estender o sistema.
- ❌ Mais arquivos para manter (mitigado pelo DoD, que obriga a atualizá-los).

## Decisão

**Opção B**, com as camadas:

| Camada | Local | Papel |
|---|---|---|
| Regras sempre ativas | `AGENTS.md` (raiz + aninhados por pasta) | Curtas, imperativas, verificáveis |
| Conhecimento de arquitetura | `docs/architecture/*` | Referência por tema, carregada sob demanda |
| Decisões | `docs/decisions/*` | O porquê; prevalece sobre a arquitetura |
| Especificação de negócio | `docs/modules/<ctx>/spec.md`, `docs/events/catalog.md`, `docs/glossary.md` | O quê |
| Trabalho | `docs/roadmap/ROADMAP.md` + `tasks/T*.md` | Unidade de execução e revisão |
| Procedimentos | `.agents/skills/*` | Como executar tarefas recorrentes |
| Enforcement | lint, typecheck, dependency-cruiser, testes, CI | Faz as regras valerem de verdade |

O fluxo por task (spec → plano → aprovação → implementação → checks → PR → ADR/docs) está em [docs/workflow.md](../workflow.md).

Tasks são **detalhadas just-in-time**: o ROADMAP lista todas, mas o arquivo `T*.md` completo só é escrito quando a fase anterior termina, para refletir decisões tomadas no caminho e não nascer desatualizado.

## Consequências

- **Positivas:** contexto enxuto por sessão, revisão rápida, conhecimento reaproveitável.
- **Negativas:** overhead de documentação a cada task.
- **Ações decorrentes:** a T6.08 extrai skills e geradores do módulo `iam`; a T1.08 cria os `AGENTS.md` aninhados.

## Regras para a IA

1. Comece toda task lendo `AGENTS.md`, o arquivo da task e **apenas** os docs linkados nela.
2. Uma task = uma branch = um PR. Não misture escopo.
3. Apresente o plano e aguarde aprovação antes de escrever código.
4. Se uma regra se mostrar errada ou incompleta, atualize o doc ou a skill correspondente no mesmo PR.

