import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { recordAudit } from "@/server/audit";
import { ApiError } from "@/server/http";
import type { InvoiceInput, WorkflowActionInput } from "@/features/service-orders/schemas";

type Actor = { id: string; role: string; requestId: string };
type OrderRow = { id: string; status: string; customer_id: string; assigned_mechanic_id: string | null; approved_at: string | null; diagnosis: string | null };

async function lockOrder(client: PoolClient, id: string) {
  const order = (await client.query<OrderRow>(
    "SELECT id,status,customer_id,assigned_mechanic_id,approved_at,diagnosis FROM app.service_orders WHERE id=$1 FOR UPDATE",
    [id],
  )).rows[0];
  if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
  if (order.status === "cancelled" || order.status === "completed") throw new ApiError(409, "SERVICE_ORDER_CLOSED", "Service order sudah ditutup");
  return order;
}

async function transition(client: PoolClient, actor: Actor, order: OrderRow, next: string, reason: string) {
  if (order.status === next) return;
  await client.query("UPDATE app.service_orders SET status=$1,updated_by=$2,updated_at=now() WHERE id=$3", [next, actor.id, order.id]);
  await client.query(
    "INSERT INTO app.service_order_status_history(service_order_id,from_status,to_status,reason,actor_id) VALUES($1,$2,$3,$4,$5)",
    [order.id, order.status, next, reason, actor.id],
  );
  order.status = next;
}

async function ensureMechanic(client: PoolClient, mechanicId: string) {
  const mechanic = await client.query("SELECT 1 FROM app.mechanics WHERE user_id=$1 AND is_active=true", [mechanicId]);
  if (!mechanic.rowCount) throw new ApiError(422, "MECHANIC_INVALID", "Mekanik aktif tidak ditemukan");
}

