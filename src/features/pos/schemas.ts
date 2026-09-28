import { z } from "zod";

const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/);
const quantity = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/).refine((value) => Number(value) > 0);
const saleItemSchema = z.object({
  productId: z.uuid().optional(),
  serviceId: z.uuid().optional(),
  quantity,
  discount: money.default("0"),
}).refine((item) => Number(Boolean(item.productId)) + Number(Boolean(item.serviceId)) === 1, "Item harus memilih tepat satu produk atau jasa");

export const checkoutSchema = z.object({
  registerId: z.uuid(),
  customerId: z.uuid().nullable().optional(),
  items: z.array(saleItemSchema).min(1).max(200).refine((items) => new Set(items.map((item) => item.productId ?? item.serviceId)).size === items.length, "Item tidak boleh duplikat"),
  payments: z.array(z.object({
    method: z.enum(["cash", "card", "transfer", "qris", "other"]),
    amount: money,
    reference: z.string().trim().max(200).nullable().optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
  })).min(1).max(10),
  tax: money.default("0"),
  notes: z.string().trim().max(1000).nullable().optional(),
  openBillId: z.uuid().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const salesQuerySchema = z.object({
  query: z.string().trim().max(120).default(""),
  status: z.enum(["completed", "voided"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const posProductsQuerySchema = z.object({
  query: z.string().trim().max(120).default(""),
  q: z.string().trim().max(120).optional(),
  warehouseId: z.uuid().optional(),
  registerId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(48),
});

export const voidSaleSchema = z.object({ reason: z.string().trim().min(3).max(1000) });
export const openBillQuerySchema = z.object({ customerId: z.uuid() });
export const openBillUpsertSchema = z.object({
  customerId: z.uuid(),
  registerId: z.uuid(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(saleItemSchema).min(1).max(200).refine((items) => new Set(items.map((item) => item.productId ?? item.serviceId)).size === items.length, "Item tidak boleh duplikat"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type SalesQuery = z.infer<typeof salesQuerySchema>;
export type PosProductsQuery = z.infer<typeof posProductsQuerySchema>;
export type OpenBillUpsertInput = z.infer<typeof openBillUpsertSchema>;

