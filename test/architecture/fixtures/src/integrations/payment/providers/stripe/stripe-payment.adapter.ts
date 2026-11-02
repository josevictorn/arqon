import { PaymentGateway } from "../../contracts/payment.gateway";

export class StripePaymentAdapter extends PaymentGateway {
  charge(): Promise<string> {
    return Promise.resolve("ch_fixture");
  }
}
