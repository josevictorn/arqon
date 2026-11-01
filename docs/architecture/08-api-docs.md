> Extraído do blueprint original. Decisões que alteram este conteúdo vivem em [docs/decisions](../decisions/README.md) — **um ADR aceito prevalece sobre este texto**.

# 9. Documentação com Scalar API + `nestjs-zod`

Para máxima DX, eliminamos a duplicação entre schemas de validação e decorators de Swagger:

```typescript
// src/modules/tenancy/presentation/http/dtos/create-organization.dto.ts
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const createOrganizationSchema = z.object({
  name: z.string().min(3).max(80).describe('Nome de exibição da organização'),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional().describe('Identificador único na URL'),
})

export class CreateOrganizationDto extends createZodDto(createOrganizationSchema) {}
```

No `main.ts`, o documento OpenAPI gerado pelo `nestjs-zod` é servido pelo **Scalar API Reference** em `/docs`, com tema moderno, suporte a Bearer Auth e geração de clientes HTTP em múltiplas linguagens.

