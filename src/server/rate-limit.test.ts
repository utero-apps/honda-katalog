import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";
import { enforceRateLimit, resetRateLimits } from "@/server/rate-limit";

describe("rate limit", () => {
  beforeEach(resetRateLimits);
  it("blocks replay after limit", () => {
    enforceRateLimit("client", 2, 60_000);
    enforceRateLimit("client", 2, 60_000);
    expect(() => enforceRateLimit("client", 2, 60_000)).toThrowError(ApiError);
  });
  it("separates client keys", () => {
    enforceRateLimit("a", 1, 60_000);
    expect(() => enforceRateLimit("b", 1, 60_000)).not.toThrow();
  });
});
