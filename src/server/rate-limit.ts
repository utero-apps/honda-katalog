import { ApiError } from "@/server/http";

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_TRACKED_KEYS = 10_000;
let nextCleanupAt = 0;

function cleanupExpired(now: number) {
  if (now < nextCleanupAt && attempts.size < MAX_TRACKED_KEYS) return;

  for (const [key, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(key);
  }
  nextCleanupAt = now + 60_000;
}

export function enforceRateLimit(key: string, limit = 10, windowMs = 60_000) {
  if (!key || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new TypeError("Invalid rate-limit configuration");
  }

  const now = Date.now();
  cleanupExpired(now);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    if (attempts.size >= MAX_TRACKED_KEYS) {
      const oldestKey = attempts.keys().next().value;
      if (oldestKey !== undefined) attempts.delete(oldestKey);
    }
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new ApiError(429, "RATE_LIMITED", "Terlalu banyak percobaan, coba lagi nanti");
  current.count += 1;
}

export function resetRateLimits() {
  attempts.clear();
  nextCleanupAt = 0;
}
