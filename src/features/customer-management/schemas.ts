import { z } from "zod";

export function normalizeCustomerPhone(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function normalizeCustomerEmail(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const customerPhone = z.string().trim().min(5).max(40).nullable().optional();
const customerEmail = z.union([z.email(), z.literal("")]).nullable().optional();

export const customerUpdateSchema = z.strictObject({
  name: z.string().trim().min(2).max(160).optional(),
  phone: customerPhone,
  email: customerEmail,
  address: nullableText(1000),
  notes: nullableText(4000),
  isActive: z.boolean().optional(),
  communicationConsent: z.boolean().optional(),
  preferredChannel: z.enum(["phone", "whatsapp", "email"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "Minimal satu perubahan wajib diisi");

export const vehicleUpdateSchema = z.strictObject({
  plateNumber: z.string().trim().min(2).max(20).optional(),
  vehicleModelId: z.uuid().nullable().optional(),
  year: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
  vin: nullableText(100),
  engineNumber: nullableText(100),
  imageUrl: z.string().regex(/^\/api\/v1\/media\/vehicles\/[0-9a-f-]+\.(jpg|png|webp|avif)$/).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "Minimal satu perubahan wajib diisi");

export const transferSchema = z.strictObject({
  customerId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export const mergeSchema = z.strictObject({
  sourceCustomerId: z.uuid(),
  reason: z.string().trim().min(3).max(1000).default("Duplikat data pelanggan"),
});

export const customerCreateContactSchema = z.object({
  phone: customerPhone,
  email: customerEmail,
}).refine((value) => normalizeCustomerPhone(value.phone) || normalizeCustomerEmail(value.email), "Telepon atau email wajib diisi");
