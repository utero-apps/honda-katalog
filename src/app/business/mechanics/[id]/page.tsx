import { MechanicDetailWorkspace } from "@/components/mechanics/MechanicDetailWorkspace";

export default async function MechanicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MechanicDetailWorkspace mechanicId={id} />;
}
