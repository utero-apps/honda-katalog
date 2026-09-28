import { Customer360Workspace } from "@/components/customer-360/Customer360Workspace";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Customer360Workspace customerId={id} />;
}
