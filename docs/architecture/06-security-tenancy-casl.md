> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 7. Segurança, Multi-Tenancy, Autenticação e Autorização (CASL)

## 7.1. Autenticação e Criptografia
- **Hashing de Senha**: **Argon2id** (configurado com custo de memória e paralelismo adequados).
- **JWT**:
  - `accessToken`: Curta duração (15 min), assinado com chave assimétrica, contendo `{ sub: userId, activeTenantId?: string }`.
  - `refreshToken`: Longa duração (7 dias), armazenado com hash no Redis vinculado à sessão/dispositivo, utilizando **Refresh Token Rotation** (invalidar toda a família de tokens em caso de reuso suspeito).

## 7.2. Multi-Tenancy, Cargos Customizados pelo Usuário & ABAC Dinâmico (CASL)
Em vez de `roles` engessadas no código (`enum`), o boilerplate implementa um motor de **Cargos Dinâmicos + ABAC (Attribute-Based Access Control)** por Organização (estilo AWS IAM / GitHub Enterprise).

O usuário **nunca envia JSON ou operadores de banco crus** pela API. O fluxo seguro de ponta a ponta funciona em **5 etapas (`Zod Input → PermissionRule VO → JSONB → Redis Hydration → CASL Check em 2 Níveis`)**:

### 1. Cargo Padrão Imutável (`Owner` — `isSystemOwner: true`)
- Na criação de qualquer `Organization`, a `RoleDomainFactory` cria automaticamente o cargo de sistema **`Owner`** com permissão total (`{ action: 'manage', subject: 'all' }`) e a flag `isSystemOwner: true`, atribuindo-o ao criador.
- **Invariantes Inegociáveis no Domínio (`domain/`)**:
  - Um cargo marcado com `isSystemOwner: true` **jamais pode ser deletado ou ter suas permissões reduzidas**.
  - Uma organização **jamais pode ficar com zero membros** vinculados ao cargo `Owner`.

### 2. Entrada Tipada do Usuário (`Zod DTO`)
Na UI de criação de cargos (`POST /organizations/:orgId/roles`), o usuário seleciona recursos, ações e restrições de atributos a partir de um catálogo seguro validado com **Zod**:

```typescript
// src/modules/tenancy/presentation/http/dtos/create-custom-role.dto.ts
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

const permissionInputSchema = z.object({
  subject: z.enum(['Organization', 'Member', 'Invite', 'Role', 'Subscription', 'Invoice', 'AuditLog']),
  actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'manage'])).min(1),
  // Atributos ABAC seguros que o usuário pode configurar na UI:
  attributes: z
    .object({
      onlyOwnResource: z.boolean().optional(), // Ex: "Apenas criados por mim"
      maxAmountCents: z.number().int().positive().optional(), // Ex: "Faturas até R$ X"
      allowedStatuses: z.array(z.string()).optional(), // Ex: "Apenas status DRAFT"
    })
    .optional(),
})

export const createCustomRoleSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(permissionInputSchema).min(1),
})

export class CreateCustomRoleDto extends createZodDto(createCustomRoleSchema) {}
```

### 3. Compilador de Regras no Domínio (`PermissionRule` Value Object)
O Value Object `PermissionRule` traduz os atributos amigáveis escolhidos pelo usuário para a estrutura de condições (`$lte`, `$in`, `{{userId}}`) suportada nativamente pelo **CASL**, persistindo na coluna `permissions` (`JSONB`) da tabela `roles` no PostgreSQL:

```typescript
// src/modules/tenancy/domain/value-objects/permission-rule.vo.ts
export class PermissionRule extends ValueObject<CaslRawRule> {
  static createFromUserInput(input: PermissionInput): PermissionRule {
    const conditions: Record<string, unknown> = {}

    if (input.attributes?.onlyOwnResource) {
      conditions.createdById = '{{userId}}' // Placeholder resolvido em tempo de execução
    }
    if (input.attributes?.maxAmountCents !== undefined) {
      conditions.amountCents = { $lte: input.attributes.maxAmountCents }
    }
    if (input.attributes?.allowedStatuses?.length) {
      conditions.status = { $in: input.attributes.allowedStatuses }
    }

    return new PermissionRule({
      action: input.actions,
      subject: input.subject,
      conditions: Object.keys(conditions).length > 0 ? conditions : undefined,
    })
  }
}
```

