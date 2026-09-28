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
  imageUrl?: string | null;
};

export type PosService = {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  price?: number;
  fixedPrice?: number;
  unit?: string;
  description: string | null;
  imageUrl?: string | null;
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

export type CartItem = (Product | PosService) & {
  cartQuantity: number;
  itemType: "product" | "service";
  unitPrice: number;
};

export type OpenBill = {
  id: string;
  customerId: string;
  registerId: string;
  notes?: string | null;
  items: Array<{
    itemType?: "product" | "service";
    productId?: string | null;
    serviceId?: string | null;
    quantity: number | string;
    product?: Product | null;
    service?: PosService | null;
    name?: string;
    code?: string;
    unit?: string;
    price?: number | string;
    imageUrl?: string | null;
    itemCode?: string;
    itemName?: string;
    unitPrice?: number | string;
  }>;
};

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
