import { Module } from "@nestjs/common";
import { EnvModule } from "@/shared/infra/config/env.module";
import { HealthController } from "@/shared/infra/http/health/health.controller";

@Module({
  controllers: [HealthController],
  imports: [EnvModule],
})
export class AppModule {}
