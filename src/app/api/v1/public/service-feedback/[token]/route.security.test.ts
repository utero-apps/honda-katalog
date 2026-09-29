import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db", () => ({ withSystemTransaction: (work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));
import { GET, POST } from "./route";

const token = "A".repeat(43);
const context = { params: Promise.resolve({ token }) };

describe("public service feedback route security", () => {
  beforeEach(() => mocks.query.mockReset());

  it("tidak membocorkan data order atau pelanggan pada GET", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ expiresAt: new Date(Date.now() + 60_000), usedAt: null }] });
    const response = await GET(new Request(`http://localhost/api/v1/public/service-feedback/${token}`) as never, context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body.data)).toEqual(["expiresAt"]);
  });

  it("menolak submit cross-origin sebelum akses database", async () => {
    const request = new Request(`http://localhost/api/v1/public/service-feedback/${token}`, {
      method: "POST",
      headers: { origin: "https://attacker.invalid", host: "localhost", "content-type": "application/json" },
      body: JSON.stringify({ rating: 5 }),
    });
    expect((await POST(request as never, context)).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("menolak token dengan format tidak valid", async () => {
    const response = await GET(new Request("http://localhost/api/v1/public/service-feedback/short") as never, { params: Promise.resolve({ token: "short" }) });
    expect(response.status).toBe(422);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
