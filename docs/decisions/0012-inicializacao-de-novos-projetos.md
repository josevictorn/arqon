# ADR-0012: Inicialização de novos projetos (`create-arqon-app` + `pnpm init:project`)

- **Status:** Aceito
- **Data:** 2026-11-01
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.06, T1.09, T11.03
- **Docs afetados:** [11-code-quality.md](../architecture/11-code-quality.md), [README.md](../../README.md)

## Contexto

O `arqon-boilerplate` existe para dar origem a múltiplos projetos SaaS reais. Sem um mecanismo oficial e automatizado de bootstrap:
1. Iniciar um projeto novo exige buscar e substituir manualmente dezenas de ocorrências de `arqon-boilerplate` / `arqon` em `package.json`, `docker-compose.yml`, `.env.example`, `README.md` e docs.
2. Múltiplos projetos derivados rodando na mesma máquina colidem em nomes de containers, volumes Docker e bancos se o `docker-compose.yml` tiver nomes fixos.
3. Desenvolvedores acabam reutilizando chaves JWT de exemplo do repositório em vez de gerar pares assimétricos exclusivos por projeto.
4. O `docs/roadmap/ROADMAP.md` e as tasks `T1..T11` de construção do próprio boilerplate ficam misturados com o backlog do novo produto, confundindo os agentes de IA que seguem a regra *"toda mudança nasce de uma task no ROADMAP"*.

## Opções consideradas

### Opção A — CLI externo (`pnpm create arqon-app`) + script interno (`pnpm init:project`)
- ✅ Experiência de primeira classe (`pnpm create arqon-app meu-saas` ou `npx create-arqon-app meu-saas`): baixa o template sem histórico Git do boilerplate, executa a parametrização, gera `.env` + chaves e faz `git init`.
- ✅ Como o motor de transformação (`scripts/init-project.ts`) vive dentro do próprio repositório e é exposto via `pnpm init:project`, ele pode ser testado continuamente no CI do boilerplate e também funciona para quem usar GitHub Template / `git clone`.
- ❌ Exige manter a lista de arquivos parametrizados sincronizada conforme o boilerplate cresce (mitigado por regra estrita de usar variáveis de ambiente em `src/` e teste automatizado do script).

### Opção B — Apenas substituição manual documentada no `README.md`
- ✅ Zero código de tooling para manter.
- ❌ Propenso a erro humano, lento e esquece detalhes como geração de chaves criptográficas e limpeza do roadmap para a IA.

### Opção C — Gerador estilo Yeoman/Hygen mantendo todos os arquivos como templates `.ejs`
- ✅ Flexível para condicionais complexas.
- ❌ Impede que o próprio repositório do boilerplate seja um projeto NestJS válido, executável e testável diretamente com `pnpm verify`.

## Decisão

Adotar a **Opção A**:
1. **Repositório sempre executável:** o `arqon-boilerplate` continua sendo um projeto NestJS real e válido (nunca arquivos `.ejs` quebrados).
2. **Motor de inicialização no repo (`scripts/init-project.ts` / `pnpm init:project`):** script em TypeScript (zero dependências pesadas, usando `node:fs`, `node:crypto` e `node:readline/promises`) que recebe `--name <project-slug>` (ou pergunta interativamente) e executa três etapas idempotentes:
   - **Renomeação:** substitui a identidade `arqon-boilerplate` / `arqon` pelo `<project-slug>` em `package.json`, `docker-compose.yml`, `.env.example`, `README.md` e cabeçalhos de documentação.
   - **Bootstrap de `.env` e criptografia:** gera `.env` a partir do `.env.example`, preenchendo segredos aleatórios (`crypto.randomBytes`) e um par de chaves assimétricas JWT novas (`crypto.generateKeyPairSync`) exclusivas para o novo projeto.
   - **Reset do Roadmap para o novo produto:** remove os arquivos de tasks de construção do boilerplate (`docs/roadmap/tasks/T*.md`, preservando `docs/roadmap/tasks/_template.md`) e substitui `docs/roadmap/ROADMAP.md` por um template limpo de roadmap do novo projeto (preservando `docs/decisions/`, `docs/architecture/` e `docs/modules/*/spec.md` como documentação viva da arquitetura herdada).
3. **CLI externo (`create-arqon-app`):** pacote/binário leve para `pnpm create arqon-app <slug>` / `npx create-arqon-app <slug>` que faz o download da árvore do boilerplate sem histórico `.git`, invoca o `scripts/init-project.ts`, inicializa um Git limpo (`git init`) e exibe os próximos passos.

## Consequências

- **Positivas:** criar um novo SaaS a partir do boilerplate leva menos de 1 minuto, já sai com chaves criptográficas únicas, containers isolados por projeto e `docs/roadmap/ROADMAP.md` pronto para o fluxo de agentes de IA do novo produto.
- **Negativas / trade-offs aceitos:** qualquer configuração nova de infraestrutura deve respeitar as variáveis `APP_NAME` / `APP_SLUG` em vez de hardcodar `arqon`.
- **Ações decorrentes:**
  - Adicionar task **T1.09** na Fase 1 para criar o `scripts/init-project.ts` (`pnpm init:project`) + template de roadmap limpo + testes automatizados em diretório temporário.
  - Atualizar **T1.06** para garantir que `docker-compose.yml` e `.env.example` usem `name:` e variáveis parametrizáveis (`APP_NAME`, `APP_SLUG`).
  - Atualizar **T11.03** na Fase 11 para empacotar/validar o CLI `create-arqon-app` (`pnpm create arqon-app`) ponta a ponta com todos os módulos prontos.

## Regras para a IA

1. **Nunca hardcode `arqon` ou `arqon-boilerplate` dentro de `src/`:** qualquer nome de serviço, prefixo de chave Redis, `clientId` do Kafka, bucket default, issuer JWT ou título do OpenAPI/Scalar **deve** ser lido de variáveis de ambiente via `EnvModule` (`APP_NAME`, `APP_SLUG`, `OTEL_SERVICE_NAME`, etc.) ou do `package.json`.
2. **Isolamento no Docker Compose:** no `docker-compose.yml`, defina `name: ${APP_SLUG:-arqon}` no topo e evite `container_name` estático sem prefixo, permitindo que múltiplos projetos derivados do boilerplate rodem simultaneamente na mesma máquina.
3. **Manutenção do inicializador:** sempre que uma task adicionar um arquivo de configuração na raiz que contenha o slug do projeto, atualize a lista de alvos em `scripts/init-project.ts` e seu respectivo teste.

