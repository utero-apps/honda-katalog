import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.object({ orderNumber: z.string().min(3).max(80), vendorId: z.uuid(), expectedDate: z.string().date().optional(), notes: z.string().max(4000).optional(), items: z.array(z.object({ productId: z.uuid(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().min(0) })).min(1) });
export async function POST(request: NextRequest) { try { assertSameOrigin(request); const requestId = crypto.randomUUID(); const user = await requirePermission(request, requestId, "purchasing.write"); const body = await parseBody(request, input); const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => { const purchaseOrder = (await client.query("INSERT INTO app.purchase_orders(order_number,vendor_id,expected_date,notes,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,order_number AS \"orderNumber\",status", [body.orderNumber, body.vendorId, body.expectedDate || null, body.notes || null, user.id])).rows[0]; const items = []; for (const item of body.items) items.push((await client.query("INSERT INTO app.purchase_order_items(purchase_order_id,product_id,ordered_quantity,unit_price) VALUES($1,$2,$3,$4) RETURNING id,product_id AS \"productId\",ordered_quantity::text AS quantity", [purchaseOrder.id, item.productId, item.quantity, item.unitPrice])).rows[0]); return { ...purchaseOrder, items: items.map((item) => ({ ...item, quantity: Number(item.quantity) })) }; }); return ok(data, { requestId }); } catch (error) { return fail(error); } }
