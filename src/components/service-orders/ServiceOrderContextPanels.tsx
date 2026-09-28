"use client";

import { useEffect, useState } from "react";
import { VehicleServiceHistory } from "@/components/service-history";
import { ReceptionSummary } from "@/components/service-orders/ReceptionSummary";
import type { VehicleServiceHistory as VehicleServiceHistoryData } from "@/features/service-history/queries";
import type { ServiceOrderReceptionSummary } from "@/features/service-order-reception-summary/queries";

type Envelope<T> = { data: T; error?: { message?: string } | null };

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok) throw new Error(body.error?.message || "Data pendukung Service Order belum dapat dimuat");
  return body.data;
}

export function ServiceOrderContextPanels({ orderId, vehicleId }: { orderId: string; vehicleId?: string | null }) {
  const [reception, setReception] = useState<ServiceOrderReceptionSummary | null>(null);
  const [history, setHistory] = useState<VehicleServiceHistoryData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const requests: Promise<void>[] = [
      request<ServiceOrderReceptionSummary>(`/api/v1/operations/service-orders/${orderId}/reception-summary`).then((data) => {
        if (active) setReception(data);
      }),
    ];
    if (vehicleId) {
      requests.push(
        request<VehicleServiceHistoryData>(`/api/v1/operations/vehicles/${vehicleId}/service-history`).then((data) => {
          if (active) setHistory(data);
        }),
      );
    }
    void Promise.all(requests).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "Data pendukung Service Order belum dapat dimuat");
    });
    return () => {
      active = false;
    };
  }, [orderId, vehicleId]);

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">{error}</p>}
      {reception && <ReceptionSummary data={reception} />}
      {history && <VehicleServiceHistory data={history} />}
    </div>
  );
}
