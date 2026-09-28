import { z } from "zod";

const money = z.coerce.number().finite().min(0).max(999_999_999_999);
const quantity = z.coerce.number().finite().positive().max(999_999_999);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const reference = z.string().trim().min(3).max(2_000).refine((value) => !value.toLowerCase().startsWith("data:"), "Reference tidak boleh berupa data URL");
const evidenceUrl = reference.refine((value) => /^https?:\/\//.test(value) || value.startsWith("/"), "Evidence wajib berupa URL HTTP(S) atau path lokal");

export const workflowActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("diagnosis"), diagnosis: text(2, 4_000).optional(), findings: text(2, 4_000).optional(), notes: z.string().trim().max(2_000).nullable().optional() }).refine((value) => Boolean(value.diagnosis ?? value.findings), "Diagnosis wajib diisi"),
  z.object({ action: z.literal("approve"), notes: z.string().trim().max(2_000).nullable().optional() }),
  z.object({ action: z.literal("assign"), mechanicId: z.uuid() }),
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("set_target_completion"), targetCompletionAt: z.coerce.date() }),
  z.object({ action: z.literal("add_job"), name: text(2, 300), description: z.string().trim().max(2_000).nullable().optional(), price: money, mechanicId: z.uuid().nullable().optional() }),
  z.object({ action: z.literal("add_part"), name: text(2, 500), quantity, price: money }),
  z.object({ action: z.literal("complete_job"), jobId: z.uuid() }),
  z.object({ action: z.literal("reserve_part"), productId: z.uuid(), warehouseId: z.uuid(), quantity, unitPrice: money, unitCost: money }),
  z.object({ action: z.literal("consume_part"), partId: z.uuid(), idempotencyKey: text(8, 200) }),
  z.object({ action: z.literal("quality_check"), passed: z.boolean(), notes: z.string().trim().max(2_000).nullable().optional() }),
  z.object({ action: z.literal("add_evidence"), evidenceType: z.enum(["vehicle", "job", "quality_control"]), jobId: z.uuid().nullable().optional(), url: evidenceUrl, notes: z.string().trim().max(2_000).nullable().optional() }).superRefine((value, context) => {
    if ((value.evidenceType === "job") !== Boolean(value.jobId)) context.addIssue({ code: "custom", path: ["jobId"], message: "Evidence job wajib memiliki jobId" });
  }),
  z.object({ action: z.literal("handover"), recipientName: text(2, 160), signatureReference: reference.nullable().optional(), notes: z.string().trim().max(2_000).nullable().optional() }),
]);

export const invoiceInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), discount: money.default(0), tax: money.default(0), dueAt: z.coerce.date().nullable().optional() }),
  z.object({ action: z.literal("record_payment"), method: z.enum(["cash", "transfer", "card", "qris", "other"]), amount: z.coerce.number().finite().positive().max(999_999_999_999), reference: z.string().trim().max(200).nullable().optional(), idempotencyKey: z.string().trim().min(8).max(200).optional() }),
]);

export type WorkflowActionInput = z.infer<typeof workflowActionSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
