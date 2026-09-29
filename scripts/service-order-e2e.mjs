import process from "node:process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:7780";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");
if (process.env.E2E_ISOLATED !== "1") throw new Error("Service Order E2E menulis data. Gunakan database uji terisolasi dan set E2E_ISOLATED=1");

let cookie = "";
async function request(path, init = {}, expected = 200) {
  const headers = { origin: baseUrl, ...(cookie ? { cookie } : {}), ...init.headers };
  if (!(init.body instanceof FormData)) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== expected) {
    const detail = body?.error ? JSON.stringify(body.error) : text;
    throw new Error(`${init.method || "GET"} ${path}: expected ${expected}, got ${response.status} ${detail}`);
  }
  return body;
}

const login = await request("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
if (!login.data?.user?.id) throw new Error("Login Service Order E2E gagal");
const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "content-type": "application/json", origin: baseUrl }, body: JSON.stringify({ email, password }) });
cookie = (loginResponse.headers.get("set-cookie") || "").split(";")[0];
if (!cookie) throw new Error("Session cookie tidak diterbitkan");

const suffix = Date.now().toString(36).toUpperCase();
const customer = (await request("/api/v1/operations/customers", { method: "POST", body: JSON.stringify({ name: `Workflow E2E ${suffix}`, phone: `086${Date.now().toString().slice(-9)}` }) })).data;
const models = (await request("/api/v1/catalog/models")).data;
const vehicle = (await request("/api/v1/operations/vehicles", { method: "POST", body: JSON.stringify({ customerId: customer.id, vehicleModelId: models[0]?.id || null, plateNumber: `SO${suffix.slice(-7)}`, odometer: 15000 }) })).data;
const order = (await request("/api/v1/operations/service-orders", { method: "POST", body: JSON.stringify({ orderNumber: `SO-E2E-${suffix}`, customerId: customer.id, vehicleId: vehicle.id, complaint: "Pengujian workflow menyeluruh", odometer: 15000 }) })).data;
const workflowPath = `/api/v1/operations/service-orders/${order.id}/workflow`;
const initialWorkflow = (await request(workflowPath)).data;
const mechanicId = initialWorkflow.mechanics?.[0]?.id;
if (!mechanicId) throw new Error("Mekanik aktif diperlukan untuk E2E Service Order");
await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "diagnosis", diagnosis: "Oli perlu diganti dan rem diperiksa" }) });
await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "assign", mechanicId }) });
await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "approve", notes: "Pelanggan setuju estimasi" }) });
await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "start" }) });
const createdJob = (await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "add_job", name: "Servis ringan", description: "Pemeriksaan dan penyetelan", price: 50000 }) })).data;
const createdJobId = [...(createdJob.jobs ?? [])].reverse().find((job) => job.name === "Servis ringan")?.id;
if (!createdJobId) throw new Error(`add_job tidak mengembalikan job baru: ${JSON.stringify({ jobs: createdJob.jobs })}`);
await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "complete_job", jobId: createdJobId }) });
await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "quality_check", passed: true, notes: "Rem, lampu, dan mesin lulus" }) });

