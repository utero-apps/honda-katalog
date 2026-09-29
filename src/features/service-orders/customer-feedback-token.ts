import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { ApiError } from "@/server/http";

export const feedbackInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comments: z.string().trim().max(2000).nullable().optional(),
});
export const feedbackTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const FEEDBACK_TOKEN_TTL_DAYS = 7;

export function hashFeedbackToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function createFeedbackToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function getFeedbackTokenState(client: PoolClient, token: string) {
  const row = (await client.query<{ expiresAt: Date; usedAt: Date | null }>(
    `SELECT expires_at AS "expiresAt", used_at AS "usedAt"
     FROM app.customer_feedback_tokens WHERE token_hash=$1`,
    [hashFeedbackToken(token)],
  )).rows[0];
  if (!row) throw new ApiError(404, "FEEDBACK_TOKEN_INVALID", "Tautan rating tidak valid");
  if (row.usedAt) throw new ApiError(409, "FEEDBACK_TOKEN_USED", "Tautan rating sudah digunakan");
  if (new Date(row.expiresAt).getTime() <= Date.now()) throw new ApiError(410, "FEEDBACK_TOKEN_EXPIRED", "Tautan rating sudah kedaluwarsa");
  return { expiresAt: row.expiresAt };
}

export async function submitFeedbackWithToken(client: PoolClient, token: string, input: z.infer<typeof feedbackInput>) {
  const tokenRow = (await client.query<{ serviceOrderId: string }>(
    `UPDATE app.customer_feedback_tokens
     SET used_at=now()
     WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()
     RETURNING service_order_id AS "serviceOrderId"`,
    [hashFeedbackToken(token)],
  )).rows[0];
  if (!tokenRow) await getFeedbackTokenState(client, token);

  const order = (await client.query<{ customerId: string; mechanicId: string }>(
    `SELECT customer_id AS "customerId", assigned_mechanic_id AS "mechanicId"
     FROM app.service_orders
     WHERE id=$1 AND status='completed' AND handed_over_at IS NOT NULL AND assigned_mechanic_id IS NOT NULL`,
    [tokenRow!.serviceOrderId],
  )).rows[0];
  if (!order) throw new ApiError(409, "FEEDBACK_NOT_READY", "Service order belum siap menerima rating");

  return (await client.query(
    `INSERT INTO app.service_order_feedback(service_order_id,customer_id,mechanic_id,rating,comments,recorded_by,submitted_via)
     VALUES($1,$2,$3,$4,$5,NULL,'customer_token')
     RETURNING rating, created_at AS "submittedAt"`,
    [tokenRow!.serviceOrderId, order.customerId, order.mechanicId, input.rating, input.comments ?? null],
  )).rows[0];
}
