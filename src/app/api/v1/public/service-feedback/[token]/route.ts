import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { feedbackInput, feedbackTokenSchema, getFeedbackTokenState, hashFeedbackToken, submitFeedbackWithToken } from "@/features/service-orders/customer-feedback-token";
import { withSystemTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";

function rateLimitKey(request: NextRequest, token: string) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return `service-feedback:${ip}:${hashFeedbackToken(token).slice(0, 16)}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const token = feedbackTokenSchema.parse((await context.params).token);
    enforceRateLimit(rateLimitKey(request, token), 30, 60_000);
    const data = await withSystemTransaction((client) => getFeedbackTokenState(client, token));
    const response = ok(data, { requestId: crypto.randomUUID() });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    assertSameOrigin(request);
    const token = feedbackTokenSchema.parse((await context.params).token);
    enforceRateLimit(rateLimitKey(request, token), 10, 60_000);
    const input = await parseBody(request, feedbackInput);
    const data = await withSystemTransaction((client) => submitFeedbackWithToken(client, token, input));
    const response = ok(data, { requestId: crypto.randomUUID() });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) { return fail(error); }
}
