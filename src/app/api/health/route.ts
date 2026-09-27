import { ok, fail } from "@/server/http";
import { queryHealth } from "@/server/db";

export async function GET() {
  try {
    await queryHealth("SELECT 1");
    return ok({ status: "ok" });
  } catch (error) {
    return fail(error);
  }
}

export const dynamic = "force-dynamic";
