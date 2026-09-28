import type { ServiceOrderWorkflow, WorkflowItem } from "@/components/service-orders/service-order-types";
import type { HandoverAssetsData } from "@/components/service-orders/handover/types";

export const documentTypes = ["job-card", "estimate", "invoice", "handover"] as const;
export type PrintDocumentType = typeof documentTypes[number];

export type PrintableWorkflow = Omit<ServiceOrderWorkflow, "customer" | "vehicle" | "jobs" | "parts" | "invoice" | "handover"> & {
  approvedAt?: string | null;
  approvalNotes?: string | null;
  customerAddress?: string | null;
  vehicleYear?: number | null;
  handedOverAt?: string | null;
  handoverRecipientName?: string | null;
  handoverNotes?: string | null;
  handoverSignatureReference?: string | null;
  targetCompletionAt?: string | null;
  customer?: (NonNullable<ServiceOrderWorkflow["customer"]> & { address?: string | null }) | undefined;
  vehicle?: (NonNullable<ServiceOrderWorkflow["vehicle"]> & { year?: number | null }) | undefined;
  jobs?: Array<WorkflowItem & { mechanicName?: string | null }>;
  parts?: Array<WorkflowItem & { partCode?: string | null; unitPrice?: number | string }>;
  invoice?: (Omit<NonNullable<ServiceOrderWorkflow["invoice"]>, "payments"> & {
    issuedAt?: string | null;
    dueAt?: string | null;
    payments?: Array<{ id?: string; paymentNumber?: string; method?: string; amount?: number | string; paidAt?: string }>;
  }) | null;
  qualityControl?: ServiceOrderWorkflow["qualityControl"];
  handover?: (NonNullable<ServiceOrderWorkflow["handover"]> & { signatureReference?: string | null }) | null;
};

export function amount(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function lineTotal(item: WorkflowItem): number {
  return amount(item.subtotal ?? amount(item.quantity ?? 1) * amount(item.price));
}

export function canPrintDocument(order: PrintableWorkflow, type: PrintDocumentType): boolean {
  if (type === "invoice") return Boolean(order.invoice?.invoiceNumber && order.invoice.status !== "reversed");
  if (type === "handover") return Boolean(order.handover?.handedOverAt || order.handedOverAt);
  return true;
}

export function handoverEvidence(data: HandoverAssetsData | null) {
  return {
    checklist: data?.checklist ?? null,
    photos: data?.assets.filter((asset) => asset.kind === "final_photo") ?? [],
    signature: data?.assets.find((asset) => asset.kind === "signature") ?? null,
  };
}
