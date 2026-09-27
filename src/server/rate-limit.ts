import { ApiError } from "@/server/http";

const attempts = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(key: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + windowMs }); return; }
  if (current.count >= limit) throw new ApiError(429, "RATE_LIMITED", "Terlalu banyak percobaan, coba lagi nanti");
  current.count += 1;
}
