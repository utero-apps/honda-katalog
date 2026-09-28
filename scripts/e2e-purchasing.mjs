import process from "node:process";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:7780";
const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@honda.local";
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!password) throw new Error("BOOTSTRAP_ADMIN_PASSWORD wajib diisi");

let cookie = "";

async function raw(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", origin: baseUrl, ...(cookie ? { cookie } : {}), ...init.headers },
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function request(path, init = {}, expected = 200) {
  const result = await raw(path, init);
  if (result.response.status !== expected) throw new Error(`${init.method || "GET"} ${path}: expected ${expected}, got ${result.response.status} ${result.body?.error?.message || ""}`);
  return result.body?.data;
}

const anonymous = await raw("/api/v1/intelligence/purchasing-overview");
if (anonymous.response.status !== 401) throw new Error(`Purchasing overview anonymous: ${anonymous.response.status}`);

const login = await raw("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
if (!login.response.ok) throw new Error(`Login gagal: ${login.response.status}`);
cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
if (!cookie) throw new Error("Session cookie tidak diterbitkan");

const suffix = Date.now().toString(36).toUpperCase();
const [firstProduct, secondProduct] = await Promise.all([
  request("/api/v1/catalog/products", { method: "POST", body: JSON.stringify({ partCode: `PUR-A-${suffix}`, name: `Produk Purchasing A ${suffix}`, het: 12000, minimumStock: 1 }) }),
  request("/api/v1/catalog/products", { method: "POST", body: JSON.stringify({ partCode: `PUR-B-${suffix}`, name: `Produk Purchasing B ${suffix}`, het: 15000, minimumStock: 1 }) }),
]);
const vendor = await request("/api/v1/business/vendors", { method: "POST", body: JSON.stringify({ code: `PUR-${suffix}`, name: `Vendor Purchasing ${suffix}`, paymentTermsDays: 30 }) });
const purchaseOrder = await request("/api/v1/business/purchase-orders", { method: "POST", body: JSON.stringify({
  orderNumber: `PO-PUR-${suffix}`,
  vendorId: vendor.id,
  items: [
    { productId: firstProduct.id, quantity: 5, unitPrice: 7000 },
    { productId: secondProduct.id, quantity: 4, unitPrice: 8000 },
  ],
}) });
if (purchaseOrder.items?.length !== 2) throw new Error("PO multi-item tidak tersimpan");
await request(`/api/v1/business/purchase-orders/${purchaseOrder.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "submitted" }) });
await request(`/api/v1/business/purchase-orders/${purchaseOrder.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "approved" }) });
const warehouses = await request("/api/v1/operations/warehouses");
if (!warehouses[0]) throw new Error("Gudang aktif diperlukan");

const firstReceipt = await request("/api/v1/business/receipts", { method: "POST", body: JSON.stringify({
  receiptNumber: `GR-PUR-1-${suffix}`, purchaseOrderId: purchaseOrder.id, warehouseId: warehouses[0].id, idempotencyKey: `pur-receipt-1-${suffix}`,
  items: [
    { purchaseOrderItemId: purchaseOrder.items[0].id, quantity: 2, unitCost: 7000 },
    { purchaseOrderItemId: purchaseOrder.items[1].id, quantity: 2, unitCost: 8000 },
  ],
}) });
if (!firstReceipt.id) throw new Error("Penerimaan parsial gagal");
const afterPartial = await request("/api/v1/business/purchase-orders");
if (afterPartial.find((item) => item.id === purchaseOrder.id)?.status !== "partially_received") throw new Error("Status PO parsial tidak diperbarui");
await request("/api/v1/business/receipts", { method: "POST", body: JSON.stringify({
  receiptNumber: `GR-PUR-2-${suffix}`, purchaseOrderId: purchaseOrder.id, warehouseId: warehouses[0].id, idempotencyKey: `pur-receipt-2-${suffix}`,
  items: [
    { purchaseOrderItemId: purchaseOrder.items[0].id, quantity: 3, unitCost: 7000 },
    { purchaseOrderItemId: purchaseOrder.items[1].id, quantity: 2, unitCost: 8000 },
  ],
}) });
const afterComplete = await request("/api/v1/business/purchase-orders");
if (afterComplete.find((item) => item.id === purchaseOrder.id)?.status !== "received") throw new Error("Status PO received tidak diperbarui");

