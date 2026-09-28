import type { Metadata } from "next";
import { PosWorkspace } from "@/components/pos/PosWorkspace";

export const metadata: Metadata = {
  title: "Retail POS | Honda Workshop",
  description: "Kasir retail sparepart Honda Workshop",
};

export default function RetailPosPage() {
  return <PosWorkspace />;
}
