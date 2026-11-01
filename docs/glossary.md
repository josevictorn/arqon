# Glossário (Linguagem Ubíqua)

Termos do domínio e da arquitetura. Use **exatamente** estes nomes no código (em inglês) e nos docs. Novo termo → adicione aqui no mesmo PR.

## Domínio de negócio

| Termo (código) | PT-BR | Definição | Módulo |
|---|---|---|---|
| `User` | Usuário | Pessoa com credenciais na plataforma; existe independentemente de organizações | iam |
| `Session` | Sessão | Login ativo de um usuário num dispositivo, com refresh token rotativo | iam |
| `Organization` | Organização / Tenant | Unidade de isolamento de dados e cobrança; dona de membros, cargos e assinatura | tenancy |
| `Tenant` | Tenant | Sinônimo técnico de `Organization` no contexto de isolamento (`tenantId` = `organizationId`) | — |
| `Membership` | Vínculo / Membro | Relação `User` ↔ `Organization` com 1+ cargos | tenancy |
| `Role` | Cargo | Conjunto nomeado de `PermissionRule`s, definido por organização | tenancy |
| `Owner` (`isSystemOwner`) | Proprietário | Cargo de sistema imutável com `manage all`; toda organização tem ≥ 1 membro com ele | tenancy |
| `PermissionRule` | Regra de permissão | VO que compila ação + recurso + atributos amigáveis em regra CASL | tenancy |
| `Invite` | Convite | Convite pendente para um e-mail entrar numa organização com cargos pré-definidos | tenancy |
| `Slug` | Slug | Identificador único e legível da organização na URL | tenancy |
| `Plan` | Plano | Oferta comercial com preço e quotas (`max_members`, `max_storage_mb`) | billing |
| `Subscription` | Assinatura | Vínculo da organização a um plano, com status e período | billing |
| `Invoice` | Fatura | Cobrança de um período de uma assinatura | billing |
| `Money` | Dinheiro | VO com valor em centavos (inteiro) + moeda ISO 4217 | billing |
| `Quota` / `featureKey` | Quota | Limite de uso de um recurso definido pelo plano | billing |
| `Proration` | Pró-rata | Ajuste de valor ao trocar de plano no meio do período | billing |
| `Notification` | Notificação | Mensagem in-app para um usuário | notifications |
| `NotificationPreference` | Preferência | Canais que o usuário aceita por tipo de notificação | notifications |
| `AuditLog` | Log de auditoria | Registro imutável de uma ação relevante (ator, ação, alvo, metadados) | audit |

## Arquitetura

| Termo | Definição |
|---|---|
| **Bounded Context / Módulo** | Fatia vertical em `src/modules/<ctx>` com domínio próprio |
| **Aggregate Root** | Entidade raiz que garante invariantes e emite domain events |
| **Value Object (VO)** | Objeto imutável definido por valor, que se valida na criação |
| **WatchedList** | Coleção que rastreia itens adicionados/removidos para persistência incremental |
| **Command** | Use case de escrita (Postgres + Outbox); retorna `Either` |
| **Query** | Use case de leitura (MongoDB/Redis); nunca instancia entidades |
| **Read Model / View** | Documento desnormalizado no MongoDB no formato pronto para a UI |
| **Projector** | Consumer que atualiza Read Models a partir de Integration Events, de forma idempotente |
| **Subscriber** | Handler de evento que executa regra de negócio (não é projeção) |
| **Domain Event** | Evento intra-módulo, em memória, dentro da transação |
| **Integration Event** | Evento versionado entre módulos, via Outbox → Kafka |
| **Outbox** | Tabela no Postgres gravada na mesma transação da mudança; garante a publicação |
| **Relay** | Worker que lê o Outbox e publica no Kafka |
| **DLQ** | Dead Letter Queue: tópico `<topic>.dlq` para mensagens que falharam após N retries |
| **Facade** | Contrato síncrono entre módulos em `shared/contracts/facades`; só retorna DTOs primitivos |
| **Gateway** | Porta (abstract class) para um serviço técnico ou externo |
| **ACL (Anti-Corruption Layer)** | Mapper que traduz o modelo de terceiros para o nosso contrato |
| **UnitOfWork (UoW)** | Abstração de transação atômica (entidades + outbox + domain events) |
| **Either** | `Left<Error>` / `Right<Value>`: erro como valor |

