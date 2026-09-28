import { VendorDetailWorkspace } from "@/components/purchasing/VendorDetailWorkspace";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VendorDetailWorkspace vendorId={id} />;
}
