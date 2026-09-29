import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), process: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: unknown) => unknown) => work({}), withSystemTransaction: (work: (client: unknown) => unknown) => work({}) }));
vi.mock("@/features/automation/due-communications", () => ({ processDueCommunications: mocks.process }));

import { POST } from "./route";

describe("due communications automation route", () => {
  beforeEach(() => {
    delete process.env.AUTOMATION_JOB_TOKEN;
    mocks.requirePermission.mockReset().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "admin" });
    mocks.process.mockReset().mockResolvedValue({ status: "completed", scanned: 0, logged: 0, alreadyLogged: 0, deliveryStatus: "provider_unavailable" });
  });

  it("requires CRM write permission and caps accepted batch input", async () => {
    const request = new Request("http://localhost/api/v1/automation/due-communications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 25 }),
    }) as NextRequest;

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith(request, expect.any(String), "crm.write");
    expect(mocks.process).toHaveBeenCalledWith({}, { limit: 25, workerId: "user:11111111-1111-4111-8111-111111111111" });
  });

  it("allows scheduler bearer without browser session", async () => {
    process.env.AUTOMATION_JOB_TOKEN="123456789012345678901234";
    const request=new Request("http://localhost/api/v1/automation/due-communications",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer 123456789012345678901234"},body:"{}"}) as NextRequest;
    expect((await POST(request)).status).toBe(200);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.process).toHaveBeenCalledWith({},expect.objectContaining({limit:100,workerId:expect.stringMatching(/^job:/)}));
  });

  it("rejects oversized batches", async () => {
    const request = new Request("http://localhost/api/v1/automation/due-communications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 201 }),
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(422);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects CRM users who cannot read automation audit logs", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "cashier" });
    const request = new Request("http://localhost/api/v1/automation/due-communications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }) as NextRequest;
    expect((await POST(request)).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated calls before processing", async () => {
    mocks.requirePermission.mockRejectedValue(new (await import("@/server/http")).ApiError(401, "UNAUTHENTICATED", "Silakan login"));
    const request = new Request("http://localhost/api/v1/automation/due-communications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }) as NextRequest;
    expect((await POST(request)).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});

