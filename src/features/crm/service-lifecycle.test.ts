import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createHandoverLifecycle, getServiceLifecyclePolicy } from "./service-lifecycle";

describe("getServiceLifecyclePolicy", () => {
  it("menjadwalkan follow-up tiga hari untuk semua jenis service", () => {
    expect(getServiceLifecyclePolicy("general").followUpDays).toBe(3);
    expect(getServiceLifecyclePolicy("routine").followUpDays).toBe(3);
  });

  it("memberi interval reminder sesuai jenis service", () => {
    expect(getServiceLifecyclePolicy("monthly")).toMatchObject({ days: 30, kilometers: 1_000 });
    expect(getServiceLifecyclePolicy("mileage")).toMatchObject({ days: 90, kilometers: 2_000 });
    expect(getServiceLifecyclePolicy("routine")).toMatchObject({ days: 180, kilometers: 4_000 });
  });

  it("membuat dua jadwal dengan kunci stabil berdasarkan service order", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ customerId: "customer", vehicleId: "vehicle", serviceType: "monthly", odometer: "18000", preferredChannel: "phone" }] })
      .mockResolvedValueOnce({ rows: [{ id: "follow-up", status: "pending" }] })
      .mockResolvedValueOnce({ rows: [{ id: "reminder", status: "pending" }] });
    const result = await createHandoverLifecycle({ query } as unknown as PoolClient, "service-order");
    expect(result.followUp.id).toBe("follow-up");
    expect(result.reminder.id).toBe("reminder");
    expect(query.mock.calls[1][1]).toEqual(["customer", "service-order", 3, "phone", "handover-follow-up:service-order"]);
    expect(query.mock.calls[2][1]).toEqual(["vehicle", "customer", 30, 19000, "handover-reminder:service-order"]);
    expect(query.mock.calls[1][0]).toContain("ON CONFLICT(automation_key) DO NOTHING");
  });
});
