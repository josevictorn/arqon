// VIOLATION domain-pure (x3): domain importing outer layers.
import { CreateAlphaUseCase } from "../../application/use-cases/create-alpha.use-case";
import { PrismaAlphaRepository } from "../../infra/persistence/prisma-alpha.repository";
import { AlphaController } from "../../presentation/http/alpha.controller";

export const layers = [CreateAlphaUseCase, PrismaAlphaRepository, AlphaController];
