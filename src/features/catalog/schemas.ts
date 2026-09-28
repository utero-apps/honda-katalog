import { z } from "zod";

const optionalUuid = z.union([z.uuid(), z.literal("")]).transform((value) => value || null).optional();
const imageUrl = z.string().trim().max(2_000).refine(
  (value) => /^https?:\/\//.test(value) || /^\/api\/v1\/media\/products\/[0-9a-f-]+\.(jpg|png|webp|avif)$/.test(value),
  "URL gambar harus memakai HTTP(S) atau media produk internal",
);

export const catalogQuerySchema = z.object({
  query: z.string().trim().max(120).default(""),
  categoryId: optionalUuid,
  status: z.enum(["active", "inactive", "archived"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const productInputSchema = z.object({
  partCode: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(500),
  categoryId: optionalUuid,
  het: z.coerce.number().min(0).max(999_999_999_999),
  hpp: z.coerce.number().min(0).max(999_999_999_999).default(0),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  minimumStock: z.coerce.number().min(0).max(999_999_999).default(0),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  description: z.string().trim().max(4_000).nullable().optional(),
  imageUrl: imageUrl.nullable().optional(),
  barcodes: z.array(z.string().trim().min(3).max(100)).max(20).default([]),
  compatibleModelIds: z.array(z.uuid()).max(100).default([]),
});

export const productUpdateSchema = productInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Minimal satu field harus diubah",
);

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
