# ADR-0022: Atualizar dependências automaticamente só em patch/minor; majors exigem ADR

- **Status:** Aceito
- **Data:** 2026-11-02
- **Decisores:** José Victor
- **Tasks relacionadas:** T1.07
- **Docs afetados:** [12-ci.md](../architecture/12-ci.md), [`.github/dependabot.yml`](../../.github/dependabot.yml)

## Contexto

A T1.07 configurou o Dependabot sem restrição de versão. Na primeira execução ele abriu dois PRs só com majors: o de npm subia NestJS 11 → 12, TypeScript 5.9 → 7.0, `@types/node` 24 → 26 e chokidar 5 → 6; o de compose subia Postgres 17 → 18, MongoDB 8.0 → 9.0 e Valkey 8 → 9. O CI reprovou os dois. O TypeScript 7 remove `baseUrl` e `moduleResolution: node` do `tsconfig.json`, e a infra `core` não sobe com as novas imagens. Nada foi mergeado.

Atualizar majors sem planejamento contradiz o [ADR-0003](./0003-runtime-versoes-e-package-manager.md) (*"Não faça upgrade de major sem um novo ADR"*), que fixa NestJS 11, TypeScript 5.x, Node 24 (e portanto `@types/node` 24), Postgres 17 e MongoDB 8. Também havia risco de inconsistência dentro do NestJS: os pacotes `@nestjs/*` e o Fastify fixam versões uns dos outros (o `@nestjs/platform-fastify` depende de uma versão exata do `fastify`) e precisam subir juntos.

## Opções consideradas

### Opção A — Dependabot só com patch/minor, sem relatório de majors
- ✅ Uma mudança só de configuração: nada de app externo nem de workflow novo.
- ✅ O ADR-0003 passa a valer na prática: a ferramenta não propõe o que a regra proíbe.
- ❌ Ninguém é avisado de majors novos; o acompanhamento é manual (`pnpm outdated`, changelogs).

### Opção B — Opção A + workflow semanal que atualiza uma issue com os majors disponíveis
- ✅ Majors ficam visíveis sem virar PR.
- ❌ Script próprio para npm e tags de imagens no Docker Hub, além da permissão `issues: write`.

### Opção C — Trocar para Renovate com Dependency Dashboard
- ✅ Dashboard nativo; um major só vira PR depois de aprovado num checkbox.
- ❌ Exige instalar um GitHub App externo com permissão de escrita e substituir o `dependabot.yml`.

## Decisão

**Opção A.** O Dependabot abre PRs só de patch e minor, agrupados por ecossistema. NestJS e Fastify ficam num grupo próprio, e o MongoDB recebe só patch dentro da linha 8.0. Majors são planejados à parte: novo ADR, que substitui o item correspondente do ADR-0003, e uma task dedicada. O Dependabot nunca faz merge; todo PR passa pelo CI e pela revisão humana.

## Consequências

- **Positivas:** os PRs do Dependabot ficam pequenos e com chance real de passar no CI; o NestJS nunca fica com versões misturadas; a política fica protegida por teste (`test/infra/ci-workflow.spec.ts`).
- **Negativas / trade-offs aceitos:** majors (inclusive correções de segurança que só existam em major) não aparecem sozinhos; é preciso revisá-los periodicamente. As GitHub Actions continuam recebendo majors, porque são fixadas por tag de major (`@v7`) e o próprio CI as valida no PR. Imagens dos profiles `messaging`, `mail-storage` e `observability` não são exercitadas pelo CI, então os PRs que as atualizam pedem um `pnpm infra:up:full` local.
- **Ações decorrentes:** fechar os PRs de majors já abertos (#8 e #9); o Dependabot recria só o que é permitido. O `fastify` direto no `package.json` (5.12.7) diverge da versão exata exigida pelo `@nestjs/platform-fastify` (5.11.3) e vira follow-up.

## Regras para a IA

1. Não remova os `ignore` de `version-update:semver-major` (npm e docker-compose) nem a restrição de minor do `mongo` no `.github/dependabot.yml`.
2. Pacotes `@nestjs/*`, `fastify` e `@fastify/*` sobem sempre juntos, no mesmo PR e na mesma versão de linha.
3. Upgrade de major (lib ou imagem) só com novo ADR e task própria; nunca dentro de um PR do Dependabot.
4. Não habilite auto-merge para PRs do Dependabot.
