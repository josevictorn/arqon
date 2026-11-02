# Fixtures de arquitetura

Árvore `src/` **falsa** com violações intencionais de cada regra do ADR-0010.
Usada por `test/architecture/dependency-rules.spec.ts`, que roda o dependency-cruiser
com `cwd` nesta pasta e compara as violações com a lista esperada.

- Excluída de `tsc`, Biome e `pnpm arch:check` (importa pacotes não instalados de propósito).
- Ao adicionar/alterar uma regra em `.dependency-cruiser.cjs`, adicione aqui um fixture que a viole
  e atualize a lista `EXPECTED_VIOLATIONS` do teste.
- Pacotes não instalados usados pelos fixtures têm tipos mínimos em `fixture-packages.d.ts`
  (só para o editor; o dependency-cruiser continua tratando-os como não resolvidos).
