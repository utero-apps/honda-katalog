import type { Metadata } from "next";
import { ServiceReceptionWorkspace } from "@/components/service-reception/ServiceReceptionWorkspace";

export const metadata: Metadata = {
  title: "Service Order Desk | Honda Workshop",
  description: "Penerimaan pelanggan dan kendaraan untuk pembuatan Service Order",
};

export default function PosPage() {
  return <ServiceReceptionWorkspace mode="service-order" />;
}
