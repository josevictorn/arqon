import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

@Injectable()
class Dependency {
  value(): string {
    return "injected";
  }
}

@Injectable()
class Consumer {
  constructor(private readonly dependency: Dependency) {}

  read(): string {
    return this.dependency.value();
  }
}

describe("HealthController", () => {
  it("reports liveness", () => {
    expect(new HealthController().live()).toEqual({ status: "ok" });
  });
});

describe("SWC decorator metadata", () => {
  it("injects a provider via constructor", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [Dependency, Consumer],
    }).compile();

    expect(moduleRef.get(Consumer).read()).toBe("injected");
  });
});
