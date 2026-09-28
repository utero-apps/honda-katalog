export type Vehicle = {
  id: string;
  plateNumber: string;
  vehicleModelId?: string | null;
  model?: string | null;
  year?: number | null;
  odometer?: number | null;
};

export type VehicleModel = {
  id: string;
  name: string;
};

export type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  vehicles?: Vehicle[];
};

export type ServiceType = "general" | "monthly" | "mileage" | "routine";

export type ReceptionChecklist = {
  fuelLevel: number | null;
  physicalCondition: string;
  belongings: string[];
  notes: string;
};

export type ReceptionDraft = {
  step: number;
  customer: Customer | null;
  vehicle: Vehicle | null;
  odometer: string;
  odometerCorrectionReason: string;
  complaint: string;
  serviceType: ServiceType;
  checklist: ReceptionChecklist;
};

export type ServiceOrderResult = {
  id: string;
  orderNumber?: string;
  status?: string;
};

export type ApiEnvelope<T> = {
  data: T;
  error?: { message?: string; fields?: Record<string, string[]> } | null;
};
