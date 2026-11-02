// VIOLATION no-cross-module (x2): importing beta internals (relative path and alias).
// VIOLATION integrations-isolated (x1): importing a concrete integration provider.
// ALLOWED: own files and integration contracts.
import { PaymentGateway } from "@/integrations/payment/contracts/payment.gateway";
import { StripePaymentAdapter } from "@/integrations/payment/providers/stripe/stripe-payment.adapter";
import { BetaModule } from "@/modules/beta/beta.module";
import { BetaEntity } from "../beta/domain/beta.entity";
import { CreateAlphaUseCase } from "./application/use-cases/create-alpha.use-case";

export const alphaProviders = [
  PaymentGateway,
  StripePaymentAdapter,
  BetaModule,
  BetaEntity,
  CreateAlphaUseCase,
];
