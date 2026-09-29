import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), transaction: vi.fn() }));

vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/db", () => ({ withActorTransaction: mocks.transaction }));

import { GET } from "@/app/api/v1/operations/customers/export/route";
import { ApiError } from "@/server/http";

describe("customer export authorization", () => {
  beforeEach(() => {
    mocks.requirePermission.mockReset().mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", role: "admin" });
    mocks.transaction.mockReset().mockResolvedValue([]);
  });

  it("requires users.manage before exporting customer data", async () => {
    const request = new Request("http://localhost/api/v1/operations/customers/export") as NextRequest;

    await GET(request);

    expect(mocks.requirePermission).toHaveBeenCalledWith(request, expect.any(String), "users.manage");
  });

  it("does not query customer data when permission is denied", async () => {
    mocks.requirePermission.mockRejectedValue(new ApiError(403, "FORBIDDEN", "Akses ditolak"));
    const request = new Request("http://localhost/api/v1/operations/customers/export") as NextRequest;

    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
