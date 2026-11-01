# ADR-0001: Registrar decisões arquiteturais com ADRs

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** José Victor
- **Tasks relacionadas:** T0.01
- **Docs afetados:** [docs/decisions/README.md](./README.md), [AGENTS.md](../../AGENTS.md)

## Contexto

O boilerplate será construído majoritariamente por agentes de IA, em muitas sessões independentes. Sem um registro explícito, cada sessão pode "redecidir" algo já resolvido, ou contradizer uma decisão anterior sem saber. O humano também precisa de um lugar único e legível para entender **por que** o sistema é como é.

## Opções consideradas

### Opção A — Atualizar apenas o blueprint
- ✅ Um único documento.
- ❌ Perde o histórico e a justificativa; fica difícil revisar o que mudou e por quê.

### Opção B — ADRs numerados (formato MADR simplificado) + índice
- ✅ Imutáveis depois de aceitos, rastreáveis no git e fáceis de revisar em PR.
- ✅ A seção "Regras para a IA" vira instrução direta e verificável para os agentes.
- ❌ Exige disciplina para criar um ADR quando uma decisão surge.

## Decisão

**Opção B.** Toda decisão que altera estrutura, tecnologia, contrato público, convenção ou padrão gera um ADR em `docs/decisions/NNNN-slug.md` a partir do [template](./_template.md) e entra no [índice](./README.md).

## Consequências

- **Positivas:** histórico auditável; agentes não reabrem decisões fechadas.
- **Negativas:** custo de escrita (mitigado pela skill `write-adr`).
- **Ações decorrentes:** o Definition of Done de toda task inclui "ADR criado se houve decisão".

## Regras para a IA

1. Um ADR **Aceito** prevalece sobre `docs/architecture/*`. Em caso de conflito, siga o ADR e sinalize a divergência no PR.
2. Nunca edite a seção "Decisão" de um ADR Aceito; crie um novo ADR que o substitua.
3. Não implemente nada que dependa de um ADR **Proposto**: pare e peça a decisão ao humano.
4. Ao precisar tomar uma decisão não coberta por ADR, proponha um ADR (status Proposto) em vez de decidir silenciosamente.

