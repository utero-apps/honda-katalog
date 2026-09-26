import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>) {
    super(message);
  }
}

export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return NextResponse.json({ data, meta: meta ?? {}, error: null });
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ data: null, error: { code: error.code, message: error.message, fields: error.fields ?? {} } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ data: null, error: { code: "VALIDATION_ERROR", message: "Input tidak valid", fields: error.flatten().fieldErrors } }, { status: 422 });
  }
  console.error("Unhandled API error", error);
  return NextResponse.json({ data: null, error: { code: "INTERNAL_ERROR", message: "Terjadi gangguan pada server" } }, { status: 500 });
}

export async function parseBody<T>(request: Request, validator: ZodType<T>) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Gunakan application/json");
  return validator.parse(await request.json());
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) throw new ApiError(403, "ORIGIN_DENIED", "Origin tidak diizinkan");
}
