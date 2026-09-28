"use client";

import Link from "next/link";
import { VehicleCameraDialog } from "./VehicleCameraDialog";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  ApiEnvelope,
  Customer,
  ReceptionChecklist,
  ReceptionDraft,
  ServiceOrderResult,
  ServiceType,
  Vehicle,
  VehicleModel,
} from "./types";

const DRAFT_KEY = "honda-service-reception-draft-v1";
const TOTAL_STEPS = 5;

const emptyChecklist: ReceptionChecklist = {
  fuelLevel: 50,
  physicalCondition: "",
  belongings: [],
  notes: "",
};

const initialDraft: ReceptionDraft = {
  step: 1,
  customer: null,
  vehicle: null,
  odometer: "",
  odometerCorrectionReason: "",
  complaint: "",
  serviceType: "general",
  checklist: emptyChecklist,
};

const steps = [
  { number: 1, label: "Pelanggan", helper: "Cari atau buat data" },
  { number: 2, label: "Kendaraan", helper: "Pilih unit servis" },
  { number: 3, label: "Keluhan", helper: "Catat kebutuhan" },
  { number: 4, label: "Checklist", helper: "Kondisi penerimaan" },
  { number: 5, label: "Review", helper: "Konfirmasi order" },
];

const serviceTypes: Array<{
  value: ServiceType;
  label: string;
  helper: string;
}> = [
  {
    value: "general",
    label: "Servis umum",
    helper: "Pemeriksaan atau perbaikan umum",
  },
  {
    value: "monthly",
    label: "Servis bulanan",
    helper: "Perawatan berdasarkan periode bulanan",
  },
  {
    value: "mileage",
    label: "Berdasarkan kilometer",
    helper: "Perawatan sesuai jarak tempuh",
  },
  {
    value: "routine",
    label: "Perawatan rutin",
    helper: "Tune-up dan pemeriksaan berkala",
  },
];

const serviceLabels = Object.fromEntries(
  serviceTypes.map((item) => [item.value, item.label]),
) as Record<ServiceType, string>;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok)
    throw new Error(body?.error?.message || "Permintaan tidak dapat diproses");
  if (!body) throw new Error("Respons server tidak valid");
  return body.data;
}

