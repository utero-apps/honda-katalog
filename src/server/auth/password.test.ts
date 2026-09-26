import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";

describe("password hashing", () => {
  it("verifies correct password and rejects incorrect password", async () => {
    const hash = await hashPassword("CorrectHorseBatteryStaple-2026");
    await expect(verifyPassword("CorrectHorseBatteryStaple-2026", hash)).resolves.toBe(true);
    await expect(verifyPassword("not-the-password", hash)).resolves.toBe(false);
  });

  it("rejects malformed stored hashes", async () => {
    await expect(verifyPassword("password", "invalid")).resolves.toBe(false);
  });
});
