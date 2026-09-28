import { notFound } from "next/navigation";
import { z } from "zod";
import { ServiceOrderPrint } from "@/components/service-orders/print/ServiceOrderPrint";
import { documentTypes } from "@/components/service-orders/print/print-model";

export default async function ServiceOrderPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ document?: string | string[] }>;
}) {
  const [{ id }, { document }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success || (document !== undefined && !documentTypes.includes(document as typeof documentTypes[number]))) notFound();
  return <ServiceOrderPrint orderId={id} documentType={(document ?? "job-card") as typeof documentTypes[number]} />;
}
