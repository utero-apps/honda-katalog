import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { parseCatalogCsv } from "@/features/catalog/csv";
import { createProduct, updateProduct } from "@/features/catalog/service";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const inputSchema = z.object({ csv: z.string().min(1).max(10_000_000), mode: z.enum(["preview", "import"]).default("preview") });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "catalog.write");
    const input = await parseBody(request, inputSchema);
    const parsed = parseCatalogCsv(input.csv);
    if (input.mode === "preview") return ok(parsed, { requestId });
    if (parsed.errors.length) throw new ApiError(422, "CSV_INVALID", "CSV masih memiliki baris tidak valid");
    const result = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const categories = await client.query<{ id: string; name: string }>("SELECT id,name FROM app.product_categories WHERE is_active=true");
      const models = await client.query<{ id: string; name: string }>("SELECT id,name FROM app.vehicle_models WHERE is_active=true");
      const categoryMap = new Map(categories.rows.map((item) => [item.name.toLowerCase(), item.id]));
      const modelMap = new Map(models.rows.map((item) => [item.name.toLowerCase(), item.id]));
      let created = 0;
      let updated = 0;
      for (const row of parsed.rows) {
        const existing = await client.query<{ id: string }>("SELECT id FROM app.products WHERE canonical_code=upper(regexp_replace($1,'[^A-Za-z0-9]','','g'))", [row.partCode]);
        const data = { partCode: row.partCode, name: row.name, categoryId: categoryMap.get(row.category.toLowerCase()) ?? null, het: row.het, hpp: row.hpp, unit: "pcs", minimumStock: 0, status: row.status, description: null, barcodes: row.barcode ? [row.barcode] : [], compatibleModelIds: row.compatibleModels.map((name) => modelMap.get(name.toLowerCase())).filter((id): id is string => Boolean(id)) };
        if (existing.rows[0]) { await updateProduct(client, user.id, existing.rows[0].id, data); updated += 1; }
        else { await createProduct(client, user.id, data); created += 1; }
      }
      return { created, updated, total: parsed.rows.length };
    });
    return ok(result, { requestId });
  } catch (error) { return fail(error); }
}
