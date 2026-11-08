import { describe, expect, expectTypeOf, it } from "vitest";
import { InvalidEventNameError } from "../errors/common-errors";
import {
  dlqTopicFor,
  type EventName,
  isEventName,
  parseEventName,
  topicFor,
} from "./event-name";

const VALID_NAMES = [
  "billing.invoice.paid.v1",
  "iam.user.registered.v1",
  "iam.mfa.email_otp_requested.v1",
  "iam.email_verification.requested.v1",
  "notifications.notifications.all_read.v1",
  "tenancy.member.roles_updated.v12",
  "a1.b2.c3.v10",
] as const;

const INVALID_NAMES = [
  "BillingInvoicePaid",
  "billing.invoice.paid",
  "billing.invoice.paid.v0",
  "billing.invoice.paid.v01",
  "billing.invoice.paid.V1",
  "billing.invoice.paid.v1.dlq",
  "billing.invoice.v1",
  "Billing.invoice.paid.v1",
  "billing.Invoice.paid.v1",
  "billing.invoice.paid-now.v1",
  "billing.invoice.1paid.v1",
  "_billing.invoice.paid.v1",
  "billing..paid.v1",
  "billing.invoice.paid.v1 ",
  "billing.invoice.paid.v1.5",
  "",
] as const;

describe("event name convention", () => {
  it.each(VALID_NAMES)("accepts %s", (name) => {
    expect(isEventName(name)).toBe(true);
    expect(parseEventName(name).isRight()).toBe(true);
  });

  it.each(INVALID_NAMES)("rejects %j", (name) => {
    expect(isEventName(name)).toBe(false);

    const result = parseEventName(name);

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(InvalidEventNameError);
    expect(result.value).toMatchObject({ args: { value: name } });
  });

  it("splits the name into context, aggregate, action and major version", () => {
    const result = parseEventName("iam.mfa.email_otp_requested.v12");

    expect(result.isRight() && result.value).toEqual({
      action: "email_otp_requested",
      aggregate: "mfa",
      context: "iam",
      version: 12,
    });
  });

  it("narrows the string to EventName", () => {
    const name: string = "billing.invoice.paid.v1";
    if (isEventName(name)) {
      expectTypeOf(name).toEqualTypeOf<EventName>();
    }
  });
});

describe("topic convention", () => {
  it("uses the event name as topic and <topic>.dlq as DLQ", () => {
    const topic = topicFor("billing.invoice.paid.v1");
    const dlq = dlqTopicFor(topic);

    expect(topic).toBe("billing.invoice.paid.v1");
    expect(dlq).toBe("billing.invoice.paid.v1.dlq");
    expectTypeOf(topic).toEqualTypeOf<"billing.invoice.paid.v1">();
    expectTypeOf(dlq).toEqualTypeOf<"billing.invoice.paid.v1.dlq">();
  });
});