async function workflowReadiness(client: PoolClient, orderId: string) {
  const result = await client.query<{
    jobs_open: string; parts_unconsumed: string; qc_passed: boolean | null; invoice_id: string | null; invoice_status: string | null; total: string | null; paid: string;
  }>(
    `SELECT
      (SELECT count(*)::text FROM app.service_order_jobs WHERE service_order_id=$1 AND status<>'completed') AS jobs_open,
      (SELECT count(*)::text FROM app.service_order_parts WHERE service_order_id=$1 AND consumed_at IS NULL) AS parts_unconsumed,
      (SELECT passed FROM app.quality_checks WHERE service_order_id=$1) AS qc_passed,
      i.id AS invoice_id,i.status AS invoice_status,i.total::text,
      COALESCE((SELECT sum(p.amount) FROM app.payments p WHERE p.customer_invoice_id=i.id AND p.reversed_at IS NULL),0)::text AS paid
     FROM app.service_orders s LEFT JOIN app.customer_invoices i ON i.service_order_id=s.id WHERE s.id=$1`,
    [orderId],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
  const total = Number(row.total ?? 0);
  const paid = Number(row.paid);
  return {
    jobsOpen: Number(row.jobs_open),
    partsUnconsumed: Number(row.parts_unconsumed),
    qualityPassed: row.qc_passed === true,
    invoiceId: row.invoice_id,
    invoiceStatus: row.invoice_status,
    total,
    paid,
    outstanding: Math.max(total - paid, 0),
    paymentReady: Boolean(row.invoice_id) && total > 0 && paid < total,
    handoverReady: row.qc_passed === true && Boolean(row.invoice_id) && paid >= total && row.invoice_status !== "reversed",
  };
}

export function canHandover(orderStatus: string, readiness: { handoverReady: boolean; outstanding: number }) {
  return orderStatus === "paid" && readiness.handoverReady && readiness.outstanding <= 0;
}

export async function getWorkflow(client: PoolClient, id: string) {
  const order = (await client.query(
    `SELECT s.id,s.order_number AS "orderNumber",s.status,s.complaint,s.diagnosis,s.odometer::text AS odometer,s.opened_at AS "openedAt",s.updated_at AS "updatedAt",
      s.assigned_mechanic_id AS "assignedMechanicId",s.approved_at AS "approvedAt",s.approved_by AS "approvedBy",s.approval_notes AS "approvalNotes",
      s.target_completion_at AS "targetCompletionAt",s.handed_over_at AS "handedOverAt",s.handed_over_by AS "handedOverBy",
      s.handover_recipient_name AS "handoverRecipientName",s.handover_signature_reference AS "handoverSignatureReference",s.handover_notes AS "handoverNotes",
      c.id AS "customerId",c.name AS "customerName",c.phone AS "customerPhone",v.id AS "vehicleId",v.plate_number AS "plateNumber",v.image_url AS "imageUrl",vm.name AS model,
      assigned_user.display_name AS "assignedMechanicName"
     FROM app.service_orders s JOIN app.customers c ON c.id=s.customer_id JOIN app.customer_vehicles v ON v.id=s.vehicle_id
     LEFT JOIN app.vehicle_models vm ON vm.id=v.vehicle_model_id LEFT JOIN app.users assigned_user ON assigned_user.id=s.assigned_mechanic_id WHERE s.id=$1`,
    [id],
  )).rows[0];
  if (!order) throw new ApiError(404, "SERVICE_ORDER_NOT_FOUND", "Service order tidak ditemukan");
  const jobs = await client.query(`SELECT id,name,description,price::text AS price,mechanic_id AS "mechanicId",status,created_at AS "createdAt" FROM app.service_order_jobs WHERE service_order_id=$1 ORDER BY created_at,id`, [id]);
  const parts = await client.query(`SELECT sp.id,sp.product_id AS "productId",p.part_code AS "partCode",p.name,p.unit,sp.warehouse_id AS "warehouseId",sp.quantity::text AS quantity,sp.unit_price::text AS "unitPrice",sp.unit_cost::text AS "unitCost",sp.consumed_at AS "consumedAt",sp.created_at AS "createdAt" FROM app.service_order_parts sp JOIN app.products p ON p.id=sp.product_id WHERE sp.service_order_id=$1 ORDER BY sp.created_at,sp.id`, [id]);
  const qualityCheck = await client.query(`SELECT id,checked_by AS "checkedBy",passed,notes,checked_at AS "checkedAt" FROM app.quality_checks WHERE service_order_id=$1`, [id]);
  const history = await client.query(`SELECT h.id,h.from_status AS "fromStatus",h.to_status AS status,h.to_status AS label,h.reason AS notes,h.actor_id AS "actorId",u.display_name AS "actorName",h.created_at AS "occurredAt",h.created_at AS "createdAt" FROM app.service_order_status_history h LEFT JOIN app.users u ON u.id=h.actor_id WHERE h.service_order_id=$1 ORDER BY h.created_at,h.id`, [id]);
  const mechanics = await client.query(`SELECT m.user_id AS id,u.display_name AS name,(SELECT count(*)::int FROM app.service_orders active WHERE active.assigned_mechanic_id=m.user_id AND active.status IN ('assigned','in_progress','quality_check')) AS workload FROM app.mechanics m JOIN app.users u ON u.id=m.user_id WHERE m.is_active=true AND u.is_active=true ORDER BY workload,u.display_name`, []);
  const evidence = await client.query(`SELECT e.id,e.evidence_type AS "evidenceType",e.job_id AS "jobId",e.url,e.notes,e.uploaded_by AS "uploadedBy",u.display_name AS "uploadedByName",e.created_at AS "createdAt" FROM app.service_order_evidence e LEFT JOIN app.users u ON u.id=e.uploaded_by WHERE e.service_order_id=$1 ORDER BY e.created_at,e.id`, [id]);
  const repeatRepair = await client.query(`SELECT EXISTS(SELECT 1 FROM app.service_orders previous WHERE previous.vehicle_id=$1 AND previous.id<>$2 AND previous.status='completed' AND previous.completed_at>=now()-interval '30 days') AS repeated`, [order.vehicleId, id]);
  const readiness = await workflowReadiness(client, id);
  const invoice = readiness.invoiceId ? (await client.query(
    `SELECT id,invoice_number AS "invoiceNumber",status,total::text,issued_at AS "issuedAt",due_at AS "dueAt" FROM app.customer_invoices WHERE id=$1`,
    [readiness.invoiceId],
  )).rows[0] : null;
  const payments = readiness.invoiceId ? (await client.query(
    `SELECT id,payment_number AS "paymentNumber",method,amount::text,reference,paid_at AS "paidAt" FROM app.payments WHERE customer_invoice_id=$1 AND reversed_at IS NULL ORDER BY paid_at,id`,
    [readiness.invoiceId],
  )).rows : [];
  const jobItems = jobs.rows.map((job) => ({ ...job, quantity: 1, unit: "jasa", price: Number(job.price), subtotal: Number(job.price) }));
  const partItems = parts.rows.map((part) => ({ ...part, quantity: Number(part.quantity), price: Number(part.unitPrice), unitPrice: Number(part.unitPrice), unitCost: Number(part.unitCost), subtotal: Number(part.quantity) * Number(part.unitPrice) }));
  const labor = jobItems.reduce((total, job) => total + job.subtotal, 0);
  const partTotal = partItems.reduce((total, part) => total + part.subtotal, 0);
  const qc = qualityCheck.rows[0] as { passed?: boolean; notes?: string | null; checkedBy?: string | null; checkedAt?: string | null } | undefined;
  return {
    ...order,
    odometer: order.odometer === null ? null : Number(order.odometer),
    customer: { id: order.customerId, name: order.customerName, phone: order.customerPhone },
    vehicle: { id: order.vehicleId, plateNumber: order.plateNumber, model: order.model, odometer: order.odometer === null ? null : Number(order.odometer), imageUrl: order.imageUrl ?? null },
    diagnosis: order.diagnosis ? { notes: order.diagnosis, findings: order.diagnosis, estimatedTotal: labor + partTotal, updatedAt: order.updatedAt } : null,
    mechanics: mechanics.rows,
    jobs: jobItems,
    parts: partItems,
    estimate: { labor, parts: partTotal, total: labor + partTotal, approvedAt: order.approvedAt, notes: order.approvalNotes },
    qualityCheck: qualityCheck.rows[0] ?? null,
    qualityControl: qc ? { status: qc.passed ? "passed" : "rework", notes: qc.notes ?? null, checkedBy: qc.checkedBy ?? null, checkedAt: qc.checkedAt ?? null } : null,
    invoice: invoice ? { ...invoice, total: Number(invoice.total), paidAmount: readiness.paid, outstandingAmount: readiness.outstanding, payments: payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })) } : null,
    handover: { status: order.handedOverAt ? "handed_over" : "pending", recipientName: order.handoverRecipientName, signatureReference: order.handoverSignatureReference, notes: order.handoverNotes, handedOverAt: order.handedOverAt },
    timeline: history.rows,
    history: history.rows,
    evidence: evidence.rows,
    sla: { targetCompletionAt: order.targetCompletionAt, overdue: Boolean(order.targetCompletionAt && !order.handedOverAt && new Date(order.targetCompletionAt).getTime() < Date.now()) },
    repeatRepair: Boolean(repeatRepair.rows[0]?.repeated),
    readiness,
  };
}

