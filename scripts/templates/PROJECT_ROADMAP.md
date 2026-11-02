# Roadmap — {{APP_NAME}}

Fonte única do **que falta fazer, em que ordem e com qual status** no `{{APP_SLUG}}`. Toda mudança nasce de uma task daqui ([AGENTS.md](../../AGENTS.md), regra 1).

- Tasks com arquivo detalhado → link na coluna ID. Sem link = ainda não detalhada (é detalhada *just-in-time* ao iniciar a fase, via skill [`detail-task`](../../.agents/skills/detail-task/SKILL.md), a partir de [`tasks/_template.md`](./tasks/_template.md)).
- **Bloqueios:** uma task não começa enquanto um ADR listado nela estiver ⏳ Proposto, ou enquanto uma dependência não estiver ✅.
- Status: ☐ A fazer · 📝 Detalhada · 🔄 Em andamento · 👀 Em review · ✅ Concluída · ⛔ Bloqueada

## Como usar este roadmap

1. **Produto primeiro:** descreva o problema e as regras de negócio em `docs/modules/<ctx>/prd.md` e `spec.md` (modelo em [`docs/modules/_template.md`](../modules/_template.md)) antes de criar tasks de código.
2. **Planeje:** adicione as tasks na tabela da fase com status ☐ (IDs `T<fase>.<nn>`, uma task = uma branch = um PR).
3. **Detalhe:** peça ao agente para detalhar a task (skill [`detail-task`](../../.agents/skills/detail-task/SKILL.md)); o arquivo vai para `docs/roadmap/tasks/`.
4. **Execute:** peça ao agente para implementar a task (skill [`execute-roadmap-task`](../../.agents/skills/execute-roadmap-task/SKILL.md)): ler → planejar → aprovar → implementar → verificar → documentar.
5. **Decisão nova?** Registre um ADR (skill [`write-adr`](../../.agents/skills/write-adr/SKILL.md)) antes de implementar.

## Arquitetura herdada do boilerplate

Continua valendo e é documentação viva deste projeto: [decisões (ADRs)](../decisions/README.md), [`docs/architecture/`](../architecture/), [catálogo de eventos](../events/catalog.md), [glossário](../glossary.md) e as specs em `docs/modules/*/`. Mudar uma decisão ✅ Aceita exige um novo ADR que a substitua.

## Customizando os planos comerciais

Os planos vendidos pelo produto ficam no catálogo declarativo `src/modules/billing/domain/catalog/plans.catalog.ts` ([ADR-0018](../decisions/0018-taxonomia-eventos-billing-e-catalogo-planos.md), [spec do `billing`](../modules/billing/spec.md)):

- Ajuste nomes, preços e moeda dos planos (`FREE` para freemium, `FLAT_RATE` para taxa fixa).
- Defina as `quotas` numéricas (`QuotaKey`) e as `features` booleanas (`FeatureKey`) que o produto vai limitar; o TypeScript propaga as chaves para `BillingFacade.checkFeatureQuota` / `hasFeatureFlag`.
- Atualize os preços/IDs correspondentes nos provedores de pagamento (Stripe / Asaas) e rode o seed idempotente do catálogo.
- Registre a mudança como task (T0.02 abaixo) e atualize `docs/modules/billing/spec.md` se as regras mudarem.

---

## F0 — Produto e customização inicial

**Saída da fase:** visão do produto registrada, planos comerciais definidos e ambiente de produção planejado.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T0.01 | Visão do produto, personas e termos próprios no [glossário](../glossary.md) | — | — | ☐ |
| T0.02 | Customizar os planos em `plans.catalog.ts` (nomes, preços, quotas, features) + spec do `billing` | T0.01 | 0018 | ☐ |
| T0.03 | Provedores externos (pagamento, e-mail, storage) e segredos de produção (chaves `Ed25519` próprias por ambiente) | T0.01 | 0005, 0015 | ☐ |

## F1 — Primeira funcionalidade do produto

**Saída da fase:** <resultado observável da primeira entrega>.

| ID | Task | Depende de | ADRs | Status |
|---|---|---|---|---|
| T1.01 | <primeiro módulo / caso de uso do produto> | F0 | — | ☐ |
