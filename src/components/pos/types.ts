export type Product = {
  id: string;
  partCode: string;
  name: string;
  het: number;
  unit: string;
  status: string;
  barcodes?: string[];
  category?: string | null;
  quantity?: number;
  availableQuantity?: number;
  minimumStock?: number;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
};

export type PosRegister = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
};

export type CartItem = Product & { cartQuantity: number };

export type PaymentMethod = "cash" | "transfer" | "card" | "other";

export type CheckoutPayment = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
};

export type Receipt = {
  id?: string;
  receiptNumber?: string;
  transactionNumber?: string;
  createdAt?: string;
  cashierName?: string;
  customerName?: string | null;
  items?: Array<{
    id?: string;
    productId?: string;
    partCode?: string;
    name?: string;
    quantity: number;
    unitPrice: number;
    subtotal?: number;
  }>;
  subtotal?: number;
  total?: number;
  payment?: CheckoutPayment;
  payments?: CheckoutPayment[];
  change?: number;
};

export type ApiEnvelope<T> = {
  data: T;
  meta?: Record<string, unknown>;
  error?: { message?: string; fields?: Record<string, string[]> } | null;
};