export async function executeWorkflow(client: PoolClient, actor: Actor, orderId: string, input: WorkflowActionInput) {
  const order = await lockOrder(client, orderId);
  let result: unknown;
  if (input.action === "diagnosis") {
    if (["invoiced", "paid"].includes(order.status)) throw new ApiError(409, "DIAGNOSIS_LOCKED", "Diagnosis tidak dapat diubah setelah invoice");
    const diagnosis = input.diagnosis ?? input.findings!;
    await client.query("UPDATE app.service_orders SET diagnosis=$1,updated_by=$2,updated_at=now() WHERE id=$3", [diagnosis, actor.id, order.id]);
    result = { diagnosis };
  } else if (input.action === "approve") {
    if (!order.diagnosis || !order.assigned_mechanic_id || !["assigned", "open"].includes(order.status)) throw new ApiError(409, "APPROVAL_NOT_READY", "Diagnosis dan assignment mekanik wajib sebelum approval");
    await client.query("UPDATE app.service_orders SET approved_at=now(),approved_by=$1,approval_notes=$2,updated_by=$1,updated_at=now() WHERE id=$3", [actor.id, input.notes ?? null, order.id]);
    result = { approved: true };
  } else if (input.action === "assign") {
    if (!["open", "assigned"].includes(order.status)) throw new ApiError(409, "ASSIGNMENT_NOT_ALLOWED", "Mekanik tidak dapat diubah pada status ini");
    if (order.approved_at) throw new ApiError(409, "ASSIGNMENT_APPROVED", "Assignment terkunci setelah approval");
    await ensureMechanic(client, input.mechanicId);
    await client.query("UPDATE app.service_orders SET assigned_mechanic_id=$1,updated_by=$2,updated_at=now() WHERE id=$3", [input.mechanicId, actor.id, order.id]);
    await transition(client, actor, order, "assigned", "Mekanik ditugaskan");
    result = { mechanicId: input.mechanicId };
  } else if (input.action === "start") {
    if (order.status !== "assigned" || !order.approved_at) throw new ApiError(409, "WORK_NOT_APPROVED", "Approval dan assignment wajib sebelum pekerjaan dimulai");
    await transition(client, actor, order, "in_progress", "Pekerjaan dimulai");
    result = { started: true };
  } else if (input.action === "set_target_completion") {
    if (["invoiced", "paid"].includes(order.status)) throw new ApiError(409, "SLA_LOCKED", "Target selesai tidak dapat diubah setelah invoice");
    await client.query("UPDATE app.service_orders SET target_completion_at=$1,updated_by=$2,updated_at=now() WHERE id=$3", [input.targetCompletionAt, actor.id, order.id]);
    result = { targetCompletionAt: input.targetCompletionAt };
  } else if (input.action === "add_job") {
    if (!["assigned", "in_progress"].includes(order.status)) throw new ApiError(409, "JOB_NOT_ALLOWED", "Job hanya dapat ditambahkan sebelum QC");
    if (input.mechanicId) await ensureMechanic(client, input.mechanicId);
    result = (await client.query(
      `INSERT INTO app.service_order_jobs(service_order_id,name,description,price,mechanic_id,status)
       VALUES($1,$2,$3,$4,$5,'open') RETURNING id`,
      [order.id, input.name, input.description ?? null, input.price, input.mechanicId ?? order.assigned_mechanic_id],
    )).rows[0];
  } else if (input.action === "complete_job") {
    if (order.status !== "in_progress") throw new ApiError(409, "JOB_NOT_ALLOWED", "Job hanya dapat diselesaikan saat pekerjaan berjalan");
    const changed = await client.query("UPDATE app.service_order_jobs SET status='completed' WHERE id=$1 AND service_order_id=$2 AND status<>'completed' RETURNING id", [input.jobId, order.id]);
    if (!changed.rowCount) throw new ApiError(404, "SERVICE_JOB_NOT_FOUND", "Job aktif tidak ditemukan");
    result = { jobId: input.jobId, completed: true };
  } else if (input.action === "reserve_part") {
    if (order.status !== "in_progress") throw new ApiError(409, "PART_NOT_ALLOWED", "Part hanya dapat dipesan saat pekerjaan berjalan");
    const product = await client.query("SELECT 1 FROM app.products WHERE id=$1 AND status='active'", [input.productId]);
    if (!product.rowCount) throw new ApiError(422, "PRODUCT_INVALID", "Produk aktif tidak ditemukan");
    const balance = (await client.query<{ quantity: string; reserved_quantity: string }>("SELECT quantity::text,reserved_quantity::text FROM app.inventory_balances WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE", [input.warehouseId, input.productId])).rows[0];
    if (!balance || Number(balance.quantity) - Number(balance.reserved_quantity) < input.quantity) throw new ApiError(409, "INSUFFICIENT_AVAILABLE_STOCK", "Stok tersedia tidak cukup");
    await client.query("UPDATE app.inventory_balances SET reserved_quantity=reserved_quantity+$1,updated_at=now() WHERE warehouse_id=$2 AND product_id=$3", [input.quantity, input.warehouseId, input.productId]);
    result = (await client.query(
      `INSERT INTO app.service_order_parts(service_order_id,product_id,warehouse_id,quantity,unit_price,unit_cost)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(service_order_id,product_id,warehouse_id) DO UPDATE SET quantity=app.service_order_parts.quantity+EXCLUDED.quantity
       RETURNING id`,
      [order.id, input.productId, input.warehouseId, input.quantity, input.unitPrice, input.unitCost],
    )).rows[0];
  } else if (input.action === "add_part") {
    if (order.status !== "in_progress") throw new ApiError(409, "PART_NOT_ALLOWED", "Part hanya dapat ditambahkan saat pekerjaan berjalan");
    const product = input.productId
      ? (await client.query<{ id: string; hpp: string }>(
          "SELECT id,hpp::text FROM app.products WHERE id=$1 AND status='active' FOR SHARE",
          [input.productId],
        )).rows
      : (await client.query<{ id: string; hpp: string }>(
          "SELECT id,hpp::text FROM app.products WHERE status='active' AND (part_code ILIKE $1 OR name ILIKE $1) ORDER BY id LIMIT 2 FOR SHARE",
          [input.name],
        )).rows;
    if (product.length !== 1) throw new ApiError(422, "PRODUCT_AMBIGUOUS", "Pilih kode part yang tepat dari katalog");
    const warehouse = (await client.query<{ warehouse_id: string }>(
      `SELECT warehouse_id FROM app.inventory_balances WHERE product_id=$1 AND quantity-reserved_quantity >= $2 ORDER BY quantity-reserved_quantity DESC,warehouse_id LIMIT 1 FOR UPDATE`,
      [product[0].id, input.quantity],
    )).rows[0];
    if (!warehouse) throw new ApiError(409, "INSUFFICIENT_AVAILABLE_STOCK", "Stok tersedia tidak cukup");
    await client.query("UPDATE app.inventory_balances SET reserved_quantity=reserved_quantity+$1,updated_at=now() WHERE warehouse_id=$2 AND product_id=$3", [input.quantity, warehouse.warehouse_id, product[0].id]);
    result = (await client.query(
      `INSERT INTO app.service_order_parts(service_order_id,product_id,warehouse_id,quantity,unit_price,unit_cost)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(service_order_id,product_id,warehouse_id) DO UPDATE SET quantity=app.service_order_parts.quantity+EXCLUDED.quantity
       RETURNING id`,
      [order.id, product[0].id, warehouse.warehouse_id, input.quantity, input.price, product[0].hpp],
    )).rows[0];
  } else if (input.action === "consume_part") {
    if (order.status !== "in_progress") throw new ApiError(409, "PART_NOT_ALLOWED", "Part hanya dapat dikonsumsi saat pekerjaan berjalan");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`service-part:${input.idempotencyKey}`]);
    const part = (await client.query<{ id: string; warehouse_id: string; product_id: string; quantity: string; unit_cost: string; consumed_at: string | null }>(
      "SELECT id,warehouse_id,product_id,quantity::text,unit_cost::text,consumed_at FROM app.service_order_parts WHERE id=$1 AND service_order_id=$2 FOR UPDATE",
      [input.partId, order.id],
    )).rows[0];
    if (!part) throw new ApiError(404, "SERVICE_PART_NOT_FOUND", "Part service tidak ditemukan");
    if (part.consumed_at) result = { partId: part.id, alreadyConsumed: true };
    else {
      await client.query(
        `INSERT INTO app.stock_movements(warehouse_id,product_id,movement_type,quantity,unit_cost,reference_type,reference_id,idempotency_key,reason,actor_id)
         VALUES($1,$2,'service_usage',$3,$4,'service_order',$5,$6,'Pemakaian part service',$7)`,
        [part.warehouse_id, part.product_id, -Number(part.quantity), part.unit_cost, order.id, input.idempotencyKey, actor.id],
      );
      await client.query("UPDATE app.inventory_balances SET reserved_quantity=greatest(reserved_quantity-$1,0),updated_at=now() WHERE warehouse_id=$2 AND product_id=$3", [part.quantity, part.warehouse_id, part.product_id]);
      await client.query("UPDATE app.service_order_parts SET consumed_at=now() WHERE id=$1", [part.id]);
      result = { partId: part.id, consumed: true };
    }
  } else if (input.action === "quality_check") {
    if (order.status !== "in_progress") throw new ApiError(409, "QC_NOT_ALLOWED", "QC hanya dapat dilakukan setelah pekerjaan berjalan");
    const readiness = await workflowReadiness(client, order.id);
    if (readiness.jobsOpen > 0 || readiness.partsUnconsumed > 0) throw new ApiError(409, "QC_NOT_READY", "Semua job dan part wajib diselesaikan sebelum QC");
    await client.query(
      `INSERT INTO app.quality_checks(service_order_id,checked_by,passed,notes) VALUES($1,$2,$3,$4)
       ON CONFLICT(service_order_id) DO UPDATE SET checked_by=EXCLUDED.checked_by,passed=EXCLUDED.passed,notes=EXCLUDED.notes,checked_at=now()`,
      [order.id, actor.id, input.passed, input.notes ?? null],
    );
    if (input.passed) await transition(client, actor, order, "quality_check", "QC lulus");
    result = { passed: input.passed };
  } else if (input.action === "add_evidence") {
    if (["invoiced", "paid"].includes(order.status)) throw new ApiError(409, "EVIDENCE_LOCKED", "Evidence terkunci setelah invoice");
    if (input.jobId) {
      const job = await client.query("SELECT 1 FROM app.service_order_jobs WHERE id=$1 AND service_order_id=$2", [input.jobId, order.id]);
      if (!job.rowCount) throw new ApiError(422, "SERVICE_JOB_INVALID", "Job tidak terdaftar pada service order ini");
    }
    result = (await client.query(
      `INSERT INTO app.service_order_evidence(service_order_id,job_id,evidence_type,url,notes,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id,evidence_type AS "evidenceType",url`,
      [order.id, input.jobId ?? null, input.evidenceType, input.url, input.notes ?? null, actor.id],
    )).rows[0];
  } else {
    const readiness = await workflowReadiness(client, order.id);
    if (!canHandover(order.status, readiness)) throw new ApiError(409, "HANDOVER_NOT_READY", "QC lulus dan invoice lunas wajib sebelum handover");
    await client.query("UPDATE app.service_orders SET handed_over_at=now(),handed_over_by=$1,handover_recipient_name=$2,handover_signature_reference=$3,handover_notes=$4,completed_at=now(),updated_by=$1,updated_at=now() WHERE id=$5", [actor.id, input.recipientName, input.signatureReference ?? null, input.notes ?? null, order.id]);
    await transition(client, actor, order, "completed", "Motor diserahkan kepada pelanggan");
    result = { handedOver: true };
  }
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: `service_order.workflow.${input.action}`, entityType: "service_order", entityId: order.id, after: result });
  return getWorkflow(client, order.id);
}

