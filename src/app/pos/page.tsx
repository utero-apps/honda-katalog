import type { Metadata } from "next";
import { PosWorkspace } from "@/components/pos/PosWorkspace";

export const metadata: Metadata = {
  title: "POS | Honda Workshop",
  description: "Point of Sale sparepart Honda Workshop",
};

export default function PosPage() {
  return <PosWorkspace />;
}
