---
name: execute-roadmap-task
description: Executa uma task do roadmap do arqon-boilerplate (ex.: "execute a T1.03", "implemente a task T6.02"). Use sempre que o usuário pedir para implementar, continuar ou retomar uma task T<fase>.<nn>. Garante o fluxo ler → planejar → aprovar → implementar → verificar → documentar.
---

# Executar uma task do roadmap

## 1. Carregar contexto (mínimo)
1. Leia `AGENTS.md` (raiz).
2. Abra `docs/roadmap/ROADMAP.md`, localize a task e abra o arquivo `docs/roadmap/tasks/T<id>-*.md`.
   - Se a task **não tiver arquivo detalhado**, pare e use a skill `detail-task` primeiro.
3. Leia **somente** os docs da seção "Contexto para ler" da task, mais os `AGENTS.md` aninhados das pastas que vai tocar.

## 2. Checar bloqueios (pare se algum falhar)
- [ ] Todas as dependências da task estão ✅ no ROADMAP?
- [ ] Todos os ADRs listados estão ✅ Aceitos? Se algum estiver ⏳ Proposto, **pare** e peça a decisão citando o ADR e a sua recomendação.
- [ ] O escopo está claro? Se houver ambiguidade relevante, pergunte antes de planejar.

## 3. Propor plano e AGUARDAR aprovação
Responda com este formato e **não escreva código ainda**:

```markdown
## Plano — T<id> <título>
**Arquivos:** (criar/alterar, com caminho)
**Abordagem:** (passos, em 3–8 bullets)
**Testes:** (quais, em que nível, mapeados aos critérios de aceite)
**Decisões necessárias:** (nenhuma | proposta de ADR-XXXX)
**Riscos / dúvidas:**
**Fora de escopo que notei:** (vira follow-up)
```

## 4. Implementar
- Crie a branch `task/T<id>-<slug>`.
- Implemente em passos pequenos; rode testes a cada passo.
- Siga exemplos de referência existentes no código antes de inventar um padrão novo.
- Precisou decidir algo não previsto? Pare, proponha um ADR (skill `write-adr`) e aguarde.
- Não amplie o escopo. Anote ideias como follow-up.

## 5. Verificar
- Rode `pnpm verify` (e `test:int` / `test:e2e` se tocou infra ou endpoints) até ficar verde.
- Rode cada comando da seção "Verificação" da task.
- Marque os critérios de aceite no arquivo da task (`- [x]`).

## 6. Documentar (Definition of Done)
- [ ] ADR criado/atualizado e índice `docs/decisions/README.md` atualizado (se houve decisão)
- [ ] Spec do módulo, `docs/events/catalog.md`, `docs/glossary.md` e chaves i18n atualizados (se mudaram)
- [ ] `AGENTS.md` / skills atualizados se um padrão novo surgiu ou uma armadilha foi descoberta
- [ ] ROADMAP: status 👀 Em review (ou ✅ após o merge)
- [ ] **Não execute `git commit`:** apenas sugira a mensagem de commit (Conventional Commits) e o corpo do PR na entrega final para o humano commitar após revisar.

## 7. Entregar
Resuma para o humano: o que foi feito, como verificar, decisões tomadas, follow-ups. Seja breve.