function Icon({
  name,
  className = "size-5",
}: {
  name:
    | "back"
    | "search"
    | "user"
    | "bike"
    | "clipboard"
    | "check"
    | "refresh"
    | "close";
  className?: string;
}) {
  const paths: Record<typeof name, ReactNode> = {
    back: <path d="m15 18-6-6 6-6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    bike: (
      <>
        <circle cx="6" cy="17" r="3" />
        <circle cx="18" cy="17" r="3" />
        <path d="m6 17 4-7h4l4 7M9 13h7M10 10 8 7h3" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function Field({
  label,
  required,
  children,
  helper,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-900">
        {label}
        {required && (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {helper && (
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {helper}
        </span>
      )}
    </label>
  );
}

function StepShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">
          {description}
        </p>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function ServiceReceptionWorkspace({
  mode = "reception",
}: {
  mode?: "reception" | "service-order";
}) {
  const isServiceOrderDesk = mode === "service-order";
  const searchRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ReceptionDraft>(initialDraft);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searched, setSearched] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const vehicleImageInputRef = useRef<HTMLInputElement>(null);
  const [vehicleImage, setVehicleImage] = useState<File | null>(null);
  const [vehicleImageError, setVehicleImageError] = useState("");
  const [showVehicleCamera, setShowVehicleCamera] = useState(false);
  const [savingEntity, setSavingEntity] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState<ServiceOrderResult | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(DRAFT_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<ReceptionDraft>;
          setDraft({
            ...initialDraft,
            ...parsed,
            step: Math.min(Math.max(Number(parsed.step) || 1, 1), TOTAL_STEPS),
            checklist: { ...emptyChecklist, ...parsed.checklist },
          });
        }
      } catch {
        window.localStorage.removeItem(DRAFT_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated || success) return;
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, hydrated, success]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        setVehicleModels(await api<VehicleModel[]>("/api/v1/catalog/models"));
      } catch (reason) {
        setModelsError(
          reason instanceof Error
            ? reason.message
            : "Daftar model belum dapat dimuat",
        );
      } finally {
        setModelsLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const updateDraft = useCallback(
    <Key extends keyof ReceptionDraft>(key: Key, value: ReceptionDraft[Key]) =>
      setDraft((current) => ({ ...current, [key]: value })),
    [],
  );
  const selectedVehicles = useMemo(
    () => draft.customer?.vehicles ?? [],
    [draft.customer],
  );

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (query.trim().length < 2) {
      setSearchError(
        "Masukkan minimal 2 karakter nama, telepon, atau plat nomor.",
      );
      return;
    }
    setSearching(true);
    setSearchError("");
    setSearched(true);
    try {
      const data = await api<Customer[]>(
        `/api/v1/operations/service-reception/search?query=${encodeURIComponent(query.trim())}`,
      );
      setResults(data);
    } catch (reason) {
      setResults([]);
      setSearchError(
        reason instanceof Error ? reason.message : "Pencarian pelanggan gagal",
      );
    } finally {
      setSearching(false);
    }
  }

  async function createCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSavingEntity(true);
    setFormError("");
    try {
      const customer = await api<Customer>(
        "/api/v1/operations/service-reception/customers",
        {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            phone: data.get("phone"),
            email: data.get("email") || null,
          }),
        },
      );
      updateDraft("customer", {
        ...customer,
        vehicles: customer.vehicles ?? [],
      });
      updateDraft("vehicle", null);
      setShowCustomerForm(false);
      setResults((current) => [
        customer,
        ...current.filter((item) => item.id !== customer.id),
      ]);
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "Pelanggan belum dapat dibuat",
      );
    } finally {
      setSavingEntity(false);
    }
  }

  async function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.customer) return;
    const data = new FormData(event.currentTarget);
    setSavingEntity(true);
    setFormError("");
    try {
      const vehicleModelId = String(data.get("vehicleModelId") || "") || null;
      let imageUrl: string | null = null;
      if (vehicleImage) {
        const imageData = new FormData();
        imageData.set("image", vehicleImage);
        const response = await fetch(
          "/api/v1/operations/service-reception/vehicle-images",
          { method: "POST", body: imageData },
        );
        const body = (await response.json()) as ApiEnvelope<{ imageUrl: string }>;
        if (!response.ok)
          throw new Error(
            body.error?.message || "Gambar kendaraan belum dapat diunggah",
          );
        imageUrl = body.data.imageUrl;
      }
      const createdVehicle = await api<Vehicle>(
        "/api/v1/operations/service-reception/vehicles",
        {
          method: "POST",
          body: JSON.stringify({
            customerId: draft.customer.id,
            plateNumber: data.get("plateNumber"),
            vehicleModelId,
            year: data.get("year") ? Number(data.get("year")) : null,
            odometer: data.get("odometer") ? Number(data.get("odometer")) : 0,
            imageUrl,
          }),
        },
      );
      const vehicle = {
        ...createdVehicle,
        vehicleModelId,
        model:
          createdVehicle.model ??
          vehicleModels.find((model) => model.id === vehicleModelId)?.name ??
          null,
      };
      updateDraft("customer", {
        ...draft.customer,
        vehicles: [...(draft.customer.vehicles ?? []), vehicle],
      });
      updateDraft("vehicle", vehicle);
      if (vehicle.odometer !== null && vehicle.odometer !== undefined)
        updateDraft("odometer", String(vehicle.odometer));
      setShowVehicleForm(false);
      setVehicleImage(null);
      setVehicleImageError("");
      if (vehicleImageInputRef.current) vehicleImageInputRef.current.value = "";
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : "Kendaraan belum dapat dibuat",
      );
    } finally {
      setSavingEntity(false);
    }
  }

  function canContinue() {
    if (draft.step === 1) return Boolean(draft.customer);
    if (draft.step === 2) return Boolean(draft.vehicle);
    if (draft.step === 3) {
      const correctionLength = draft.odometerCorrectionReason.trim().length;
      return (
        Number(draft.odometer) >= 0 &&
        draft.complaint.trim().length >= 5 &&
        (correctionLength === 0 || correctionLength >= 3)
      );
    }
    if (draft.step === 4)
      return draft.checklist.physicalCondition.trim().length >= 3;
    return true;
  }

  function next() {
    if (!canContinue()) return;
    updateDraft("step", Math.min(draft.step + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    updateDraft("step", Math.max(draft.step - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitOrder() {
    if (!draft.customer || !draft.vehicle) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const order = await api<ServiceOrderResult>(
        "/api/v1/operations/service-reception/orders",
        {
          method: "POST",
          body: JSON.stringify({
            customerId: draft.customer.id,
            vehicleId: draft.vehicle.id,
            odometer: Number(draft.odometer),
            odometerCorrectionReason:
              draft.odometerCorrectionReason.trim() || null,
            complaint: draft.complaint.trim(),
            serviceType: draft.serviceType,
            checklist: draft.checklist,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      window.localStorage.removeItem(DRAFT_KEY);
      setSuccess(order);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error
          ? reason.message
          : "Service order belum dapat dibuat",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    window.localStorage.removeItem(DRAFT_KEY);
    setDraft(initialDraft);
    setQuery("");
    setResults([]);
    setSearched(false);
    setSearchError("");
    setSuccess(null);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }

  if (!hydrated)
    return (
      <main className="min-h-dvh bg-slate-50 p-4 sm:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="h-20 animate-pulse rounded-2xl bg-white" />
          <div className="mt-5 h-[32rem] animate-pulse rounded-3xl bg-white" />
        </div>
      </main>
    );

  if (success)
    return (
      <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,#d1fae5,transparent_34rem),#f8fafc] p-4">
        <section className="w-full max-w-xl rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-xl sm:p-10">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <Icon name="check" className="size-9" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            Penerimaan selesai
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            Service order berhasil dibuat
          </h1>
          <p className="mt-3 text-slate-600">Nomor order</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-blue-800">
            {success.orderNumber || success.id}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Status: {success.status || "open"}
          </p>
          <div className="mt-7 grid gap-2 sm:grid-cols-2">
            <Link
              href={`/business/service-orders/${success.id}`}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-800 hover:bg-slate-100"
            >
              Buka detail service order
            </Link>
            <button
              type="button"
              onClick={reset}
              className="min-h-12 rounded-xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700"
            >
              Terima kendaraan berikutnya
            </button>
          </div>
        </section>
      </main>
    );

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,#dbeafe_0,transparent_30rem),linear-gradient(180deg,#f8fafc,#eef2f7)] text-slate-950">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Kembali ke dashboard"
              className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <Icon name="back" />
            </Link>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">
                Honda Workshop
              </p>
              <h1 className="truncate text-xl font-black sm:text-2xl">
                {isServiceOrderDesk ? "Service Order Desk" : "Service Reception"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isServiceOrderDesk && (
              <Link
                href="/business/service-orders"
                className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-800 hover:bg-blue-100"
              >
                Order aktif
              </Link>
            )}
            <button
              type="button"
              onClick={reset}
              className="hidden min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 sm:inline-flex"
            >
              <Icon name="refresh" />
              Reset draft
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:pb-8">
        <nav
          aria-label={
            isServiceOrderDesk
              ? "Tahapan pembuatan service order"
              : "Tahapan penerimaan servis"
          }
          className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <ol className="flex min-w-max gap-1 lg:grid lg:min-w-0 lg:grid-cols-5">
            {steps.map((item) => {
              const active = draft.step === item.number;
              const done = draft.step > item.number;
              return (
                <li key={item.number} className="min-w-40 lg:min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.number < draft.step)
                        updateDraft("step", item.number);
                    }}
                    disabled={item.number > draft.step}
                    aria-current={active ? "step" : undefined}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors ${active ? "bg-blue-800 text-white" : done ? "bg-emerald-50 text-emerald-900 hover:bg-emerald-100" : "text-slate-400"}`}
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-black ${active ? "bg-white text-blue-800" : done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}
                    >
                      {done ? (
                        <Icon name="check" className="size-4" />
                      ) : (
                        item.number
                      )}
                    </span>
                    <span>
                      <span className="block text-sm font-black">
                        {item.label}
                      </span>
                      <span
                        className={`block text-xs ${active ? "text-blue-100" : "opacity-75"}`}
                      >
                        {item.helper}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-5">
          {draft.step === 1 && (
            <StepShell
              eyebrow="Langkah 1 dari 5"
              title="Temukan pelanggan"
              description="Cari berdasarkan nama, nomor telepon, atau plat kendaraan. Jika belum terdaftar, buat pelanggan baru tanpa meninggalkan alur penerimaan."
            >
              {draft.customer ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-700 text-white">
                        <Icon name="user" />
                      </span>
                      <div>
                        <p className="font-black text-blue-950">
                          {draft.customer.name}
                        </p>
                        <p className="mt-1 text-sm text-blue-800">
                          {draft.customer.phone ||
                            draft.customer.email ||
                            "Kontak belum tersedia"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        updateDraft("customer", null);
                        updateDraft("vehicle", null);
                      }}
                      aria-label="Ganti pelanggan"
                      className="grid min-h-11 min-w-11 place-items-center rounded-xl text-blue-700 hover:bg-blue-100"
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <form
                    onSubmit={search}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <label className="relative min-w-0 flex-1">
                      <span className="sr-only">Cari pelanggan</span>
                      <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-slate-400">
                        <Icon name="search" />
                      </span>
                      <input
                        ref={searchRef}
                        data-dialog-initial-focus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Nama, telepon, atau plat nomor"
                        className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-4 text-base font-semibold outline-none placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={searching}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
                    >
                      {searching && (
                        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      )}
                      Cari pelanggan
                    </button>
                  </form>
                  {searchError && (
                    <p
                      role="alert"
                      className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
                    >
                      {searchError}
                    </p>
                  )}
                  {searching ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {[1, 2, 3, 4].map((item) => (
                        <div
                          key={item}
                          className="h-24 animate-pulse rounded-2xl bg-slate-100"
                        />
                      ))}
                    </div>
                  ) : searched && results.length === 0 && !searchError ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
                      <p className="font-black">Pelanggan tidak ditemukan</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Buat data pelanggan agar penerimaan dapat dilanjutkan.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {results.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            updateDraft("customer", customer);
                            updateDraft("vehicle", null);
                          }}
                          className="min-h-24 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                        >
                          <p className="font-black text-slate-950">
                            {customer.name}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {customer.phone ||
                              customer.email ||
                              "Kontak belum tersedia"}
                          </p>
                          <p className="mt-2 text-xs font-bold text-blue-700">
                            {customer.vehicles?.length ?? 0} kendaraan
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomerForm((value) => !value);
                      setFormError("");
                    }}
                    className="mt-5 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-100"
                  >
                    {showCustomerForm
                      ? "Tutup form pelanggan"
                      : "+ Buat pelanggan baru"}
                  </button>
                </>
              )}
              {showCustomerForm && !draft.customer && (
                <form
                  onSubmit={createCustomer}
                  className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
                >
                  <Field label="Nama pelanggan" required>
                    <input
                      name="name"
                      required
                      minLength={2}
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                  </Field>
                  <Field label="Nomor telepon" required>
                    <input
                      name="phone"
                      required
                      type="tel"
                      inputMode="tel"
                      minLength={5}
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      name="email"
                      type="email"
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={savingEntity}
                      className="min-h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
                    >
                      {savingEntity ? "Menyimpan..." : "Simpan pelanggan"}
                    </button>
                  </div>
                  {formError && (
                    <p
                      role="alert"
                      className="sm:col-span-2 text-sm font-bold text-red-700"
                    >
                      {formError}
                    </p>
                  )}
                </form>
              )}
            </StepShell>
          )}

          {draft.step === 2 && (
            <StepShell
              eyebrow="Langkah 2 dari 5"
              title="Pilih kendaraan"
              description={`Tentukan kendaraan milik ${draft.customer?.name || "pelanggan"} yang akan diterima untuk servis.`}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedVehicles.map((vehicle) => (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => {
                      updateDraft("vehicle", vehicle);
                      if (
                        vehicle.odometer !== null &&
                        vehicle.odometer !== undefined
                      )
                        updateDraft("odometer", String(vehicle.odometer));
                    }}
                    className={`min-h-32 rounded-2xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${draft.vehicle?.id === vehicle.id ? "border-blue-700 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-300"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white">
                        <Icon name="bike" />
                      </span>
                      {draft.vehicle?.id === vehicle.id && (
                        <span className="grid size-7 place-items-center rounded-full bg-blue-700 text-white">
                          <Icon name="check" className="size-4" />
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-lg font-black uppercase tracking-wide">
                      {vehicle.plateNumber}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {vehicle.model || "Model belum dicatat"}
                      {vehicle.year ? ` · ${vehicle.year}` : ""}
                    </p>
                  </button>
                ))}
              </div>
              {selectedVehicles.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
                  <p className="font-black">Belum ada kendaraan</p>
                  <p className="mt-1 text-sm text-slate-600">
                    Tambahkan kendaraan pertama untuk pelanggan ini.
                  </p>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowVehicleForm((value) => !value);
                  setFormError("");
                }}
                className="mt-5 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800 hover:bg-slate-100"
              >
                {showVehicleForm
                  ? "Tutup form kendaraan"
                  : "+ Tambah kendaraan"}
              </button>
              {showVehicleForm && (
                <form
                  onSubmit={createVehicle}
                  className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
                >
                  <Field label="Nomor polisi" required>
                    <input
                      name="plateNumber"
                      required
                      minLength={2}
                      autoCapitalize="characters"
                      spellCheck={false}
                      onInput={(event) => {
                        event.currentTarget.value = event.currentTarget.value.toUpperCase();
                      }}
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold uppercase outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                  </Field>
                  <Field label="Model kendaraan" required>
                    <select
                      name="vehicleModelId"
                      required
                      disabled={modelsLoading || vehicleModels.length === 0}
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="">
                        {modelsLoading
                          ? "Memuat model..."
                          : "Pilih model kendaraan"}
                      </option>
                      {vehicleModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                    {modelsError && (
                      <span className="mt-1 block text-xs font-semibold text-red-700">
                        {modelsError}
                      </span>
                    )}
                  </Field>
                  <Field label="Tahun">
                    <input
                      name="year"
                      type="number"
                      inputMode="numeric"
                      min="1980"
                      max={new Date().getFullYear() + 1}
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                  </Field>
                  <Field label="Odometer terakhir">
                    <input
                      name="odometer"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                  </Field>
                  <Field
                    label="Foto kendaraan"
                    helper="Opsional. JPEG, PNG, WebP, atau AVIF. Maksimal 5 MB."
                  >
                    <input
                      ref={vehicleImageInputRef}
                      name="vehicleImage"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      capture="environment"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] ?? null;
                        const allowedTypes = [
                          "image/jpeg",
                          "image/png",
                          "image/webp",
                          "image/avif",
                        ];
                        if (
                          file &&
                          (!allowedTypes.includes(file.type) ||
                            file.size > 5 * 1024 * 1024)
                        ) {
                          setVehicleImage(null);
                          setVehicleImageError(
                            "Gunakan gambar JPEG, PNG, WebP, atau AVIF maksimal 5 MB.",
                          );
                          event.currentTarget.value = "";
                          return;
                        }
                        setVehicleImage(file);
                        setVehicleImageError("");
                      }}
                      className="mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setVehicleImageError("");
                        setShowVehicleCamera(true);
                      }}
                      className="mt-2 min-h-11 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-black text-blue-800 hover:bg-blue-100"
                    >
                      Ambil foto dari kamera
                    </button>
                    {vehicleImage && (
                      <span className="mt-1 block text-xs font-semibold text-slate-600">
                        {vehicleImage.name}
                      </span>
                    )}
                    {vehicleImageError && (
                      <span className="mt-1 block text-xs font-semibold text-red-700">
                        {vehicleImageError}
                      </span>
                    )}
                  </Field>
                  {showVehicleCamera && (
                    <VehicleCameraDialog
                      onClose={() => setShowVehicleCamera(false)}
                      onCapture={(file) => {
                        setVehicleImage(file);
                        setVehicleImageError("");
                        if (vehicleImageInputRef.current)
                          vehicleImageInputRef.current.value = "";
                      }}
                    />
                  )}
                  <button
                    type="submit"
                    disabled={savingEntity}
                    className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white sm:col-span-2 disabled:opacity-60"
                  >
                    {savingEntity ? "Menyimpan..." : "Simpan kendaraan"}
                  </button>
                  {formError && (
                    <p
                      role="alert"
                      className="sm:col-span-2 text-sm font-bold text-red-700"
                    >
                      {formError}
                    </p>
                  )}
                </form>
              )}
            </StepShell>
          )}

          {draft.step === 3 && (
            <StepShell
              eyebrow="Langkah 3 dari 5"
              title="Catat kebutuhan servis"
              description="Masukkan odometer aktual, jenis perawatan, dan keluhan pelanggan sedetail mungkin untuk membantu mekanik melakukan diagnosis."
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)]">
                <Field
                  label="Odometer saat diterima"
                  required
                  helper="Gunakan angka pada panel kendaraan saat ini."
                >
                  <div className="relative mt-2">
                    <input
                      value={draft.odometer}
                      onChange={(event) =>
                        updateDraft("odometer", event.target.value)
                      }
                      type="number"
                      inputMode="numeric"
                      min="0"
                      className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-14 text-base font-black tabular-nums outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                    <span className="absolute inset-y-0 right-4 grid place-items-center text-sm font-bold text-slate-500">
                      km
                    </span>
                  </div>
                </Field>
                <Field
                  label="Keluhan dan permintaan pelanggan"
                  required
                  helper="Minimal 5 karakter. Catat gejala, suara, waktu kejadian, atau permintaan khusus."
                >
                  <textarea
                    value={draft.complaint}
                    onChange={(event) =>
                      updateDraft("complaint", event.target.value)
                    }
                    rows={5}
                    minLength={5}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-6 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                  />
                </Field>
              </div>
              <div className="mt-5">
                <Field
                  label="Alasan koreksi odometer"
                  helper="Isi jika angka odometer berbeda dari catatan terakhir kendaraan. Minimal 3 karakter bila diisi."
                >
                  <textarea
                    value={draft.odometerCorrectionReason}
                    onChange={(event) =>
                      updateDraft(
                        "odometerCorrectionReason",
                        event.target.value,
                      )
                    }
                    rows={3}
                    minLength={3}
                    maxLength={1000}
                    placeholder="Contoh: panel odometer diganti setelah kerusakan"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base leading-6 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                  />
                </Field>
              </div>
              <fieldset className="mt-6">
                <legend className="text-sm font-black text-slate-900">
                  Jenis layanan
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {serviceTypes.map((item) => (
                    <label
                      key={item.value}
                      className={`cursor-pointer rounded-2xl border p-4 ${draft.serviceType === item.value ? "border-blue-700 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        checked={draft.serviceType === item.value}
                        onChange={() => updateDraft("serviceType", item.value)}
                      />
                      <span className="font-black text-slate-950">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        {item.helper}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </StepShell>
          )}

          {draft.step === 4 && (
            <StepShell
              eyebrow="Langkah 4 dari 5"
              title="Checklist penerimaan"
              description="Dokumentasikan kondisi kendaraan dan barang yang dititipkan untuk mengurangi perbedaan informasi saat penyerahan kembali."
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Level bahan bakar" required>
                  <select
                    value={draft.checklist.fuelLevel ?? ""}
                    onChange={(event) =>
                      updateDraft("checklist", {
                        ...draft.checklist,
                        fuelLevel: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="0">Kosong (0%)</option>
                    <option value="25">1/4 tangki (25%)</option>
                    <option value="50">1/2 tangki (50%)</option>
                    <option value="75">3/4 tangki (75%)</option>
                    <option value="100">Penuh (100%)</option>
                  </select>
                </Field>
                <Field
                  label="Kondisi bodi saat diterima"
                  required
                  helper="Contoh: baret halus bodi kiri, spion kanan retak."
                >
                  <textarea
                    value={draft.checklist.physicalCondition}
                    onChange={(event) =>
                      updateDraft("checklist", {
                        ...draft.checklist,
                        physicalCondition: event.target.value,
                      })
                    }
                    rows={4}
                    minLength={3}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                  />
                </Field>
                <Field
                  label="Catatan penerimaan"
                  helper="Catatan lain di luar kondisi fisik dan daftar barang."
                >
                  <textarea
                    value={draft.checklist.notes}
                    onChange={(event) =>
                      updateDraft("checklist", {
                        ...draft.checklist,
                        notes: event.target.value,
                      })
                    }
                    rows={4}
                    placeholder="Contoh: pelanggan meminta konfirmasi sebelum penggantian part"
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                  />
                </Field>
                <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-1 text-sm font-black text-slate-900">
                    Barang yang dititipkan
                  </legend>
                  <div className="mt-2 space-y-2">
                    {(
                      [
                        "Helm",
                        "STNK / dokumen kendaraan",
                        "Kunci tambahan",
                        "Box / bagasi tambahan",
                      ] as const
                    ).map((item) => (
                      <label
                        key={item}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-white"
                      >
                        <input
                          type="checkbox"
                          checked={draft.checklist.belongings.includes(item)}
                          onChange={(event) =>
                            updateDraft("checklist", {
                              ...draft.checklist,
                              belongings: event.target.checked
                                ? [...draft.checklist.belongings, item]
                                : draft.checklist.belongings.filter(
                                    (belonging) => belonging !== item,
                                  ),
                            })
                          }
                          className="size-5 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <span className="text-sm font-semibold text-slate-800">
                          {item}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            </StepShell>
          )}

          {draft.step === 5 && (
            <StepShell
              eyebrow="Langkah 5 dari 5"
              title="Review service order"
              description="Periksa kembali seluruh data sebelum membuat service order. Gunakan tombol kembali jika ada informasi yang perlu diperbaiki."
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <ReviewCard icon="user" title="Pelanggan">
                  <p className="font-black">{draft.customer?.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {draft.customer?.phone || draft.customer?.email}
                  </p>
                </ReviewCard>
                <ReviewCard icon="bike" title="Kendaraan">
                  <p className="font-black uppercase">
                    {draft.vehicle?.plateNumber}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {draft.vehicle?.model}
                    {draft.vehicle?.year
                      ? ` · ${draft.vehicle.year}`
                      : ""} · {Number(draft.odometer).toLocaleString("id-ID")}{" "}
                    km
                  </p>
                </ReviewCard>
                <ReviewCard icon="clipboard" title="Kebutuhan servis">
                  <p className="font-black">
                    {serviceLabels[draft.serviceType]}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                    {draft.complaint}
                  </p>
                </ReviewCard>
                <ReviewCard icon="check" title="Checklist">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Bahan bakar</dt>
                      <dd className="font-bold">
                        {draft.checklist.fuelLevel ?? 0}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Kondisi bodi</dt>
                      <dd className="mt-1 font-semibold text-slate-800">
                        {draft.checklist.physicalCondition}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Barang dititipkan</dt>
                      <dd className="font-bold">
                        {draft.checklist.belongings.length
                          ? draft.checklist.belongings.join(", ")
                          : "Tidak ada"}
                      </dd>
                    </div>
                  </dl>
                </ReviewCard>
              </div>
              {submitError && (
                <p
                  role="alert"
                  className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800"
                >
                  {submitError}
                </p>
              )}
              <button
                type="button"
                onClick={() => void submitOrder()}
                disabled={submitting}
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-base font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700 disabled:opacity-60"
              >
                {submitting && (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {submitting ? "Membuat service order..." : "Buat service order"}
              </button>
            </StepShell>
          )}
        </div>

        <div className="mt-5 hidden items-center justify-between gap-3 sm:flex">
          <button
            type="button"
            onClick={draft.step === 1 ? reset : back}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-800 hover:bg-slate-100"
          >
            {draft.step === 1 ? "Reset draft" : "Kembali"}
          </button>
          {draft.step < TOTAL_STEPS && (
            <button
              type="button"
              onClick={next}
              disabled={!canContinue()}
              className="min-h-11 rounded-xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
            >
              Lanjutkan
            </button>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:hidden">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={draft.step === 1 ? reset : back}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-800"
          >
            {draft.step === 1 ? "Reset" : "Kembali"}
          </button>
          {draft.step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={next}
              disabled={!canContinue()}
              className="min-h-12 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:bg-slate-300 disabled:text-slate-600"
            >
              Lanjutkan
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submitOrder()}
              disabled={submitting}
              className="min-h-12 rounded-xl bg-red-600 px-4 text-sm font-black text-white disabled:opacity-60"
            >
              {submitting ? "Memproses..." : "Buat SO"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function ReviewCard({
  icon,
  title,
  children,
}: {
  icon: "user" | "bike" | "clipboard" | "check";
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <span className="grid size-10 place-items-center rounded-xl bg-white text-blue-700 shadow-sm">
          <Icon name={icon} />
        </span>
        <h3 className="font-black text-slate-950">{title}</h3>
      </div>
      <div className="pt-4">{children}</div>
    </article>
  );
}
