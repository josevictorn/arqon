import { resolve } from "node:path";
import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

const alias = {
  "@/integrations": resolve(root, "src/integrations"),
  "@/modules": resolve(root, "src/modules"),
  "@/shared": resolve(root, "src/shared"),
  "@test": resolve(root, "test"),
};

const createProject = (
  name: string,
  include: string[],
  setupFile: string,
  passWithNoTests = false
) => ({
  // .swcrc targets commonjs (build); Vitest needs ESM output.
  plugins: [swc.vite({ module: { type: "es6" } })],
  resolve: { alias },
  test: {
    environment: "node" as const,
    globals: false,
    include,
    name,
    passWithNoTests,
    setupFiles: [setupFile],
  },
});

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/main.ts", "src/**/*.spec.ts", "src/**/*.int-spec.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    projects: [
      createProject("unit", ["src/**/*.spec.ts"], "./test/setup-unit.ts"),
      createProject(
        "int",
        ["src/**/*.int-spec.ts"],
        "./test/setup-int.ts",
        true
      ),
      createProject("e2e", ["test/**/*.e2e-spec.ts"], "./test/setup-e2e.ts"),
    ],
  },
});
