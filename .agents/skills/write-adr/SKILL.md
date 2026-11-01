---
name: write-adr
description: Cria ou atualiza um Architecture Decision Record (ADR) do arqon-boilerplate. Use quando surgir uma decisão de tecnologia, estrutura, convenção, contrato público ou padrão; quando o usuário decidir algo em conversa ("vamos usar X"); ou quando for preciso aceitar, rejeitar ou substituir um ADR existente.
---

# Escrever um ADR

## Quando criar
Crie um ADR quando a decisão:
- escolhe ou troca uma biblioteca, ferramenta ou versão major;
- muda a estrutura de pastas, as camadas ou as regras de dependência;
- define um contrato público (envelope de evento, formato de erro, API pública, facade);
- cria uma convenção que outras tasks vão seguir;
- abre uma exceção a uma regra do `AGENTS.md` ou do dependency-cruiser.

**Não** crie para detalhes locais e reversíveis de implementação.

## Como criar
1. Veja o maior número em `docs/decisions/` e use o próximo (`NNNN`, com 4 dígitos).
2. Copie `docs/decisions/_template.md` para `docs/decisions/NNNN-slug-em-portugues.md`.
3. Preencha:
   - **Contexto:** o problema, com links para o trecho do blueprint/spec envolvido.
   - **Opções:** pelo menos 2, com prós e contras honestos.
   - **Decisão:** se o humano ainda não decidiu → status `Proposto — ⏳ aguardando decisão` e escreva "**Recomendação:** ...". Nunca marque como Aceito sem confirmação explícita do humano.
   - **Regras para a IA:** 1–5 regras objetivas e verificáveis.
4. Adicione a linha no índice `docs/decisions/README.md` (incluindo a coluna "Bloqueia").
5. Se a pergunta estava na seção "Perguntas abertas" do índice, remova-a de lá.

## Quando o humano decidir
- Mude o status para `Aceito` (ou `Rejeitado`) e preencha "Decisão" com a escolha e a justificativa dele.
- **No mesmo PR:** atualize o `docs/architecture/*` afetado (ou adicione uma nota apontando para o ADR), as tasks bloqueadas (remova o bloqueio) e o `AGENTS.md`, se alguma regra mudou.

## Para substituir uma decisão aceita
Nunca edite a decisão antiga. Crie um ADR novo, e no antigo mude só o status para `Substituído por [ADR-XXXX](...)`.

