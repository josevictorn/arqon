import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { EnvService } from "@/shared/infra/config/env.service";
import { formatEnvInvalidLine, loadEnv } from "@/shared/infra/config/load-env";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  if (env.isLeft()) {
    process.stderr.write(formatEnvInvalidLine(env.value));
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter()
  );
  app.enableShutdownHooks();

  await app.listen(app.get(EnvService).get("PORT"), "0.0.0.0");
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(`Bootstrap failed: ${String(error)}\n`);
  process.exitCode = 1;
});
