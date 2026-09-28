export type HandoverChecklist = {
  vehicleChecked: boolean;
  belongingsReturned: boolean;
  keysReturned: boolean;
  workExplained: boolean;
  notes: string;
  confirmedBy?: string;
  confirmedAt?: string;
};

export type HandoverAsset = {
  id: string;
  kind: "final_photo" | "signature";
  mimeType: string;
  size: number;
  sha256: string;
  createdAt: string;
  url: string;
};

export type HandoverAssetsData = {
  serviceOrderId: string;
  status: string;
  handedOverAt: string | null;
  checklist: HandoverChecklist | null;
  assets: HandoverAsset[];
  readiness: {
    checklistReady: boolean;
    photoCount: number;
    hasSignature: boolean;
    ready: boolean;
  };
};

export const emptyHandoverChecklist: HandoverChecklist = {
  vehicleChecked: false,
  belongingsReturned: false,
  keysReturned: false,
  workExplained: false,
  notes: "",
};
