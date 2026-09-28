import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/http";
import type { CheckoutInput, PosProductsQuery, SalesQuery } from "@/features/pos/schemas";

type Actor = { id: string; role: string; requestId: string };
type ProductRow = { id: string; part_code: string; name: string; unit: string; het: string; hpp: string; status: string; quantity: string };
const hundred = BigInt(100);
const thousand = BigInt(1000);
const halfThousand = BigInt(500);
const zero = BigInt(0);

const cents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * hundred + BigInt((fraction + "00").slice(0, 2));
};
const milli = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * thousand + BigInt((fraction + "000").slice(0, 3));
};
const formatMoney = (value: bigint) => `${value / hundred}.${(value % hundred).toString().padStart(2, "0")}`;
const roundLine = (unitPrice: bigint, amount: bigint) => (unitPrice * amount + halfThousand) / thousand;
const requestHash = (input: CheckoutInput) => crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");

export async function checkout(client: PoolClient, actor: Actor, input: CheckoutInput) {
  const hash = requestHash(input);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [input.idempotencyKey]);
  const existing = (await client.query<{ id: string; request_hash: string }>("SELECT id,request_hash FROM app.pos_sales WHERE idempotency_key=$1", [input.idempotencyKey])).rows[0];
  if (existing) {
    if (existing.request_hash !== hash) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Kunci idempotensi sudah dipakai untuk transaksi berbeda");
    return getSale(client, existing.id);
  }

  const register = (await client.query<{ id: string; warehouse_id: string; name: string }>(
    "SELECT id,warehouse_id,name FROM app.pos_registers WHERE id=$1 AND is_active=true FOR UPDATE",
    [input.registerId],
  )).rows[0];
  if (!register) throw new ApiError(404, "REGISTER_NOT_FOUND", "Register POS aktif tidak ditemukan");
  const cashier = (await client.query<{ display_name: string }>("SELECT display_name FROM app.users WHERE id=$1", [actor.id])).rows[0];
  if (!cashier) throw new ApiError(403, "FORBIDDEN", "Pengguna kasir tidak valid");

  if (input.customerId) {
    const customer = await client.query("SELECT 1 FROM app.customers WHERE id=$1 AND is_active=true", [input.customerId]);
    if (!customer.rowCount) throw new ApiError(422, "CUSTOMER_INVALID", "Pelanggan tidak aktif atau tidak ditemukan");
  }

  const productIds = input.items.map((item) => item.productId).sort();
  const lockedProducts = await client.query<Omit<ProductRow, "quantity">>(
    `SELECT p.id,p.part_code,p.name,p.unit,p.het::text,p.hpp::text,p.status
     FROM app.products p WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR UPDATE`,
    [productIds],
  );
  const balances = await client.query<{ product_id: string; quantity: string }>(
    `SELECT product_id,quantity::text FROM app.inventory_balances
     WHERE warehouse_id=$1 AND product_id=ANY($2::uuid[]) ORDER BY product_id FOR UPDATE`,
    [register.warehouse_id, productIds],
  );
  const quantities = new Map(balances.rows.map((balance) => [balance.product_id, balance.quantity]));
  const products = { rows: lockedProducts.rows.map((product) => ({ ...product, quantity: quantities.get(product.id) ?? "0" })) };
  if (products.rows.length !== productIds.length) throw new ApiError(422, "PRODUCT_NOT_FOUND", "Satu atau lebih produk tidak ditemukan");
  const productMap = new Map(products.rows.map((product) => [product.id, product]));

  let subtotal = zero;
  let discount = zero;
  const lines = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    if (product.status !== "active") throw new ApiError(409, "PRODUCT_INACTIVE", `${product.name} tidak aktif`);
    const requested = milli(item.quantity);
    if (milli(product.quantity) < requested) throw new ApiError(409, "INSUFFICIENT_STOCK", `Stok ${product.name} tidak mencukupi`);
    const lineSubtotal = roundLine(cents(product.het), requested);
    const lineDiscount = cents(item.discount);
    if (lineDiscount > lineSubtotal) throw new ApiError(422, "DISCOUNT_INVALID", `Diskon ${product.name} melebihi subtotal`);
    subtotal += lineSubtotal;
    discount += lineDiscount;
    return { product, quantity: item.quantity, discount: lineDiscount, lineTotal: lineSubtotal - lineDiscount };
  });
  const tax = cents(input.tax);
  const total = subtotal - discount + tax;
  if (discount > zero && actor.role !== "owner" && actor.role !== "admin") throw new ApiError(403, "DISCOUNT_PERMISSION_REQUIRED", "Diskon memerlukan otorisasi owner atau admin");
  if (total <= zero) throw new ApiError(422, "SALE_TOTAL_INVALID", "Total transaksi harus lebih dari nol");
  const paidAmount = input.payments.reduce((sum, payment) => sum + cents(payment.amount), zero);
  if (paidAmount < total) throw new ApiError(422, "PAYMENT_TOTAL_MISMATCH", "Jumlah pembayaran kurang dari total transaksi");
  if (paidAmount > total && !input.payments.some((payment) => payment.method === "cash")) {
    throw new ApiError(422, "PAYMENT_TOTAL_MISMATCH", "Pembayaran non-tunai tidak boleh melebihi total transaksi");
  }
  const nonCashAmount = input.payments.filter((payment) => payment.method !== "cash").reduce((sum, payment) => sum + cents(payment.amount), zero);
  if (nonCashAmount > total) throw new ApiError(422, "PAYMENT_TOTAL_MISMATCH", "Pembayaran non-tunai melebihi total transaksi");
  const paymentKeys = new Set(input.payments.map((payment) => payment.idempotencyKey));
  if (paymentKeys.size !== input.payments.length) throw new ApiError(422, "PAYMENT_KEY_DUPLICATE", "Kunci pembayaran tidak boleh duplikat");
  for (const paymentKey of [...paymentKeys].sort()) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`pos-payment:${paymentKey}`]);
  const usedPayment = await client.query("SELECT 1 FROM app.pos_sale_payments WHERE idempotency_key=ANY($1::text[]) LIMIT 1", [[...paymentKeys]]);
  if (usedPayment.rowCount) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Kunci idempotensi pembayaran sudah digunakan");

  const saleNumber = (await client.query<{ sale_number: string }>(
    `SELECT 'POS-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(nextval('app.pos_sale_number_seq')::text,8,'0') AS sale_number`,
  )).rows[0].sale_number;
  const sale = (await client.query<{ id: string }>(
    `INSERT INTO app.pos_sales(sale_number,register_id,warehouse_id,customer_id,cashier_id,cashier_name,subtotal,discount,tax,total,paid_amount,change_amount,notes,idempotency_key,request_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [saleNumber, register.id, register.warehouse_id, input.customerId ?? null, actor.id, cashier.display_name, formatMoney(subtotal), formatMoney(discount), formatMoney(tax), formatMoney(total), formatMoney(paidAmount), formatMoney(paidAmount - total), input.notes ?? null, input.idempotencyKey, hash],
  )).rows[0];

  for (const line of lines) {
    await client.query(
      `INSERT INTO app.pos_sale_items(sale_id,product_id,part_code,product_name,unit,quantity,unit_price,unit_cost,discount,line_total)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [sale.id, line.product.id, line.product.part_code, line.product.name, line.product.unit, line.quantity, line.product.het, line.product.hpp, formatMoney(line.discount), formatMoney(line.lineTotal)],
    );
    await client.query(
      `INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,reason,actor_id)
       VALUES($1,$2,'adjustment_out',$3,$4,'pos_sale',$5,$6,'Penjualan POS',$7)`,
      [register.warehouse_id, line.product.id, `-${line.quantity}`, line.product.hpp, sale.id, `${input.idempotencyKey}:${line.product.id}`, actor.id],
    );
  }
  for (const payment of input.payments) {
    await client.query(
      `INSERT INTO app.pos_sale_payments(sale_id,method,amount,reference,received_by,idempotency_key)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [sale.id, payment.method, payment.amount, payment.reference ?? null, actor.id, payment.idempotencyKey],
    );
  }
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "pos.sale.complete", entityType: "pos_sale", entityId: sale.id, after: { saleNumber, total: formatMoney(total), productIds } });
  return getSale(client, sale.id);
}

export async function listSales(client: PoolClient, input: SalesQuery) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (input.status) { values.push(input.status); conditions.push(`s.status=$${values.length}`); }
  if (input.query) { values.push(`%${input.query}%`); conditions.push(`(s.sale_number ILIKE $${values.length} OR c.name ILIKE $${values.length})`); }
  values.push(input.pageSize, (input.page - 1) * input.pageSize);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await client.query(
    `SELECT s.id,s.sale_number AS "saleNumber",s.status,c.name AS "customerName",s.cashier_name AS "cashierName",r.name AS "registerName",s.total::text,s.paid_amount::text AS "paidAmount",s.change_amount::text AS "changeAmount",s.completed_at AS "completedAt",s.voided_at AS "voidedAt"
     FROM app.pos_sales s JOIN app.pos_registers r ON r.id=s.register_id LEFT JOIN app.customers c ON c.id=s.customer_id
     ${where} ORDER BY s.completed_at DESC,s.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  const count = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM app.pos_sales s LEFT JOIN app.customers c ON c.id=s.customer_id ${where}`, values.slice(0, -2));
  return { items: rows.rows, total: Number(count.rows[0].count), page: input.page, pageSize: input.pageSize };
}

export async function listPosProducts(client: PoolClient, input: PosProductsQuery) {
  let warehouseId = input.warehouseId;
  if (input.registerId) {
    const register = (await client.query<{ warehouse_id: string }>("SELECT warehouse_id FROM app.pos_registers WHERE id=$1 AND is_active=true", [input.registerId])).rows[0];
    if (!register) throw new ApiError(404, "REGISTER_NOT_FOUND", "Register POS aktif tidak ditemukan");
    if (warehouseId && warehouseId !== register.warehouse_id) throw new ApiError(422, "REGISTER_WAREHOUSE_MISMATCH", "Gudang tidak sesuai dengan register POS");
    warehouseId = register.warehouse_id;
  }
  if (warehouseId) {
    const warehouse = await client.query("SELECT 1 FROM app.warehouses WHERE id=$1 AND is_active=true", [warehouseId]);
    if (!warehouse.rowCount) throw new ApiError(404, "WAREHOUSE_NOT_FOUND", "Gudang aktif tidak ditemukan");
  }
  const search = input.q ?? input.query;
  const values: unknown[] = [warehouseId ?? null];
  const conditions = ["p.status='active'"];
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(p.part_code ILIKE $${values.length} OR p.name ILIKE $${values.length} OR EXISTS (SELECT 1 FROM app.product_barcodes barcode_match WHERE barcode_match.product_id=p.id AND barcode_match.barcode ILIKE $${values.length}))`);
  }
  values.push(input.pageSize, (input.page - 1) * input.pageSize);
  const where = conditions.join(" AND ");
  const rows = await client.query<{ het: string; availableQuantity: string | null; totalCount: string }>(
    `SELECT p.id,p.part_code AS "partCode",p.name,p.het::text,p.unit,p.status,c.name AS category,
      COALESCE(array_agg(bc.barcode) FILTER (WHERE bc.barcode IS NOT NULL), '{}') AS barcodes,
      CASE WHEN $1::uuid IS NULL THEN NULL ELSE COALESCE(balance.quantity,0)::text END AS "availableQuantity",
      p.minimum_stock::text AS "minimumStock",count(*) OVER()::text AS "totalCount"
     FROM app.products p
     LEFT JOIN app.product_categories c ON c.id=p.category_id
     LEFT JOIN app.product_barcodes bc ON bc.product_id=p.id
     LEFT JOIN app.inventory_balances balance ON balance.product_id=p.id AND balance.warehouse_id=$1
     WHERE ${where}
     GROUP BY p.id,c.name,balance.quantity
     ORDER BY p.name,p.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    items: rows.rows.map((row) => {
      const { totalCount, ...product } = row;
      void totalCount;
      return { ...product, het: Number(row.het), availableQuantity: row.availableQuantity === null ? null : Number(row.availableQuantity) };
    }),
    page: input.page,
    pageSize: input.pageSize,
    total: Number(rows.rows[0]?.totalCount ?? 0),
    warehouseId: warehouseId ?? null,
  };
}

export async function getSale(client: PoolClient, id: string) {
  const sale = (await client.query(
    `SELECT s.id,s.sale_number AS "saleNumber",s.status,s.customer_id AS "customerId",c.name AS "customerName",c.phone AS "customerPhone",s.cashier_id AS "cashierId",s.cashier_name AS "cashierName",r.id AS "registerId",r.name AS "registerName",w.id AS "warehouseId",w.name AS "warehouseName",s.subtotal::text,s.discount::text,s.tax::text,s.total::text,s.paid_amount::text AS "paidAmount",s.change_amount::text AS "changeAmount",s.notes,s.completed_at AS "completedAt",s.voided_at AS "voidedAt",s.void_reason AS "voidReason"
     FROM app.pos_sales s JOIN app.pos_registers r ON r.id=s.register_id JOIN app.warehouses w ON w.id=s.warehouse_id LEFT JOIN app.customers c ON c.id=s.customer_id WHERE s.id=$1`,
    [id],
  )).rows[0];
  if (!sale) throw new ApiError(404, "SALE_NOT_FOUND", "Transaksi POS tidak ditemukan");
  const items = (await client.query(`SELECT id,product_id AS "productId",part_code AS "partCode",product_name AS "productName",unit,quantity::text,unit_price::text AS "unitPrice",discount::text,line_total::text AS "lineTotal" FROM app.pos_sale_items WHERE sale_id=$1 ORDER BY created_at,id`, [id])).rows;
  const payments = (await client.query(`SELECT id,method,amount::text,reference,received_at AS "receivedAt",reversed_at AS "reversedAt" FROM app.pos_sale_payments WHERE sale_id=$1 ORDER BY received_at,id`, [id])).rows;
  return { ...sale, items, payments };
}

export async function voidSale(client: PoolClient, actor: Actor, id: string, reason: string) {
  const sale = (await client.query<{ id: string; status: string; warehouse_id: string; sale_number: string }>("SELECT id,status,warehouse_id,sale_number FROM app.pos_sales WHERE id=$1 FOR UPDATE", [id])).rows[0];
  if (!sale) throw new ApiError(404, "SALE_NOT_FOUND", "Transaksi POS tidak ditemukan");
  if (sale.status !== "completed") throw new ApiError(409, "SALE_NOT_VOIDABLE", "Transaksi sudah dibatalkan");
  const items = await client.query<{ product_id: string; quantity: string; unit_cost: string }>("SELECT product_id,quantity::text,unit_cost::text FROM app.pos_sale_items WHERE sale_id=$1 ORDER BY product_id FOR UPDATE", [id]);
  await client.query("UPDATE app.pos_sales SET status='voided',voided_at=now(),voided_by=$1,void_reason=$2 WHERE id=$3", [actor.id, reason, id]);
  await client.query("UPDATE app.pos_sale_payments SET reversed_at=now(),reversed_by=$1,reversal_reason=$2 WHERE sale_id=$3 AND reversed_at IS NULL", [actor.id, reason, id]);
  for (const item of items.rows) {
    await client.query(
      `INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,reason,actor_id)
       VALUES($1,$2,'return_in',$3,$4,'pos_void',$5,$6,$7,$8)`,
      [sale.warehouse_id, item.product_id, item.quantity, item.unit_cost, id, `pos-void:${id}:${item.product_id}`, reason, actor.id],
    );
  }
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "pos.sale.void", entityType: "pos_sale", entityId: id, before: { status: "completed" }, after: { status: "voided", reason } });
  return getSale(client, id);
}
