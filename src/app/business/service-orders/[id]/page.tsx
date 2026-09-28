import { ServiceOrderDetailWorkspace } from "@/components/service-orders/ServiceOrderDetailWorkspace";

export default async function ServiceOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ServiceOrderDetailWorkspace orderId={id} />;
}
