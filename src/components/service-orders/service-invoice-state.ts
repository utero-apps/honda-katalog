import type { ServiceOrderWorkflow } from "./service-order-types";

export function isServiceInvoicePaid(invoice: ServiceOrderWorkflow["invoice"]) {
  if (!invoice || invoice.status === "reversed") return false;
  if (invoice.status === "paid") return true;
  const total = Number(invoice.total);
  const outstanding = Number(invoice.outstandingAmount);
  return Number.isFinite(total) && total > 0 && Number.isFinite(outstanding) && outstanding <= 0;
}
