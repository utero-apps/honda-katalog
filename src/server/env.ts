import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DATABASE_HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DATABASE_NAME: z.string().min(1).default("honda_workshop"),
  DATABASE_USER: z.string().min(1).default("honda_runtime"),
  DATABASE_PASSWORD: z.string().min(16).optional(),
  SESSION_COOKIE_NAME: z.string().min(3).default("honda_session"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
}).superRefine((value, context) => {
  if (!value.DATABASE_URL && !value.DATABASE_PASSWORD) {
    context.addIssue({ code: "custom", path: ["DATABASE_PASSWORD"], message: "DATABASE_PASSWORD wajib diisi saat DATABASE_URL kosong" });
  }
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
