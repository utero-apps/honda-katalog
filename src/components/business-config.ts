export type BusinessKey = "customers" | "service-orders" | "inventory" | "vendors" | "finance" | "crm" | "intelligence";

export type BusinessModule = {
  key: BusinessKey;
  href: string;
  label: string;
  eyebrow: string;
  description: string;
  endpoint: string;
  readRoles: string[];
  writeRoles: string[];
  actionLabel: string;
};

export const businessModules: BusinessModule[] = [
  { key: "customers", href: "/business/customers", label: "Pelanggan", eyebrow: "Customer 360", description: "Data kontak, kendaraan, dan riwayat layanan pelanggan.", endpoint: "/api/v1/operations/customers", readRoles: ["owner", "admin", "cashier", "mechanic"], writeRoles: ["owner", "admin", "cashier"], actionLabel: "Pelanggan baru" },
  { key: "service-orders", href: "/business/service-orders", label: "Service Order", eyebrow: "Workshop Flow", description: "Antrean pekerjaan, status layanan, pelanggan, dan kendaraan.", endpoint: "/api/v1/operations/service-orders", readRoles: ["owner", "admin", "cashier", "mechanic"], writeRoles: ["owner", "admin", "cashier"], actionLabel: "Order baru" },
  { key: "inventory", href: "/business/inventory", label: "Inventori", eyebrow: "Stock Control", description: "Saldo stok per gudang, stok terpesan, dan item yang perlu dipenuhi.", endpoint: "/api/v1/operations/inventory/balances", readRoles: ["owner", "admin", "warehouse"], writeRoles: ["owner", "admin", "warehouse"], actionLabel: "Penyesuaian stok" },
  { key: "vendors", href: "/business/vendors", label: "Vendor", eyebrow: "Purchasing", description: "Direktori pemasok, kontak, termin pembayaran, dan persiapan pembelian.", endpoint: "/api/v1/business/vendors", readRoles: ["owner", "admin", "warehouse", "finance"], writeRoles: ["owner", "admin", "warehouse"], actionLabel: "Vendor baru" },
  { key: "finance", href: "/business/finance", label: "Keuangan", eyebrow: "Cash Control", description: "Pengeluaran, hutang vendor, piutang pelanggan, dan arus kas bengkel.", endpoint: "/api/v1/business/expenses", readRoles: ["owner", "admin", "finance", "cashier"], writeRoles: ["owner", "admin", "finance", "cashier"], actionLabel: "Catat pengeluaran" },
  { key: "crm", href: "/business/crm", label: "CRM", eyebrow: "Customer Retention", description: "Follow-up dan reminder service untuk mempertahankan pelanggan.", endpoint: "/api/v1/intelligence/follow-ups", readRoles: ["owner", "admin"], writeRoles: ["owner", "admin"], actionLabel: "Follow-up baru" },
  { key: "intelligence", href: "/business/intelligence", label: "Business Intelligence", eyebrow: "Decision Center", description: "Performa mekanik, loyalitas pelanggan, pendapatan, dan perputaran stok.", endpoint: "/api/v1/intelligence/business-overview", readRoles: ["owner", "admin"], writeRoles: [], actionLabel: "" },
];

export const businessColumns: Record<BusinessKey, Array<{ key: string; label: string }>> = {
  customers: [{ key: "name", label: "Nama" }, { key: "phone", label: "Telepon" }, { key: "email", label: "Email" }, { key: "isActive", label: "Status" }],
  "service-orders": [{ key: "orderNumber", label: "Nomor" }, { key: "customerName", label: "Pelanggan" }, { key: "plateNumber", label: "Kendaraan" }, { key: "status", label: "Status" }, { key: "openedAt", label: "Dibuka" }],
  inventory: [{ key: "partCode", label: "Kode" }, { key: "name", label: "Produk" }, { key: "warehouse", label: "Gudang" }, { key: "quantity", label: "Stok" }, { key: "reservedQuantity", label: "Terpesan" }, { key: "lowStock", label: "Status" }],
  vendors: [{ key: "code", label: "Kode" }, { key: "name", label: "Vendor" }, { key: "phone", label: "Telepon" }, { key: "email", label: "Email" }, { key: "paymentTermsDays", label: "Termin" }],
  finance: [{ key: "expenseNumber", label: "Nomor" }, { key: "category", label: "Kategori" }, { key: "description", label: "Keterangan" }, { key: "amount", label: "Jumlah" }, { key: "occurredAt", label: "Tanggal" }],
  crm: [{ key: "customerName", label: "Pelanggan" }, { key: "channel", label: "Kanal" }, { key: "dueAt", label: "Jadwal" }, { key: "status", label: "Status" }, { key: "notes", label: "Catatan" }],
  intelligence: [],
};
