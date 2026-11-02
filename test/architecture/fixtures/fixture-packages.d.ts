// Packages imported by the fixtures on purpose but not installed in the repo.
// These minimal ambient declarations only keep the editor quiet: dependency-cruiser
// still sees the imports as unresolved specifiers, which the ADR-0010 rules match by name.
declare module "@confluentinc/kafka-javascript" {
  export namespace KafkaJS {
    class Kafka {}
  }
}
declare module "@prisma/client" {
  export class PrismaClient {}
}
declare module "ioredis" {
  export default class Redis {}
}
declare module "mongodb" {
  export class Db {}
}
declare module "zod" {
  export const z: { string(): unknown };
}
