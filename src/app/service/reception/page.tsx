import type { Metadata } from "next";
import { ServiceReceptionWorkspace } from "@/components/service-reception/ServiceReceptionWorkspace";

export const metadata: Metadata = {
  title: "Service Reception | Honda Workshop",
  description: "Penerimaan pelanggan dan kendaraan untuk pembuatan service order",
};

export default function ServiceReceptionPage() {
  return <ServiceReceptionWorkspace />;
}
