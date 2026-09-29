import { describe, expect, it } from "vitest";
import {
  customerUpdateSchema,
  mergeSchema,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  transferSchema,
  vehicleUpdateSchema,
} from "@/features/customer-management/schemas";

const customerId = "11111111-1111-4111-8111-111111111111";

describe("customer identity normalization", () => {
  it("maps Indonesian phone prefixes and formatting to one identity", () => {
    const local = normalizeCustomerPhone("0812 3456-7890");
    expect(local).toBeTruthy();
    expect(normalizeCustomerPhone("+62 812-3456-7890")).toBe(local);
    expect(normalizeCustomerPhone("6281234567890")).toBe(local);
  });

  it("trims and lowercases email for duplicate matching", () => {
    expect(normalizeCustomerEmail("  BUDI.Example@GMAIL.COM  ")).toBe("budi.example@gmail.com");
  });
});

describe("customer management mutation schemas", () => {
  it("rejects empty customer changes and accepts partial corrections", () => {
    expect(customerUpdateSchema.safeParse({}).success).toBe(false);
    expect(customerUpdateSchema.safeParse({ name: "Budi Santoso" }).success).toBe(true);
    expect(customerUpdateSchema.safeParse({ email: "invalid-email" }).success).toBe(false);
  });

  it("keeps communication consent explicit and validates its channel", () => {
    expect(customerUpdateSchema.parse({ communicationConsent: false })).toMatchObject({ communicationConsent: false });
    expect(customerUpdateSchema.parse({ communicationConsent: true, preferredChannel: "whatsapp" })).toMatchObject({ communicationConsent: true, preferredChannel: "whatsapp" });
    expect(customerUpdateSchema.safeParse({ communicationConsent: "true" }).success).toBe(false);
    expect(customerUpdateSchema.safeParse({ preferredChannel: "sms" }).success).toBe(false);
  });

  it("rejects empty vehicle changes and invalid model identifiers", () => {
    expect(vehicleUpdateSchema.safeParse({}).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ year: 2022 }).success).toBe(true);
    expect(vehicleUpdateSchema.safeParse({ vehicleModelId: "not-a-uuid" }).success).toBe(false);
  });

  it("requires target owner and meaningful transfer reason", () => {
    expect(transferSchema.safeParse({ customerId, reason: "Motor dijual" }).success).toBe(true);
    expect(transferSchema.safeParse({ customerId, reason: " " }).success).toBe(false);
    expect(transferSchema.safeParse({ customerId: "invalid", reason: "Motor dijual" }).success).toBe(false);
  });

  it("rejects missing or malformed merge source", () => {
    expect(mergeSchema.safeParse({ sourceCustomerId: customerId }).success).toBe(true);
    expect(mergeSchema.safeParse({}).success).toBe(false);
    expect(mergeSchema.safeParse({ sourceCustomerId: "invalid" }).success).toBe(false);
  });
});
