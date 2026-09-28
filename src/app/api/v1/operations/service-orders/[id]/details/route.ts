import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/permissions";
import { withActorTransaction } from "@/server/db";
import { ApiError, assertSameOrigin, fail, ok, parseBody } from "@/server/http";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("job"), name: z.string().min(2).max(300), description: z.string().max(2000).optional(), price: z.coerce.number().min(0), mechanicId: z.uuid().nullable().optional() }),
  z.object({ action: z.literal("reserve_part"), productId: z.uuid(), warehouseId: z.uuid(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().min(0), unitCost: z.coerce.number().min(0) }),
  z.object({ action: z.literal("consume_part"), partId: z.uuid(), idempotencyKey: z.string().min(8).max(200) }),
  z.object({ action: z.literal("quality_check"), passed: z.boolean(), notes: z.string().max(2000).optional() }),
  z.object({ action: z.literal("diagnosis"), diagnosis: z.string().min(2).max(4000), assignedMechanicId: z.uuid().nullable().optional() }),
]);

type DetailAction = z.infer<typeof input>["action"];
type LockedOrder = { status: string; approvedAt: string | null; assignedMechanicId: string | null; jobsOpen: number; partsUnconsumed: number };

const allowedStatuses: Record<DetailAction, readonly string[]> = {
  job: ["open", "assigned", "in_progress"],
  diagnosis: ["open", "assigned", "in_progress"],
  reserve_part: ["in_progress"],
  consume_part: ["in_progress"],
  quality_check: ["in_progress"],
};

