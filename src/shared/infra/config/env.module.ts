import { Global, Module } from "@nestjs/common";
import { EnvService } from "./env.service";
import { InvalidEnvError, parseProcessEnv } from "./load-env";

@Global()
@Module({
  exports: [EnvService],
  providers: [
    {
      provide: EnvService,
      useFactory: (): EnvService =>
        parseProcessEnv().fold(
          (issues) => {
            throw new InvalidEnvError(issues);
          },
          (env) => new EnvService(env)
        ),
    },
  ],
})
export class EnvModule {}
