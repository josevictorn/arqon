import { Controller, Get } from "@nestjs/common";

export interface LiveResponse {
  status: "ok";
}

@Controller("health")
export class HealthController {
  @Get("live")
  live(): LiveResponse {
    return { status: "ok" };
  }
}
