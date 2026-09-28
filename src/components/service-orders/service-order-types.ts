export type ApiEnvelope<T> = { data: T; error?: { message?: string } | null };

export type ServiceOrder = {
  id: string;
  orderNumber: string;
  status: string;
  openedAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  targetCompletionAt?: string | null;
  customerName?: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customer?: {
    id?: string;
    name?: string;
    phone?: string | null;
    address?: string | null;
  };
  vehicle?: {
    id?: string;
    plateNumber?: string;
    model?: string | null;
    year?: number | string | null;
    odometer?: number | string | null;
    imageUrl?: string | null;
  };
  plateNumber?: string;
  model?: string | null;
  odometer?: number | string | null;
  complaint?: string | null;
  assignedMechanicName?: string | null;
  assignedMechanicId?: string | null;
  total?: number | string | null;
};

export type WorkflowItem = {
  id?: string;
  name?: string;
  description?: string | null;
  status?: string;
  quantity?: number | string;
  unit?: string;
  price?: number | string;
  subtotal?: number | string;
  consumedAt?: string | null;
  createdAt?: string;
  actorName?: string | null;
  mechanicId?: string | null;
  mechanicName?: string | null;
  partCode?: string | null;
  productId?: string | null;
  unitPrice?: number | string;
  notes?: string | null;
};

export type ServiceOrderWorkflow = ServiceOrder & {
  timeline?: Array<{
    id?: string;
    status?: string;
    label?: string;
    occurredAt?: string;
    createdAt?: string;
    actorName?: string | null;
    notes?: string | null;
  }>;
  diagnosis?: {
    notes?: string | null;
    findings?: string | null;
    estimatedTotal?: number | string | null;
    updatedAt?: string;
  } | null;
  mechanics?: Array<{
    id: string;
    name: string;
    phone?: string | null;
    workload?: number;
  }>;
  jobs?: WorkflowItem[];
  parts?: WorkflowItem[];
  repairSummary?: {
    totalJobs?: number;
    completedJobs?: number;
    openJobs?: number;
    completedWork?: boolean;
    partsUsed?: number;
    labor?: number | string;
    parts?: number | string;
    total?: number | string;
  };
  estimate?: {
    labor?: number | string;
    parts?: number | string;
    total?: number | string;
    approvedAt?: string | null;
    notes?: string | null;
  } | null;
  qualityControl?: {
    status?: string;
    notes?: string | null;
    checkedBy?: string | null;
    checkedAt?: string | null;
  } | null;
  invoice?: {
    id?: string;
    invoiceNumber?: string;
    status?: string;
    total?: number | string;
    issuedAt?: string | null;
    dueAt?: string | null;
    paidAmount?: number | string;
    outstandingAmount?: number | string;
    payments?: Array<{
      id?: string;
      method?: string;
      amount?: number | string;
      paidAt?: string;
    }>;
  } | null;
  handover?: {
    status?: string;
    recipientName?: string | null;
    notes?: string | null;
    signatureReference?: string | null;
    handedOverAt?: string | null;
  } | null;
};
