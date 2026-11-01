## Task

<!-- Ex.: T1.03 — Vitest setup -->
Closes: [T?.??](../docs/roadmap/tasks/)

## O que foi feito
-

## Como verificar
```bash
pnpm verify
```

## Decisões
<!-- ADRs criados/atualizados, ou "Nenhuma". -->

## Follow-ups (fora do escopo)
-

---

## Checklist do autor (agente)
- [ ] Critérios de aceite da task marcados
- [ ] `pnpm verify` verde (+ `test:int` / `test:e2e` se aplicável)
- [ ] Docs, spec, catálogo de eventos, glossário e i18n atualizados (se mudaram)
- [ ] ROADMAP atualizado

## Checklist do revisor (humano)
- [ ] **Escopo:** só o que a task pede, nada além
- [ ] **Camadas:** `domain/` puro; `application/` sem infra; nenhum import entre módulos
- [ ] **Erros:** `Either` + `DomainError` com `code` e `i18nKey` (em `en` e `pt-BR`)
- [ ] **CQRS:** command → Postgres + Outbox; query → Mongo; projector idempotente
- [ ] **Segurança:** escopo de tenant aplicado; CASL nos 2 níveis quando aplicável; sem segredo em log
- [ ] **Testes:** provam os critérios de aceite (e não só "passam")
- [ ] **Nomes:** batem com o glossário e as convenções de arquivo
- [ ] **Decisões implícitas** no código que deveriam virar ADR

