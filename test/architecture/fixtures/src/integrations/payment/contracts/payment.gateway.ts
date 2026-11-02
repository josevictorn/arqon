export abstract class PaymentGateway {
  abstract charge(amountInCents: number): Promise<string>;
}