const invoicePath = `/api/v1/operations/service-orders/${order.id}/invoice`;
const invoiceWorkflow = (await request(invoicePath, { method: "POST", body: JSON.stringify({ action: "create", discount: 0, tax: 0 }) })).data;
const invoice = invoiceWorkflow.invoice;
if (!invoice?.id || !Number.isFinite(Number(invoice.total)) || Number(invoice.total) <= 0 || invoiceWorkflow.status !== "invoiced") {
  throw new Error(`Invoice create tidak mengembalikan workflow valid: ${JSON.stringify({ status: invoiceWorkflow.status, invoice })}`);
}
const partialAmount = Number(invoice.total) / 2;
const partialPayment = (await request(invoicePath, { method: "POST", body: JSON.stringify({ action: "record_payment", amount: partialAmount, method: "cash", idempotencyKey: `service-order-partial-${suffix}` }) })).data;
const afterPartial = (await request(workflowPath)).data;
if (partialPayment.invoice?.status !== "partially_paid" || Number(afterPartial.readiness?.paid) !== partialAmount || Number(afterPartial.readiness?.outstanding) !== Number(invoice.total) - partialAmount || afterPartial.status !== "invoiced") throw new Error("Partial payment tidak memperbarui readiness invoice secara atomik");
const blockedHandover = await request(workflowPath, { method: "POST", body: JSON.stringify({ action: "handover", recipientName: customer.name, notes: "Tidak boleh sebelum lunas" }) }, 409);
if (blockedHandover.error?.code !== "HANDOVER_NOT_READY") throw new Error("Handover sebelum pembayaran penuh tidak ditolak");
const overpayment = await request(invoicePath, { method: "POST", body: JSON.stringify({ action: "record_payment", amount: Number(invoice.total), method: "cash", idempotencyKey: `service-order-overpayment-${suffix}` }) }, 422);
if (overpayment.error?.code !== "PAYMENT_OVERPAY") throw new Error("Overpayment tidak ditolak dengan code konsisten");
const paymentPayload = { action: "record_payment", amount: Number(invoice.total) - partialAmount, method: "cash", idempotencyKey: `service-order-full-${suffix}` };
const payment = (await request(invoicePath, { method: "POST", body: JSON.stringify(paymentPayload) })).data;
const replayedPayment = (await request(invoicePath, { method: "POST", body: JSON.stringify(paymentPayload) })).data;
if (payment.invoice?.payments?.length !== replayedPayment.invoice?.payments?.length) throw new Error("Idempotency pembayaran penuh Service Order gagal");
const paidWorkflow = (await request(workflowPath)).data;
if (paidWorkflow.invoice?.status !== "paid" || Number(paidWorkflow.readiness?.outstanding) !== 0 || paidWorkflow.status !== "paid") throw new Error("Pembayaran penuh belum merekonsiliasi invoice secara atomik");
const handoverAssetsPath = `/api/v1/operations/service-orders/${order.id}/handover-assets`;
await request(handoverAssetsPath, {
  method: "PUT",
  body: JSON.stringify({ vehicleChecked: true, belongingsReturned: true, keysReturned: true, workExplained: true, notes: "Motor, kunci, dan barang pelanggan sudah diperiksa" }),
});
const testPngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
async function uploadHandoverAsset(kind) {
  const form = new FormData();
  form.set("kind", kind);
  form.set("image", new Blob([testPngBytes], { type: "image/png" }), `${kind}.png`);
  return (await request(handoverAssetsPath, { method: "POST", body: form })).data;
}
const photo = await uploadHandoverAsset("final_photo");
const signature = await uploadHandoverAsset("signature");
if (!photo?.id || !signature?.id) throw new Error("Upload foto akhir atau tanda tangan gagal");
const handoverAssets = (await request(handoverAssetsPath)).data;
if (!handoverAssets?.readiness?.ready || handoverAssets.readiness.photoCount < 1 || !handoverAssets.readiness.hasSignature) throw new Error("Checklist keluar dan bukti akhir belum siap untuk handover");
const handover = (await request(`${handoverAssetsPath}/complete`, { method: "POST", body: JSON.stringify({ recipientName: customer.name, recipientAcknowledged: true, notes: "Motor diterima pelanggan" }) })).data;
const detail = handover;
if (detail.status !== "completed" || detail.jobs.length !== 1 || detail.qualityCheck?.passed !== true || !detail.handedOverAt) throw new Error("Handover Service Order tidak konsisten");
const transitions = detail.history.map((item) => item.status ?? item.to_status ?? item.toStatus);
for (const expected of ["open", "in_progress", "quality_check", "invoiced", "paid", "completed"]) if (!transitions.includes(expected)) throw new Error(`History tidak memuat status ${expected}`);

const profile = (await request(`/api/v1/operations/customers/${customer.id}/profile`)).data;
const matchingFollowUps = profile.followUps.filter((item) => item.notes === "Tindak lanjut kepuasan setelah serah terima");
const matchingReminders = profile.reminders.filter((item) => item.vehicleId === vehicle.id);
if (matchingFollowUps.length !== 1 || matchingReminders.length !== 1) throw new Error("Handover wajib menghasilkan tepat satu follow-up dan reminder untuk pelanggan uji");
if (matchingFollowUps[0].status !== "pending" || matchingReminders[0].status !== "pending") throw new Error("Jadwal CRM tidak dimulai dalam status pending");
if (Number(matchingReminders[0].odometerDue) !== 17000) throw new Error("Reminder servis umum wajib jatuh tempo pada 17.000 km");
const dueInDays = (timestamp) => (new Date(timestamp).getTime() - Date.now()) / 86400000;
if (Math.abs(dueInDays(matchingFollowUps[0].dueAt) - 3) > 0.1 || Math.abs(dueInDays(matchingReminders[0].dueAt) - 90) > 0.1) throw new Error("Tanggal follow-up atau reminder tidak sesuai kebijakan servis umum");

const feedbackLink = (await request("/api/v1/public/service-feedback/tokens", { method: "POST", body: JSON.stringify({ serviceOrderId: order.id }) })).data;
if (!/^\/service-feedback\/[A-Za-z0-9_-]{43}$/.test(feedbackLink.path)) throw new Error("Tautan rating pelanggan tidak valid");
const feedbackPath = `/api/v1/public${feedbackLink.path}`;
await request(feedbackPath);
const feedback = (await request(feedbackPath, { method: "POST", body: JSON.stringify({ rating: 5, comments: "Layanan uji selesai" }) })).data;
if (feedback.rating !== 5) throw new Error("Rating pelanggan gagal dicatat");
const replay = await request(feedbackPath, { method: "POST", body: JSON.stringify({ rating: 1 }) }, 409);
if (replay.error?.code !== "FEEDBACK_TOKEN_USED") throw new Error("Token rating sekali pakai tidak menolak replay");
const duplicateLink = await request("/api/v1/public/service-feedback/tokens", { method: "POST", body: JSON.stringify({ serviceOrderId: order.id }) }, 409);
if (duplicateLink.error?.code !== "FEEDBACK_ALREADY_SUBMITTED") throw new Error("Service Order yang telah dinilai masih dapat menerbitkan tautan rating");

console.log(JSON.stringify({ verified: true, serviceOrderId: order.id, invoiceId: invoice.id, finalStatus: detail.status, followUpId: matchingFollowUps[0].id, reminderId: matchingReminders[0].id, feedbackRating: feedback.rating }));
