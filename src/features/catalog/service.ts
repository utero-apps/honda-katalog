import type { PoolClient } from "pg";
import { ApiError } from "@/server/http";
import type { CatalogQuery, ProductInput, ProductUpdate } from "@/features/catalog/schemas";

interface ProductRow {
  id: string;
  partCode: string;
  name: string;
  categoryId: string | null;
  category: string | null;
  het: string;
  hpp: string;
  unit: string;
  minimumStock: string;
  status: "active" | "inactive" | "archived";
  description: string | null;
  barcodes: string[];
  compatibleModels: string[];
  compatibleModelIds: string[];
  createdAt: string;
  updatedAt: string;
}

const productSelect = `
  SELECT p.id, p.part_code AS "partCode", p.name, p.category_id AS "categoryId",
    c.name AS category, p.het::text, p.hpp::text, p.unit,
    p.minimum_stock::text AS "minimumStock", p.status, p.description,
    COALESCE((SELECT array_agg(pb.barcode ORDER BY pb.is_primary DESC, pb.barcode)
      FROM app.product_barcodes pb WHERE pb.product_id=p.id), ARRAY[]::text[]) AS barcodes,
    COALESCE((SELECT array_agg(vm.name ORDER BY vm.name)
      FROM app.product_vehicle_compatibility pvc JOIN app.vehicle_models vm ON vm.id=pvc.vehicle_model_id
      WHERE pvc.product_id=p.id), ARRAY[]::text[]) AS "compatibleModels",
    COALESCE((SELECT array_agg(vm.id ORDER BY vm.name)
      FROM app.product_vehicle_compatibility pvc JOIN app.vehicle_models vm ON vm.id=pvc.vehicle_model_id
      WHERE pvc.product_id=p.id), ARRAY[]::uuid[]) AS "compatibleModelIds",
    p.created_at AS "createdAt", p.updated_at AS "updatedAt"
  FROM app.products p LEFT JOIN app.product_categories c ON c.id=p.category_id`;

const serializeProduct = (row: ProductRow) => ({
  ...row,
  het: Number(row.het),
  hpp: Number(row.hpp),
  minimumStock: Number(row.minimumStock),
});

export async function listProducts(client: PoolClient, input: CatalogQuery) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.query) {
    values.push(`%${input.query}%`);
    conditions.push(`(p.name ILIKE $${values.length} OR p.part_code ILIKE $${values.length} OR EXISTS (
      SELECT 1 FROM app.product_barcodes pb WHERE pb.product_id=p.id AND pb.barcode ILIKE $${values.length}
    ))`);
  }
  if (input.categoryId) {
    values.push(input.categoryId);
    conditions.push(`p.category_id=$${values.length}`);
  }
  if (input.status) {
    values.push(input.status);
    conditions.push(`p.status=$${values.length}`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  const count = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM app.products p${where}`, values);
  values.push(input.pageSize, (input.page - 1) * input.pageSize);
  const result = await client.query<ProductRow>(
    `${productSelect}${where} ORDER BY p.updated_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    items: result.rows.map(serializeProduct),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(count.rows[0]?.total ?? 0),
  };
}

export async function getProduct(client: PoolClient, id: string) {
  const result = await client.query<ProductRow>(`${productSelect} WHERE p.id=$1`, [id]);
  if (!result.rows[0]) throw new ApiError(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan");
  return serializeProduct(result.rows[0]);
}

async function replaceRelations(client: PoolClient, productId: string, barcodes: string[], modelIds: string[]) {
  await client.query("DELETE FROM app.product_barcodes WHERE product_id=$1", [productId]);
  await client.query("DELETE FROM app.product_vehicle_compatibility WHERE product_id=$1", [productId]);
  for (const [index, barcode] of [...new Set(barcodes)].entries()) {
    await client.query(
      "INSERT INTO app.product_barcodes(product_id,barcode,is_primary) VALUES($1,$2,$3)",
      [productId, barcode, index === 0],
    );
  }
  for (const modelId of new Set(modelIds)) {
    await client.query(
      "INSERT INTO app.product_vehicle_compatibility(product_id,vehicle_model_id) VALUES($1,$2)",
      [productId, modelId],
    );
  }
}

export async function createProduct(client: PoolClient, actorId: string, input: ProductInput) {
  const result = await client.query<{ id: string }>(`
    INSERT INTO app.products(part_code,name,category_id,het,hpp,unit,minimum_stock,status,description,created_by,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
    [input.partCode, input.name, input.categoryId ?? null, input.het, input.hpp, input.unit,
      input.minimumStock, input.status, input.description || null, actorId],
  );
  const productId = result.rows[0].id;
  await replaceRelations(client, productId, input.barcodes, input.compatibleModelIds);
  await client.query(`INSERT INTO app.product_prices(product_id,price_type,amount,created_by)
    VALUES($1,'het',$2,$4),($1,'hpp',$3,$4)`, [productId, input.het, input.hpp, actorId]);
  return getProduct(client, productId);
}

export async function updateProduct(client: PoolClient, actorId: string, id: string, input: ProductUpdate) {
  const current = await getProduct(client, id);
  const next = {
    partCode: input.partCode ?? current.partCode,
    name: input.name ?? current.name,
    categoryId: input.categoryId === undefined ? current.categoryId : input.categoryId,
    het: input.het ?? current.het,
    hpp: input.hpp ?? current.hpp,
    unit: input.unit ?? current.unit,
    minimumStock: input.minimumStock ?? current.minimumStock,
    status: input.status ?? current.status,
    description: input.description === undefined ? current.description : input.description,
  };
  await client.query(`UPDATE app.products SET part_code=$1,name=$2,category_id=$3,het=$4,hpp=$5,unit=$6,
    minimum_stock=$7,status=$8,description=$9,updated_by=$10,updated_at=now() WHERE id=$11`,
    [next.partCode, next.name, next.categoryId, next.het, next.hpp, next.unit, next.minimumStock,
      next.status, next.description || null, actorId, id],
  );
  if (input.barcodes || input.compatibleModelIds) {
    await replaceRelations(
      client,
      id,
      input.barcodes ?? current.barcodes,
      input.compatibleModelIds ?? current.compatibleModelIds,
    );
  }
  if (input.het !== undefined && input.het !== current.het) {
    await client.query("UPDATE app.product_prices SET ended_at=now() WHERE product_id=$1 AND price_type='het' AND ended_at IS NULL", [id]);
    await client.query("INSERT INTO app.product_prices(product_id,price_type,amount,created_by) VALUES($1,'het',$2,$3)", [id, input.het, actorId]);
  }
  if (input.hpp !== undefined && input.hpp !== current.hpp) {
    await client.query("UPDATE app.product_prices SET ended_at=now() WHERE product_id=$1 AND price_type='hpp' AND ended_at IS NULL", [id]);
    await client.query("INSERT INTO app.product_prices(product_id,price_type,amount,created_by) VALUES($1,'hpp',$2,$3)", [id, input.hpp, actorId]);
  }
  return getProduct(client, id);
}