const invoiceTotal = 67000;
const vendorInvoice = await request("/api/v1/business/vendor-invoices", { method: "POST", body: JSON.stringify({ invoiceNumber: `VI-PUR-${suffix}`, vendorId: vendor.id, purchaseOrderId: purchaseOrder.id, total: invoiceTotal, issuedAt: new Date().toISOString().slice(0, 10), dueAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }) });
await request("/api/v1/business/payments", { method: "POST", body: JSON.stringify({ paymentNumber: `PAY-PUR-1-${suffix}`, direction: "outgoing", vendorInvoiceId: vendorInvoice.id, amount: 20000, method: "transfer", reference: `TRF-1-${suffix}`, idempotencyKey: `pur-payment-1-${suffix}` }) });
const partialInvoices = await request("/api/v1/business/vendor-invoices");
if (partialInvoices.find((item) => item.id === vendorInvoice.id)?.status !== "partially_paid") throw new Error("Invoice vendor tidak menjadi partially_paid");
await request("/api/v1/business/payments", { method: "POST", body: JSON.stringify({ paymentNumber: `PAY-PUR-2-${suffix}`, direction: "outgoing", vendorInvoiceId: vendorInvoice.id, amount: invoiceTotal - 20000, method: "transfer", reference: `TRF-2-${suffix}`, idempotencyKey: `pur-payment-2-${suffix}` }) });
const paidInvoices = await request("/api/v1/business/vendor-invoices");
if (paidInvoices.find((item) => item.id === vendorInvoice.id)?.status !== "paid") throw new Error("Invoice vendor tidak menjadi paid");
const payments = await request("/api/v1/business/payments");
const finalPayment = payments.find((item) => item.vendorInvoiceId === vendorInvoice.id && item.paymentNumber === `PAY-PUR-2-${suffix}`);
if (!finalPayment?.id) throw new Error("Pembayaran vendor untuk reversal tidak ditemukan");
await request("/api/v1/business/reversals", { method: "POST", body: JSON.stringify({ entityType: "payment", entityId: finalPayment.id, reason: "Verifikasi rekonsiliasi reversal E2E" }) });
const reversedInvoices = await request("/api/v1/business/vendor-invoices");
if (reversedInvoices.find((item) => item.id === vendorInvoice.id)?.status !== "partially_paid") throw new Error("Reversal tidak mengembalikan invoice ke partially_paid");
await request("/api/v1/business/payments", { method: "POST", body: JSON.stringify({ paymentNumber: `PAY-PUR-REPAY-${suffix}`, direction: "outgoing", vendorInvoiceId: vendorInvoice.id, amount: invoiceTotal - 20000, method: "transfer", reference: `TRF-REPAY-${suffix}`, idempotencyKey: `pur-payment-repay-${suffix}` }) });
const overpayment = await raw("/api/v1/business/payments", { method: "POST", body: JSON.stringify({ paymentNumber: `PAY-PUR-3-${suffix}`, direction: "outgoing", vendorInvoiceId: vendorInvoice.id, amount: 1, method: "cash", idempotencyKey: `pur-payment-3-${suffix}` }) });
if (overpayment.response.status !== 409 || overpayment.body?.error?.code !== "INVOICE_ALREADY_PAID") throw new Error("Overpayment vendor tidak ditolak");
const overview = await request("/api/v1/intelligence/purchasing-overview");
if (!overview?.summary || !Array.isArray(overview.recentPurchaseChain) || !Array.isArray(overview.topVendors) || !Array.isArray(overview.paymentStatusComposition)) throw new Error("Kontrak purchasing overview tidak lengkap");
if (!overview.recentPurchaseChain.some((item) => item.purchaseOrderId === purchaseOrder.id)) throw new Error("PO tidak muncul pada purchasing overview");
const vendorDetail = await request(`/api/v1/business/vendors/${vendor.id}`);
if (vendorDetail.profile?.id !== vendor.id || !vendorDetail.purchaseOrders.some((item) => item.id === purchaseOrder.id) || !vendorDetail.invoices.some((item) => item.id === vendorInvoice.id)) throw new Error("Detail vendor tidak memuat procurement chain");
const finalInvoices = await request("/api/v1/business/vendor-invoices");
const finalInvoice = finalInvoices.find((item) => item.id === vendorInvoice.id);
if (finalInvoice?.status !== "paid" || Number(finalInvoice.outstanding) !== 0 || Number(finalInvoice.paid) !== invoiceTotal) throw new Error("Read model invoice vendor tidak merekonsiliasi pembayaran akhir");
console.log(JSON.stringify({ verified: true, purchaseOrder: purchaseOrder.orderNumber, vendorInvoice: vendorInvoice.id, dashboardRows: overview.recentPurchaseChain.length, vendorDetail: true }));
