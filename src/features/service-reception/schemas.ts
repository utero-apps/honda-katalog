import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const odometer = z.coerce.number().finite().min(0).max(999_999_999_999);
const customerInput = z.object({ name: z.string().trim().min(2).max(160), phone: z.string().trim().min(5).max(40).optional(), email: z.email().optional(), address: optionalText(1000), notes: optionalText(4000) }).refine((value) => value.phone || value.email, "Telepon atau email wajib diisi");
const vehicleInput = z.object({ plateNumber: z.string().trim().min(2).max(20), vehicleModelId: z.uuid().nullable().optional(), year: z.coerce.number().int().min(1950).max(2100).nullable().optional(), vin: optionalText(100), engineNumber: optionalText(100) });

export const createCustomerSchema = customerInput;
export const createVehicleSchema = vehicleInput.extend({ customerId: z.uuid(), odometer: odometer.default(0) });

export const searchSchema = z.object({ query: z.string().trim().min(2).max(120), limit: z.coerce.number().int().min(1).max(50).default(20) });
export const recommendationSchema = z.object({ vehicleId: z.uuid(), serviceType: z.enum(["general", "monthly", "mileage", "routine"]), odometer });

export const createOrderSchema = z.object({
  customerId: z.uuid().optional(),
  customer: customerInput.optional(),
  vehicleId: z.uuid().optional(),
  vehicle: vehicleInput.optional(),
  serviceType: z.enum(["general", "monthly", "mileage", "routine"]),
  complaint: z.string().trim().min(2).max(2000),
  odometer,
  odometerCorrectionReason: z.string().trim().min(3).max(1000).nullable().optional(),
  checklist: z.object({
    fuelLevel: z.coerce.number().finite().min(0).max(100).nullable().optional(),
    physicalCondition: optionalText(4000),
    belongings: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    notes: optionalText(4000),
  }),
  idempotencyKey: z.string().trim().min(8).max(200),
}).superRefine((value, context) => {
  if (Boolean(value.customerId) === Boolean(value.customer)) context.addIssue({ code: "custom", path: ["customerId"], message: "Pilih pelanggan atau isi pelanggan baru" });
  if (Boolean(value.vehicleId) === Boolean(value.vehicle)) context.addIssue({ code: "custom", path: ["vehicleId"], message: "Pilih kendaraan atau isi kendaraan baru" });
  if (value.vehicleId && !value.customerId) context.addIssue({ code: "custom", path: ["vehicleId"], message: "Kendaraan lama memerlukan pelanggan yang dipilih" });
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type RecommendationInput = z.infer<typeof recommendationSchema>;
