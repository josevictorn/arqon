# ADR-0023: Definir `schemaVersion` como revisão compatível dentro do tópico `.vN`

- **Status:** Aceito
- **Data:** 2026-11-03
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.05, T4.02, T4.03, T4.05, T11.01
- **Docs afetados:** [ADR-0019](./0019-envelope-integration-event.md) (complementado), [ADR-0020](./0020-schema-registry-json-schema.md), [docs/events/catalog.md](../events/catalog.md), [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md), [T2.05](../roadmap/tasks/T2.05-integration-event-envelope-contract.md)

## Contexto

O envelope do [ADR-0019](./0019-envelope-integration-event.md) carrega duas versões:

- o sufixo `.v<N>` do `eventName` (`<ctx>.<aggregate>.<action>.v<N>`), que também é o nome do tópico Kafka;
- o campo `schemaVersion: number` (inteiro `>= 1`).

O ADR-0019 não diz como os dois se relacionam. O [ADR-0020](./0020-schema-registry-json-schema.md) separa dois tipos de mudança: compatível `BACKWARD` (ex.: adicionar campo opcional), que fica no mesmo tópico, e quebra de compatibilidade, que exige um novo tópico `.v<N+1>` publicado em paralelo. O exemplo do ADR-0020 passa os dois números separadamente (`defineIntegrationEventContract({ eventName, schemaVersion, payloadSchema })`), mas não define o significado de `schemaVersion`.

A T2.05 (`defineIntegrationEventContract`) precisa dessa definição para saber o que validar.

## Opções consideradas

### Opção A — `schemaVersion` sempre igual ao `N` do `.vN`
- ✅ Sem ambiguidade: o helper pode exigir `schemaVersion === N` (ou derivá-lo), e o `envelopeSchema` usa `z.literal(N)`.
- ✅ Nenhum contador manual para esquecer.
- ❌ Campo redundante com o `eventName` e com o header Kafka `event-name`.
- ❌ O consumidor não distingue revisões compatíveis. Diante de uma mensagem sem um campo opcional, não sabe se o produtor era anterior ao campo ou se o valor estava ausente.

### Opção B — `schemaVersion` é a revisão compatível dentro do tópico
- ✅ Cada número tem um papel: `.vN` indica a compatibilidade (major); `schemaVersion` indica a forma exata do payload (revisão).
- ✅ Útil para depurar a DLQ, fazer replay de views (T11.01) e auditar (F10): projectors podem ramificar por revisão.
- ✅ Coerente com o ADR-0020, que já trata os dois números como entradas separadas.
- ❌ O contador é manual: quem adiciona um campo compatível precisa subir o número.
- ❌ O `envelopeSchema` não pode fixar um literal: precisa aceitar qualquer inteiro `>= 1`, para que um consumidor atualizado leia mensagens de revisões anteriores.

### Opção C — Usar a versão atribuída pelo Schema Registry
- ❌ O envelope é gravado no Outbox antes do contato com o Registry (T3.05 × T4.02).
- ❌ A numeração do Registry depende da ordem de registro em cada ambiente.
- ❌ Redundante com o *schema id* que o *framing* Confluent já coloca em cada mensagem.

## Decisão

Adotamos a **Opção B**. Ela dá informação útil para DLQ, replay e auditoria e segue a leitura natural do ADR-0020. O risco do contador manual é mitigado por um teste de snapshot na T4.02.

1. **`.v<N>` (sufixo do `eventName` / tópico)** é a versão **major**. Só muda quando a alteração do contrato não é `BACKWARD` compatível (regra 3 do ADR-0020).
2. **`schemaVersion`** é a **revisão compatível** dentro de um mesmo `.v<N>`:
   - começa em `1` na criação do contrato;
   - sobe `+1` a cada alteração compatível do `payloadSchema` (ex.: novo campo opcional);
   - **recomeça em `1`** quando nasce um novo tópico `.v<N+1>`. O contrato `.v<N>` antigo mantém sua última revisão enquanto for publicado em paralelo.
3. **`schemaVersion` é definido no código do contrato** e não tem relação com a versão nem com o *schema id* do Schema Registry.
4. **Validação:**
   - o `defineIntegrationEventContract` exige `schemaVersion` inteiro `>= 1` e **não** exige igualdade com `N`;
   - o produtor sempre grava o `schemaVersion` declarado no contrato;
   - o `envelopeSchema` de leitura aceita qualquer inteiro `>= 1` (nunca `z.literal`), para que consumidores atualizados leiam revisões anteriores.

Exemplo (`billing.invoice.paid`):

| Mudança | `eventName` | `schemaVersion` |
|---|---|---|
| Contrato inicial | `billing.invoice.paid.v1` | 1 |
| + `couponCode` opcional | `billing.invoice.paid.v1` | 2 |
| + `discountCents` opcional | `billing.invoice.paid.v1` | 3 |
| Renomeia `amountCents` (quebra) | `billing.invoice.paid.v2` | 1 (e `v1` segue em `3` durante a transição) |

## Consequências

- **Positivas:**
  - O header Kafka `schema-version` (ADR-0019) passa a carregar informação própria, não redundante com `event-name`.
  - Projectors e o replay de views podem tratar revisões antigas explicitamente (`if (event.schemaVersion < 2)`).
- **Negativas / trade-offs aceitos:**
  - Quem altera um contrato precisa lembrar de subir o `schemaVersion`. Até a T4.02, isso depende de revisão de PR.
  - A validação de leitura de `schemaVersion` é mais frouxa (inteiro `>= 1`, não um literal).
- **Ações decorrentes:**
  - **T2.05:** o helper e o `envelopeSchema` seguem as regras do item 4 da Decisão.
  - **T4.02:** teste de snapshot versionado no repositório com o JSON Schema gerado de cada contrato, indexado por `(eventName, schemaVersion)`. Se o JSON Schema de um contrato mudar sem que o `schemaVersion` suba (ou sem novo `.vN`), o teste falha.
  - O ADR-0019 recebe, no status, a indicação de que é complementado por este ADR.

## Regras para a IA

1. Ao adicionar um campo opcional (ou outra mudança `BACKWARD` compatível) a um contrato de Integration Event, incremente `schemaVersion` em `+1` no mesmo PR.
2. Ao criar um tópico `.v<N+1>` por quebra de compatibilidade, comece o novo contrato com `schemaVersion: 1` e não altere o contrato `.v<N>` antigo.
3. Nunca valide `schemaVersion` com `z.literal(...)` em schemas de leitura; use `z.number().int().min(1)`.
4. Nunca preencha `schemaVersion` com a versão ou o *schema id* do Schema Registry.
