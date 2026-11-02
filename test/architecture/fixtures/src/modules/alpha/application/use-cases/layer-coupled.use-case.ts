// VIOLATION application-no-infra (x3): application importing infra (own and shared) and presentation.
import { PrismaService } from "@/shared/infra/database/prisma.service";
import { PrismaAlphaRepository } from "../../infra/persistence/prisma-alpha.repository";
import { AlphaController } from "../../presentation/http/alpha.controller";

export const layers = [PrismaService, PrismaAlphaRepository, AlphaController];