export async function getInvoiceReadiness(client: PoolClient, orderId: string) {
  const order = await lockOrder(client, orderId);
  const readiness = await workflowReadiness(client, order.id);
  return { serviceOrderId: order.id, status: order.status, approved: Boolean(order.approved_at), ...readiness, invoiceReady: order.status === "quality_check" && readiness.qualityPassed && readiness.jobsOpen === 0 && readiness.partsUnconsumed === 0 && !readiness.invoiceId };
}

export async function createServiceInvoice(client: PoolClient, actor: Actor, orderId: string, input: Extract<InvoiceInput, { action: "create" }>) {
  const order = await lockOrder(client, orderId);
  const existing = await client.query("SELECT id,invoice_number AS \"invoiceNumber\",total::text,status FROM app.customer_invoices WHERE service_order_id=$1", [order.id]);
  if (existing.rows[0]) return { ...existing.rows[0], total: Number(existing.rows[0].total), existing: true };
  const readiness = await workflowReadiness(client, order.id);
  if (order.status !== "quality_check" || !order.approved_at || !readiness.qualityPassed || readiness.jobsOpen > 0 || readiness.partsUnconsumed > 0) {
    throw new ApiError(409, "INVOICE_NOT_READY", "QC lulus, approval, job selesai, dan part terkonsumsi wajib sebelum invoice");
  }
  const jobs = await client.query<{ id: string; name: string; price: string }>("SELECT id,name,price::text FROM app.service_order_jobs WHERE service_order_id=$1 ORDER BY created_at,id", [order.id]);
  const parts = await client.query<{ id: string; name: string; quantity: string; unit_price: string }>("SELECT sp.id,p.name,sp.quantity::text,sp.unit_price::text FROM app.service_order_parts sp JOIN app.products p ON p.id=sp.product_id WHERE sp.service_order_id=$1 ORDER BY sp.created_at,sp.id", [order.id]);
  const subtotal = jobs.rows.reduce((total, job) => total + Number(job.price), 0) + parts.rows.reduce((total, part) => total + Number(part.quantity) * Number(part.unit_price), 0);
  if (input.discount > subtotal) throw new ApiError(422, "DISCOUNT_INVALID", "Diskon melebihi subtotal");
  const invoiceNumber = (await client.query<{ number: string }>("SELECT 'SINV-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(nextval('app.service_invoice_number_seq')::text,8,'0') AS number")).rows[0].number;
  const invoice = (await client.query<{ id: string; invoiceNumber: string; total: string }>(
    `INSERT INTO app.customer_invoices(invoice_number,service_order_id,customer_id,status,subtotal,discount,tax,issued_at,due_at,created_by)
     VALUES($1,$2,$3,'posted',$4,$5,$6,now(),$7,$8)
     RETURNING id,invoice_number AS "invoiceNumber",total::text`,
    [invoiceNumber, order.id, order.customer_id, subtotal, input.discount, input.tax, input.dueAt ?? null, actor.id],
  )).rows[0];
  for (const job of jobs.rows) await client.query("INSERT INTO app.customer_invoice_items(invoice_id,item_type,reference_id,description,quantity,unit_price) VALUES($1,'service',$2,$3,1,$4)", [invoice.id, job.id, job.name, job.price]);
  for (const part of parts.rows) await client.query("INSERT INTO app.customer_invoice_items(invoice_id,item_type,reference_id,description,quantity,unit_price) VALUES($1,'product',$2,$3,$4,$5)", [invoice.id, part.id, part.name, part.quantity, part.unit_price]);
  await transition(client, actor, order, "invoiced", "Invoice diterbitkan");
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_order.invoice.create", entityType: "customer_invoice", entityId: invoice.id, after: { serviceOrderId: order.id, invoiceNumber, total: invoice.total } });
  return { ...invoice, total: Number(invoice.total), existing: false };
}