Exemplo do JSON compilado salvo no banco para um cargo customizado `"Financeiro Júnior"`:
```json
[
  {
    "action": ["create", "read"],
    "subject": "Invite"
  },
  {
    "action": ["delete"],
    "subject": "Invite",
    "conditions": { "createdById": "{{userId}}" }
  },
  {
    "action": ["update"],
    "subject": "Invoice",
    "conditions": { "amountCents": { "$lte": 500000 } }
  }
]
```

### 4. Hidratação em Runtime pelo `TenantAbilityFactory` (< 1ms via Redis)
- Como um membro pode possuir **1 ou múltiplos cargos**, o sistema faz a união (`flatMap`) das regras de todos os cargos daquele membro e armazena no **Redis** (`permissions:org:${orgId}:user:${userId}`).
- O `TenantAbilityFactory` interpola os placeholders dinâmicos (`{{userId}}`), força o escopo `{ organizationId }` em todas as regras (impedindo vazamento Cross-Tenant) e instancia o `MongoAbility` do CASL sem nenhum `if/else` fixo no código:

```typescript
// src/shared/infra/auth/casl/tenant-ability.factory.ts
import { createMongoAbility, RawRuleOf } from '@casl/ability'

@Injectable()
export class TenantAbilityFactory {
  createForMember(context: {
    userId: string
    organizationId: string
    rawRules: RawPermissionRule[] // União das regras dos cargos (Roles) do membro via Redis/Postgres
  }): AppAbility {
    const hydratedRules: RawRuleOf<AppAbility>[] = context.rawRules.map((rule) => ({
      action: rule.action,
      subject: rule.subject,
      inverted: rule.inverted ?? false,
      fields: rule.fields,
      conditions: {
        ...this.interpolateVariables(rule.conditions, context),
        organizationId: context.organizationId, // Isolamento obrigatório de Tenant
      },
    }))

    return createMongoAbility<AppAbility>(hydratedRules)
  }
}
```
- Sempre que um cargo é editado ou atribuído a um membro (`tenancy.role.updated.v1` / `tenancy.member.roles_updated.v1`), o cache de permissões no Redis é invalidado instantaneamente.

### 5. Verificação CASL em 2 Níveis (Guard de Rota vs. Atributo na Entidade Real)
1. **Nível 1 — Na Porta HTTP (`PoliciesGuard`)**:
   - Verifica em `~0.5ms` se o usuário possui ao menos permissão geral para tentar a ação (ex: `@CheckPolicies((ability) => ability.can('delete', 'Invite'))`). Se o cargo não puder deletar nenhum convite, já barra com `403 Forbidden` sem consultar o PostgreSQL.
2. **Nível 2 — Dentro do Command (`UseCase`) sobre os Atributos da Entidade**:
   - Após carregar a entidade do PostgreSQL, o Command passa a instância real para o helper `subject()` do CASL, que avalia automaticamente todas as condições ABAC (`createdById`, `amountCents <= 500000`, `organizationId`):

```typescript
// src/modules/tenancy/application/use-cases/commands/cancel-invite.command.ts
import { subject } from '@casl/ability'

export class CancelInviteCommand {
  async execute({ inviteId, ability }: CancelInviteInput): Promise<Either<DomainError, void>> {
    const invite = await this.invitesRepository.findById(inviteId)
    if (!invite) {
      return left(new ResourceNotFoundError('Invite', inviteId))
    }

    // Avalia RBAC + condições ABAC diretamente sobre os atributos da instância real!
    if (ability.cannot('delete', subject('Invite', invite))) {
      return left(new NotAllowedError())
    }

    invite.cancel()
    await this.invitesRepository.save(invite)
    return right(undefined)
  }
}
```