async function lockAndValidateOrder(client: PoolClient, id: string, action: DetailAction, actor: { id: string; role: string }) {
  const order = (await client.query<LockedOrder>(
    `SELECT s.status,s.approved_at AS "approvedAt",s.assigned_mechanic_id AS "assignedMechanicId",
      (SELECT count(*)::int FROM app.service_order_jobs j WHERE j.service_order_id=s.id AND j.status<>'completed') AS "jobsOpen",
      (SELECT count(*)::int FROM app.service_order_parts p WHERE p.service_order_id=s.id AND p.consumed_at IS NULL) AS "partsUnconsumed"
     FROM app.service_orders s WHERE s.id=$1 FOR UPDATE`,
    [id],
  )).rows[0];
  if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
  if (actor.role === "mechanic" && order.assignedMechanicId !== actor.id) {
    throw new ApiError(403, "SERVICE_ORDER_NOT_ASSIGNED", "Mekanik hanya dapat memproses Service Order yang ditugaskan kepadanya");
  }
  if (!allowedStatuses[action].includes(order.status)) {
    throw new ApiError(409, "DETAIL_ACTION_NOT_ALLOWED", `Aksi ${action} tidak diizinkan pada status ${order.status}`);
  }
  if (action === "quality_check" && (!order.approvedAt || Number(order.jobsOpen) > 0 || Number(order.partsUnconsumed) > 0)) {
    throw new ApiError(409, "QC_NOT_READY", "Approval, seluruh job selesai, dan seluruh part terkonsumsi wajib sebelum QC");
  }
  return order;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestId = crypto.randomUUID();
    const user = await requirePermission(request, requestId, "service.read");
    const id = z.uuid().parse((await context.params).id);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const order = (await client.query(
        "SELECT s.*,c.name AS customer,v.plate_number AS plate FROM app.service_orders s JOIN app.customers c ON c.id=s.customer_id JOIN app.customer_vehicles v ON v.id=s.vehicle_id WHERE s.id=$1", [id],
      )).rows[0];
      if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
      const jobs = await client.query("SELECT * FROM app.service_order_jobs WHERE service_order_id=$1 ORDER BY created_at", [id]);
      const parts = await client.query("SELECT sp.*,p.part_code,p.name FROM app.service_order_parts sp JOIN app.products p ON p.id=sp.product_id WHERE sp.service_order_id=$1", [id]);
      const history = await client.query("SELECT * FROM app.service_order_status_history WHERE service_order_id=$1 ORDER BY created_at", [id]);
      const qualityCheck = await client.query("SELECT * FROM app.quality_checks WHERE service_order_id=$1", [id]);
      return { order, jobs: jobs.rows, parts: parts.rows, history: history.rows, qualityCheck: qualityCheck.rows[0] || null };
    });
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const requestId = crypto.randomUUID();
    const id = z.uuid().parse((await context.params).id);
    const body = await parseBody(request, input);
    const permission = body.action === "consume_part" || body.action === "reserve_part" ? "inventory.adjust" : body.action === "quality_check" ? "service.complete" : "service.create";
    const user = await requirePermission(request, requestId, permission);
    const data = await withActorTransaction({ userId: user.id, role: user.role, requestId }, async (client) => {
      const order = await lockAndValidateOrder(client, id, body.action, user);
      if (body.action === "job") {
        return (await client.query(
          "INSERT INTO app.service_order_jobs(service_order_id,name,description,price,mechanic_id,status) VALUES($1,$2,$3,$4,$5,'open') RETURNING id",
          [id, body.name, body.description || null, body.price, body.mechanicId || null],
        )).rows[0];
      }
      if (body.action === "diagnosis") {
        const nextStatus = body.assignedMechanicId && order.status === "open" ? "assigned" : order.status;
        const row = (await client.query(
          "UPDATE app.service_orders SET diagnosis=$1,assigned_mechanic_id=$2,status=$3,updated_by=$4,updated_at=now() WHERE id=$5 RETURNING id,status",
          [body.diagnosis, body.assignedMechanicId || null, nextStatus, user.id, id],
        )).rows[0];
        if (nextStatus !== order.status) await client.query(
          "INSERT INTO app.service_order_status_history(service_order_id,from_status,to_status,reason,actor_id) VALUES($1,$2,$3,$4,$5)",
          [id, order.status, nextStatus, "Mekanik ditugaskan", user.id],
        );
        return row;
      }
      if (body.action === "quality_check") {
        return (await client.query(
          "INSERT INTO app.quality_checks(service_order_id,checked_by,passed,notes) VALUES($1,$2,$3,$4) ON CONFLICT(service_order_id) DO UPDATE SET checked_by=excluded.checked_by,passed=excluded.passed,notes=excluded.notes,checked_at=now() RETURNING id,passed",
          [id, user.id, body.passed, body.notes || null],
        )).rows[0];
      }
      if (body.action === "reserve_part") {
        const balance = (await client.query<{ quantity: string; reserved_quantity: string }>(
          "SELECT quantity::text,reserved_quantity::text FROM app.inventory_balances WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE", [body.warehouseId, body.productId],
        )).rows[0];
        if (!balance || Number(balance.quantity) - Number(balance.reserved_quantity) < body.quantity) {
          throw new ApiError(409, "INSUFFICIENT_AVAILABLE_STOCK", "Stok tersedia tidak cukup");
        }
        await client.query("UPDATE app.inventory_balances SET reserved_quantity=reserved_quantity+$1,updated_at=now() WHERE warehouse_id=$2 AND product_id=$3", [body.quantity, body.warehouseId, body.productId]);
        return (await client.query(
          "INSERT INTO app.service_order_parts(service_order_id,product_id,warehouse_id,quantity,unit_price,unit_cost) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(service_order_id,product_id,warehouse_id) DO UPDATE SET quantity=app.service_order_parts.quantity+excluded.quantity RETURNING id",
          [id, body.productId, body.warehouseId, body.quantity, body.unitPrice, body.unitCost],
        )).rows[0];
      }
      const part = (await client.query<{ warehouse_id: string; product_id: string; quantity: string; unit_cost: string; consumed_at: string | null }>(
        "SELECT warehouse_id,product_id,quantity::text,unit_cost::text,consumed_at::text FROM app.service_order_parts WHERE id=$1 AND service_order_id=$2 FOR UPDATE", [body.partId, id],
      )).rows[0];
      if (!part) throw new ApiError(404, "SERVICE_PART_NOT_FOUND", "Part service tidak ditemukan");
      if (part.consumed_at) return { partId: body.partId, alreadyConsumed: true };
      await client.query(
        "INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,actor_id) VALUES($1,$2,'service_usage',$3,$4,'service_order',$5,$6,$7)",
        [part.warehouse_id, part.product_id, -Number(part.quantity), part.unit_cost, id, body.idempotencyKey, user.id],
      );
      await client.query("UPDATE app.inventory_balances SET reserved_quantity=greatest(reserved_quantity-$1,0) WHERE warehouse_id=$2 AND product_id=$3", [part.quantity, part.warehouse_id, part.product_id]);
      await client.query("UPDATE app.service_order_parts SET consumed_at=now() WHERE id=$1", [body.partId]);
      return { partId: body.partId, consumed: true };
    });
    return ok(data, { requestId });
  } catch (error) { return fail(error); }
}
