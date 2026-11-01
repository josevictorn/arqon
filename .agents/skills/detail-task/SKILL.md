---
name: detail-task
description: Transforma uma linha do ROADMAP do arqon-boilerplate em um arquivo de task completo (docs/roadmap/tasks/T*.md), com escopo, fora de escopo, critérios de aceite verificáveis e contexto mínimo. Use quando o usuário pedir para "detalhar as tasks da Fase N", "detalhar a T3.05", ou quando uma task a executar ainda não tiver arquivo.
---

# Detalhar tasks

## Entradas
1. `docs/roadmap/ROADMAP.md`: a linha da task (título, dependências, ADRs).
2. ADRs **Aceitos** relacionados e decisões tomadas nas fases anteriores (leia o índice de ADRs).
3. A seção relevante de `docs/architecture/*` e/ou `docs/modules/<ctx>/spec.md`.
4. Código já existente que sirva de referência (a partir da F6, o módulo `iam`).

## Regras para uma boa task
- **Tamanho:** cabe num PR de até ~400 linhas. Se não couber, quebre em `T<F>.<NN>a/b` e atualize o ROADMAP.
- **Objetivo:** resultado observável, não atividade ("`POST /auth/register` cria usuário e publica evento", e não "implementar registro").
- **Contexto para ler:** liste só o necessário (normalmente 2–5 links). Inclua sempre o `AGENTS.md`.
- **Fora de escopo:** explícito. É o principal antídoto contra o agente "fazer demais".
- **Critérios de aceite:** verificáveis por comando ou teste. Evite "código limpo" e "bem testado"; prefira "teste X prova que Y".
- **Para Commands:** cite as invariantes da spec (INV-xx) e os erros esperados.
- **Para eventos:** cite o tópico do catálogo e exija teste de idempotência.
- **Decisões pendentes:** se a task depende de algo não decidido, adicione o ADR ou a pergunta em "ADRs" e marque a task como ⛔ no ROADMAP.

## Passos
1. Copie `docs/roadmap/tasks/_template.md` para `docs/roadmap/tasks/T<F>.<NN>-<slug>.md`.
2. Preencha seguindo as regras acima.
3. No ROADMAP, transforme o ID em link e mude o status para 📝.
4. Se detalhar revelou lacunas na spec ou no catálogo, atualize-os ou registre em "Perguntas abertas".
5. Apresente ao humano um resumo (1 linha por task + pontos que precisam de decisão) para revisão.