export async function recordServiceInvoicePayment(client: PoolClient, actor: Actor, orderId: string, input: Extract<InvoiceInput, { action: "record_payment" }>) {
  const order = await lockOrder(client, orderId);
  if (!["invoiced", "paid"].includes(order.status)) throw new ApiError(409, "PAYMENT_NOT_READY", "Service order belum memiliki invoice aktif");
  const invoice = (await client.query<{ id: string; status: string; total: string }>(
    "SELECT id,status,total::text FROM app.customer_invoices WHERE service_order_id=$1 FOR UPDATE",
    [order.id],
  )).rows[0];
  if (!invoice || invoice.status === "reversed") throw new ApiError(409, "INVOICE_NOT_PAYABLE", "Invoice aktif tidak ditemukan");
  const idempotencyKey = input.idempotencyKey ?? `service-payment:${crypto.randomUUID()}`;
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`service-invoice-payment:${idempotencyKey}`]);
  const existing = (await client.query<{ id: string; customer_invoice_id: string }>("SELECT id,customer_invoice_id FROM app.payments WHERE idempotency_key=$1", [idempotencyKey])).rows[0];
  if (existing) {
    if (existing.customer_invoice_id !== invoice.id) throw new ApiError(409, "IDEMPOTENCY_CONFLICT", "Kunci idempotensi sudah digunakan untuk invoice berbeda");
    return getWorkflow(client, order.id);
  }
  const paid = Number((await client.query<{ paid: string }>("SELECT COALESCE(sum(amount),0)::text AS paid FROM app.payments WHERE customer_invoice_id=$1 AND reversed_at IS NULL", [invoice.id])).rows[0].paid);
  const total = Number(invoice.total);
  const outstanding = Math.max(total - paid, 0);
  if (outstanding <= 0) throw new ApiError(409, "INVOICE_ALREADY_PAID", "Invoice sudah lunas");
  if (input.amount > outstanding) throw new ApiError(422, "PAYMENT_OVERPAY", "Pembayaran melebihi sisa invoice");
  const paymentNumber = (await client.query<{ number: string }>("SELECT 'SPAY-' || to_char(current_date,'YYYYMMDD') || '-' || lpad(nextval('app.service_payment_number_seq')::text,8,'0') AS number")).rows[0].number;
  const payment = (await client.query<{ id: string }>(
    `INSERT INTO app.payments(payment_number,direction,customer_invoice_id,amount,method,reference,received_by,idempotency_key)
     VALUES($1,'incoming',$2,$3,$4,$5,$6,$7) RETURNING id`,
    [paymentNumber, invoice.id, input.amount, input.method, input.reference ?? null, actor.id, idempotencyKey],
  )).rows[0];
  const newPaid = paid + input.amount;
  const invoiceStatus = newPaid >= total ? "paid" : "partially_paid";
  await client.query("UPDATE app.customer_invoices SET status=$1 WHERE id=$2", [invoiceStatus, invoice.id]);
  if (invoiceStatus === "paid" && order.status !== "paid") await transition(client, actor, order, "paid", "Invoice lunas");
  await recordAudit(client, { actorId: actor.id, requestId: actor.requestId, action: "service_order.invoice.payment", entityType: "payment", entityId: payment.id, after: { serviceOrderId: order.id, invoiceId: invoice.id, paymentNumber, amount: input.amount, method: input.method, invoiceStatus } });
  return getWorkflow(client, order.id);
}
