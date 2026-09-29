import { afterEach, describe, expect, it, vi } from "vitest";
import { processDueCommunications } from "./due-communications";

const message = { id:"11111111-1111-4111-8111-111111111111", idempotencyKey:"service_reminder:abc:1", channel:"whatsapp", destination:"628123", payload:{kind:"service_reminder"}, attempts:0, maxAttempts:8 };
const client = (query:ReturnType<typeof vi.fn>) => ({query}) as never;
afterEach(() => { delete process.env.AUTOMATION_WHATSAPP_PROVIDER_URL; delete process.env.AUTOMATION_WHATSAPP_PROVIDER_TOKEN; vi.unstubAllGlobals(); });

describe("processDueCommunications", () => {
  it("keeps retry status when provider is unavailable", async () => {
    const query=vi.fn().mockResolvedValueOnce({rows:[{acquired:true}]}).mockResolvedValueOnce({rowCount:1}).mockResolvedValueOnce({rows:[message]}).mockResolvedValueOnce({rowCount:1});
    const result=await processDueCommunications(client(query),{limit:10,now:new Date("2026-09-29T00:00:00Z"),workerId:"worker"});
    expect(result).toMatchObject({enqueued:1,claimed:1,delivered:0,retried:1,providerUnavailable:1});
    expect(query.mock.calls[1][0]).toContain("f.channel='email' AND c.email IS NOT NULL");
    expect(query.mock.calls[1][0]).toContain("f.channel='whatsapp' AND c.phone IS NOT NULL");
    expect(query.mock.calls[3][1][1]).toBe("retry");
    expect(query.mock.calls[3][1][4]).toBe("provider_unavailable");
    expect(new Date(query.mock.calls[3][1][3]).getTime()).toBeGreaterThan(new Date("2026-09-29T00:00:00Z").getTime());
    expect(query.mock.calls[3][0]).not.toContain("status='delivered'");
  });
  it("uses provider idempotency and marks delivered after success", async () => {
    process.env.AUTOMATION_WHATSAPP_PROVIDER_URL="https://provider.example/send";
    process.env.AUTOMATION_WHATSAPP_PROVIDER_TOKEN="secret-not-logged";
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({id:"provider-1"})}); vi.stubGlobal("fetch",fetchMock);
    const query=vi.fn().mockResolvedValueOnce({rows:[{acquired:true}]}).mockResolvedValueOnce({rowCount:0}).mockResolvedValueOnce({rows:[message]}).mockResolvedValueOnce({rowCount:1});
    const result=await processDueCommunications(client(query),{limit:10,workerId:"worker"});
    expect(result.delivered).toBe(1);
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toBe(message.idempotencyKey);
    expect(query.mock.calls[3][0]).toContain("status='delivered'");
  });
  it("returns busy without claiming", async () => {
    const query=vi.fn().mockResolvedValueOnce({rows:[{acquired:false}]});
    await expect(processDueCommunications(client(query),{limit:10})).resolves.toMatchObject({status:"busy",claimed:0});
    expect(query).toHaveBeenCalledTimes(1);
  });
});
