import { describe, expect, it, vi } from "vitest";
import { createFeedbackToken, getFeedbackTokenState, hashFeedbackToken, submitFeedbackWithToken } from "./customer-feedback-token";

function clientWith(...results: Array<{ rows: unknown[] }>) {
  return { query: vi.fn().mockImplementation(() => Promise.resolve(results.shift() ?? { rows: [] })) } as never;
}

describe("customer feedback token", () => {
  it("membuat token acak dan hanya menghasilkan hash tetap untuk penyimpanan", () => {
    const first = createFeedbackToken();
    const second = createFeedbackToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashFeedbackToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashFeedbackToken(first)).not.toContain(first);
  });

  it("menolak token kedaluwarsa", async () => {
    const client = clientWith({ rows: [{ expiresAt: new Date(Date.now() - 1_000), usedAt: null }] });
    await expect(getFeedbackTokenState(client, createFeedbackToken())).rejects.toMatchObject({ status: 410, code: "FEEDBACK_TOKEN_EXPIRED" });
  });

  it("menolak replay setelah token sudah dipakai", async () => {
    const client = clientWith(
      { rows: [] },
      { rows: [{ expiresAt: new Date(Date.now() + 60_000), usedAt: new Date() }] },
    );
    await expect(submitFeedbackWithToken(client, createFeedbackToken(), { rating: 5 })).rejects.toMatchObject({ status: 409, code: "FEEDBACK_TOKEN_USED" });
    expect((client as { query: ReturnType<typeof vi.fn> }).query).toHaveBeenCalledTimes(2);
  });

  it("mengonsumsi token sebelum menyimpan rating tanpa recorded_by", async () => {
    const serviceOrderId = "11111111-1111-4111-8111-111111111111";
    const client = clientWith(
      { rows: [{ serviceOrderId }] },
      { rows: [{ customerId: "customer", mechanicId: "mechanic" }] },
      { rows: [{ rating: 4, submittedAt: new Date() }] },
    );
    await expect(submitFeedbackWithToken(client, createFeedbackToken(), { rating: 4, comments: "Bagus" })).resolves.toMatchObject({ rating: 4 });
    const query = (client as { query: ReturnType<typeof vi.fn> }).query;
    expect(query.mock.calls[0][0]).toContain("used_at IS NULL AND expires_at > now()");
    expect(query.mock.calls[2][0]).toContain("NULL,'customer_token'");
  });
});
