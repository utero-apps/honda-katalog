import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/server/http";
import { enforceRateLimit, resetRateLimits } from "@/server/rate-limit";

describe("rate limit", () => {
  beforeEach(resetRateLimits);
  afterEach(() => vi.useRealTimers());

  it("blocks replay after limit", () => {
    enforceRateLimit("client", 2, 60_000);
    enforceRateLimit("client", 2, 60_000);
    expect(() => enforceRateLimit("client", 2, 60_000)).toThrowError(ApiError);
  });
  it("separates client keys", () => {
    enforceRateLimit("a", 1, 60_000);
    expect(() => enforceRateLimit("b", 1, 60_000)).not.toThrow();
  });

  it("allows requests after the window expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    enforceRateLimit("client", 1, 1_000);
    vi.advanceTimersByTime(1_000);
    expect(() => enforceRateLimit("client", 1, 1_000)).not.toThrow();
  });

  it("rejects unsafe configuration", () => {
    expect(() => enforceRateLimit("", 1, 1_000)).toThrow(TypeError);
    expect(() => enforceRateLimit("client", 0, 1_000)).toThrow(TypeError);
    expect(() => enforceRateLimit("client", 1, 0)).toThrow(TypeError);
  });
});
