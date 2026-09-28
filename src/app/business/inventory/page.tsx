import type { Metadata } from "next";
import { InventoryWorkspace } from "@/components/inventory/InventoryWorkspace";

export const metadata: Metadata = {
  title: "Inventory Control | Honda Workshop",
  description: "Dashboard stok, pembelian, penerimaan, dan stock opname.",
};

export default function InventoryPage() {
  return <InventoryWorkspace />;
}
