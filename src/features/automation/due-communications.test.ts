import { describe, expect, it, vi } from "vitest";
import { processDueCommunications } from "./due-communications";

function clientWith(query: ReturnType<typeof vi.fn>) {
  return { query } as never;
}

describe("processDueCommunications", () => {
  it("does not claim delivery when no provider is configured", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111", dueAt: "2026-09-29T00:00:00.000Z", channel: "whatsapp", entityType: "customer_follow_up" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await processDueCommunications(
      clientWith(query),
      { id: "22222222-2222-4222-8222-222222222222", requestId: "33333333-3333-4333-8333-333333333333" },
      { limit: 10, now: new Date("2026-09-29T01:00:00.000Z") },
    );

    expect(result).toEqual({ status: "completed", scanned: 1, logged: 1, alreadyLogged: 0, deliveryStatus: "provider_unavailable" });
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE app.customer_follow_ups"), expect.anything());
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE app.service_reminders"), expect.anything());
    expect(query.mock.calls.at(-1)?.[1]?.[6]).toContain("provider_unavailable");
  });

  it("skips an item already logged by an earlier run", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ acquired: true }] })
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-4111-8111-111111111111", dueAt: "2026-09-29T00:00:00.000Z", channel: "other", entityType: "service_reminder" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 });

    const result = await processDueCommunications(
      clientWith(query),
      { id: "22222222-2222-4222-8222-222222222222", requestId: "33333333-3333-4333-8333-333333333333" },
      { limit: 10 },
    );

    expect(result).toMatchObject({ logged: 0, alreadyLogged: 1 });
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3][1]).toEqual([
      "automation.communication.provider_unavailable", "service_reminder",
      "11111111-1111-4111-8111-111111111111", "2026-09-29T00:00:00.000Z",
    ]);
  });

  it("returns busy when another worker owns the advisory lock", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ acquired: false }] });
    await expect(processDueCommunications(
      clientWith(query),
      { id: "22222222-2222-4222-8222-222222222222", requestId: "33333333-3333-4333-8333-333333333333" },
      { limit: 10 },
    )).resolves.toMatchObject({ status: "busy", scanned: 0 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});

