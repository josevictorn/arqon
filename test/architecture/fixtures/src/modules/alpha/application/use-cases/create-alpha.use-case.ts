// ALLOWED: application importing @nestjs/common (DI), domain, own ports and shared/contracts.
import { Injectable } from "@nestjs/common";
import { BetaFacadeContract } from "@/shared/contracts/facades/beta.facade.contract";
import type { Amount } from "../../domain/value-objects/amount";
import { AlphaRepository } from "../repositories/alpha.repository";

@Injectable()
export class CreateAlphaUseCase {
  constructor(
    private readonly repository: AlphaRepository,
    private readonly beta: BetaFacadeContract
  ) {}

  async execute(amount: Amount): Promise<void> {
    await this.beta.ping();
    await this.repository.save(String(amount));
  }
}
