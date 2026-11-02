"use strict";
/**
 * Architecture rules enforced by `pnpm arch:check` (ADR-0010).
 *
 * Every rule maps 1:1 to the table in docs/decisions/0010-enforcement-de-arquitetura.md.
 * Never add exceptions here without an ADR. Each rule is proven by the fixtures in
 * test/architecture/fixtures (see test/architecture/dependency-rules.spec.ts).
 */

const ADR = "docs/decisions/0010-enforcement-de-arquitetura.md";

// Matches both a resolved path (node_modules/.pnpm/.../node_modules/<pkg>/...)
// and the raw specifier of a package that is not installed yet.
const npm = (...packages) => `(^|node_modules/)(${packages.join("|")})(/|$)`;

const NESTJS = npm("@nestjs/[^/]+");
const PRISMA = npm("@prisma/[^/]+");
const MONGODB = npm("mongodb", "mongoose");
const REDIS = npm("ioredis");
const KAFKA = npm("@confluentinc/kafka-javascript", "kafkajs");
const ZOD = npm("zod");
const FASTIFY = npm("fastify", "@fastify/[^/]+");

const INFRA_LIBS = [PRISMA, MONGODB, REDIS, KAFKA];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      comment:
        "domain-pure: domain/ is pure TypeScript and must not import frameworks (@nestjs), ORMs/drivers " +
        "(@prisma, mongodb, ioredis, Kafka client), zod or the application/infra/presentation layers. " +
        "Fix: move the I/O or framework code to application/ (behind an abstract class port) or infra/, " +
        "and keep validation in value objects returning Either. " +
        `See ADR-0010 (${ADR}).`,
      from: { path: "^src/.*/domain/" },
      name: "domain-pure",
      severity: "error",
      to: {
        path: [
          NESTJS,
          ...INFRA_LIBS,
          ZOD,
          "^src/.*/(application|infra|presentation)/",
        ],
      },
    },
    {
      comment:
        "application-no-infra: application/ depends only on domain/ and contracts (abstract classes). " +
        "It must not import infra/, presentation/ or persistence/messaging drivers (@prisma, mongodb, " +
        "ioredis, Kafka client). Fix: declare an abstract class port in application/ and implement it " +
        "in infra/, binding it in the module. (@nestjs/common for @Injectable() is allowed.) " +
        `See ADR-0010 (${ADR}).`,
      from: { path: "^src/.*/application/" },
      name: "application-no-infra",
      severity: "error",
      to: {
        path: ["^src/.*/(infra|presentation)/", ...INFRA_LIBS],
      },
    },
    {
      comment:
        "no-cross-module: a module must never import files from another module. " +
        "Fix: talk to the other module through src/shared/contracts (a Facade contract or an " +
        "Integration Event) instead of importing its internals. " +
        `See ADR-0010 (${ADR}).`,
      from: { path: "^src/modules/([^/]+)/" },
      name: "no-cross-module",
      severity: "error",
      to: {
        path: "^src/modules/",
        pathNot: "^src/modules/$1/",
      },
    },
    {
      comment:
        "core-framework-free: src/shared/core is framework-free and must not import @nestjs/* or any " +
        "infrastructure library (@prisma, mongodb, ioredis, Kafka client, fastify). " +
        "Fix: keep only pure building blocks (Entity, ValueObject, Either, DomainError) in shared/core " +
        "and move framework-bound code to src/shared/infra. " +
        `See ADR-0010 (${ADR}).`,
      from: { path: "^src/shared/core/" },
      name: "core-framework-free",
      severity: "error",
      to: {
        path: [NESTJS, ...INFRA_LIBS, FASTIFY],
      },
    },
    {
      comment:
        "integrations-isolated: modules must not import integration providers (adapters/ACL mappers). " +
        "Fix: depend on the gateway contract in src/integrations/<name>/contracts and let the " +
        "integration module bind the concrete provider. " +
        `See ADR-0010 (${ADR}).`,
      from: { path: "^src/modules/" },
      name: "integrations-isolated",
      severity: "error",
      to: { path: "^src/integrations/[^/]+/providers/" },
    },
    {
      comment:
        "no-circular: circular dependencies are forbidden. " +
        "Fix: extract the shared piece to a lower layer (domain/ or src/shared/contracts), or invert " +
        "the dependency with an abstract class port. " +
        `See ADR-0010 (${ADR}).`,
      from: { path: "^src/" },
      name: "no-circular",
      severity: "error",
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default", "types"],
      exportsFields: ["exports"],
      mainFields: ["module", "main", "types", "typings"],
    },
    exclude: { path: "(^|/)test/architecture/fixtures/" },
    reporterOptions: {
      text: { highlightFocused: true },
    },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
