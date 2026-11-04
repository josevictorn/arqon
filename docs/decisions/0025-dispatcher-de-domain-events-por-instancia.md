# ADR-0025: Guardar Domain Events no agregado e despachá-los por um `DomainEventDispatcher` de instância

- **Status:** Aceito
- **Data:** 2026-11-03
- **Decisores:** José Victor
- **Tasks relacionadas:** T2.03, T3.05
- **Docs afetados:** [ADR-0009](./0009-domain-events-e-unit-of-work.md) (complementado), [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md), [02-directory-structure.md](../architecture/02-directory-structure.md), [src/shared/core/AGENTS.md](../../src/shared/core/AGENTS.md), [T2.03](../roadmap/tasks/T2.03-aggregate-root-domain-events.md)

## Contexto

O blueprint ([04-cqrs-and-events.md §5.6](../architecture/04-cqrs-and-events.md)) e o [ADR-0009](./0009-domain-events-e-unit-of-work.md) citam `DomainEvents.dispatchEventsForAggregate`, o padrão popularizado por Khalil Stemmler e pelos cursos da Rocketseat. Nele, uma classe **estática** guarda ao mesmo tempo:

- **os handlers** (quem escuta qual evento): configuração fixa depois do boot;
- **os agregados marcados** (`markedAggregates`, os que têm eventos pendentes): estado de cada requisição.

`AggregateRoot.addDomainEvent` se registra nessa lista global, e o repositório chama `dispatchEventsForAggregate(id)` depois do `save`.

A API roda num único processo Node, que atende muitas requisições ao mesmo tempo, e uma variável `static` é compartilhada por todas elas. Daí vêm três problemas:

1. **Eventos de uma operação abortada vazam para outra requisição.** Se um use case anota um evento e depois retorna `Left` (ou lança) sem despachar, o agregado fica preso em `markedAggregates`. Quando outra requisição altera o mesmo agregado (mesmo id, outra instância) e chama `dispatchEventsForAggregate(id)`, a busca devolve primeiro a instância antiga, e os handlers recebem eventos de uma operação que nunca foi persistida. É corrupção de dados que só aparece sob concorrência real, além de vazamento de memória.
2. **Não cumpre o ADR-0009 (B1).** A versão clássica chama os handlers sem `await`. A falha de um handler não chega ao `UnitOfWork` e não desfaz a transação. Além disso, o UoW já rastreia os agregados (`uow.track`), então haveria dois registros de "agregados pendentes" que podem divergir.
3. **Testes contaminados.** Cada `Test.createTestingModule` registra os handlers de novo no mesmo registro global, e o handler passa a rodar N vezes, a menos que todo teste lembre de chamar `clearHandlers()`. Também é um efeito colateral escondido no domínio: `addDomainEvent` altera estado global sem import proibido, então o `arch:check` não detecta.

## Opções consideradas

### Opção A — `DomainEvents` estático (blueprint)
- ✅ Padrão conhecido em tutoriais; registro em uma linha, sem DI.
- ❌ Os problemas 1, 2 e 3 do Contexto.

### Opção B — Eventos pendentes no agregado + `DomainEventDispatcher` de instância
- ✅ O estado de cada requisição fica no próprio agregado, que é descartado com a requisição: uma operação abortada não deixa resíduo.
- ✅ O dispatcher guarda só os handlers, fixos depois do boot, então compartilhá-lo como singleton é seguro.
- ✅ `await` sequencial: a falha de um handler propaga ao `UnitOfWork` e provoca rollback (ADR-0009, B1).
- ✅ Testes isolados: cada teste cria seu dispatcher.
- ❌ Um pouco mais de ligação: o subscriber recebe o dispatcher por injeção e registra no `onModuleInit`.
- ❌ Diverge dos tutoriais; agentes podem tentar "voltar" ao estático (mitigado pelas regras abaixo).

## Decisão

Adotamos a **Opção B**:

1. **`AggregateRoot`** guarda os eventos numa lista privada da própria instância. `addDomainEvent` só faz `push` e **não toca em nenhum estado global**. Expõe `domainEvents` (somente leitura), `pullDomainEvents()` (devolve e limpa) e `clearEvents()`.
2. **`DomainEventDispatcher`** (`src/shared/core/events/domain-event-dispatcher.ts`) é uma classe de **instância**, sem membros `static` de estado:
   - `register(eventName, handler)`, tipado pelo nome do evento;
   - `dispatch(events)`, que executa os handlers **sequencialmente com `await`**, na ordem dos eventos e de registro, e propaga a primeira falha;
   - `dispatchFor(aggregate)`, que faz `pullDomainEvents()` e despacha.
3. **Quem despacha é o `UnitOfWork`** (T3.05), para cada agregado rastreado via `uow.track`, dentro da transação e antes do outbox e do commit (ADR-0009). Repositórios **não** despacham eventos.
4. **Ligação no Nest (T3.05):** um único provider singleton de `DomainEventDispatcher` em `src/shared/infra`. Os subscribers intra-módulo o recebem pelo construtor e registram seus handlers no `onModuleInit`.

## Consequências

- **Positivas:**
  - Nenhum estado de requisição é compartilhado entre requisições: eventos de operações abortadas são descartados com o agregado.
  - A atomicidade "efeito + reações intra-módulo" do ADR-0009 vale de fato.
  - Testes de domínio e de use case não precisam de limpeza global.
- **Negativas / trade-offs aceitos:**
  - Mais ligação de DI nos subscribers do que no padrão estático.
  - Divergência consciente do texto do blueprint e de tutoriais populares.
- **Ações decorrentes:**
  - **T2.03:** implementar os itens 1 e 2 da Decisão.
  - **T3.05:** implementar os itens 3 e 4, incluindo o laço que despacha de novo os eventos gerados por handlers (um handler pode alterar outro agregado rastreado).
  - **T3.05 (ponto a decidir):** a regra 2 do ADR-0009 só obriga `uow.execute` para Commands com mais de um agregado ou com Integration Events. Um Command com **um só agregado** que emita Domain Event com handler também precisa de quem despache. A T3.05 deve definir se todo Command que altera agregado passa pelo UoW ou se há outro caminho.
  - [04-cqrs-and-events.md](../architecture/04-cqrs-and-events.md) e [02-directory-structure.md](../architecture/02-directory-structure.md) atualizados para não citarem mais o `DomainEvents` estático.

## Regras para a IA

1. Nunca crie registro **estático** de handlers ou de agregados marcados (`DomainEvents.markAggregateForDispatch`, `dispatchEventsForAggregate`, `static handlers`); use o `DomainEventDispatcher` injetado.
2. `AggregateRoot.addDomainEvent` só adiciona o evento à lista da instância; nenhum código de domínio chama o dispatcher.
3. Só o `UnitOfWork` chama `dispatcher.dispatchFor(...)`; repositórios e use cases não despacham Domain Events.
4. Handlers são `async` e executados com `await`; nunca dispare um handler sem aguardar (*fire-and-forget*).
5. Subscribers registram handlers no `onModuleInit`, nunca no construtor, e em testes cada caso cria seu próprio `DomainEventDispatcher`.
