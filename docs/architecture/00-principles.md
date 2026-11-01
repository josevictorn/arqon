> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 1. Visão Geral e Princípios Inegociáveis

1. **Modularidade por Bounded Context (Vertical Slices)**: O código não é dividido na raiz por camadas técnicas genéricas (`controllers/`, `services/`, `repositories/`), mas sim por **Módulos de Negócio independentes** (`src/modules/<contexto>`).
2. **Domínio 100% Puro (`domain/`)**: A camada de domínio não conhece banco de dados, HTTP, Kafka, Redis ou bibliotecas externas.
3. **Separação Clara entre `domain` e `application`**:
   - **`domain/`**: O que o negócio **É** (Entidades, Agregados, Value Objects, Domain Services, Domain Factories, Eventos de Domínio e Regras Invariantes).
   - **`application/`**: O que o sistema **FAZ** (Use Cases divididos em Commands e Queries, Projectors, Contratos de Repositórios/Gateways, Subscribers e Facades).
4. **CQRS Poliglota Real (PostgreSQL no Write Side + MongoDB no Read Side)**:
   - **Commands (Escrita)**: Executam regras invariantes no `domain/`, persistem em tabelas normalizadas (3NF) no **PostgreSQL (via Prisma)** com transações ACID (`UnitOfWork`) e registram eventos na tabela `Outbox`.
   - **Projectors (Sincronização)**: Consomem os eventos publicados no **Apache Kafka** e atualizam documentos desnormalizados (**Read Models / Views**) no **MongoDB** usando operadores atômicos (`$set`, `$inc`, `$push`).
   - **Queries (Leitura)**: Consultam exclusivamente o **MongoDB** (e **Redis** quando aplicável), retornando o JSON pronto em `O(1)` sem `JOIN`s e **retirando 100% da carga de leitura do PostgreSQL**.
5. **Encapsulamento Estrito entre Módulos**: Um módulo **jamais** importa o `Repository`, `UseCase` ou `Entity` de outro módulo. A comunicação entre módulos ocorre exclusivamente via:
   - **Facades** (Comunicação síncrona/consulta pontual, usando contratos em `src/shared/contracts`).
   - **Integration Events via Outbox + Kafka** (Comunicação assíncrona/reativa e atualização de Read Models cross-module no MongoDB).
6. **Proteção contra Terceiros (Gateway + ACL + Resiliência)**: Toda integração externa vive em `src/integrations/`, protegida por uma **Anti-Corruption Layer (ACL)**, **Circuit Breaker**, **Retry com Exponential Backoff + Jitter** e **Timeout**.
7. **Erros como Valores (`Either` Pattern)**: Casos de uso nunca lançam exceções (`throw`) para erros de negócio esperados. Eles retornam `Either<DomainError, Result>`, e um filtro global na camada HTTP converte erros de domínio em respostas HTTP internacionalizadas (`pt-BR` / `en`).

