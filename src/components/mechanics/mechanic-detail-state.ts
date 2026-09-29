export type MechanicPeriod = { from: string; to: string };
export type MechanicConfigInput = {
  userId: string;
  employeeCode: string;
  feePercent: number;
  isActive: boolean;
  monthlyTargetOrders: string;
  weeklyCapacityOrders: string;
  bonusPerCompletedOrder: string;
};

export function canManageMechanics(role: string | null | undefined) {
  return role === "owner" || role === "admin";
}

export function buildMechanicManagementPayload(input: MechanicConfigInput) {
  return {
    userId: input.userId,
    employeeCode: input.employeeCode,
    feePercent: input.feePercent,
    isActive: input.isActive,
    monthlyTargetOrders: Number(input.monthlyTargetOrders),
    weeklyCapacityOrders: Number(input.weeklyCapacityOrders),
    bonusPerCompletedOrder: Number(input.bonusPerCompletedOrder),
  };
}

export function buildMechanicDetailUrl(mechanicId: string, period: MechanicPeriod) {
  const query = new URLSearchParams();
  if (period.from) query.set("from", period.from);
  if (period.to) query.set("to", period.to);
  const suffix = query.toString();
  return `/api/v1/intelligence/mechanics/${mechanicId}${suffix ? `?${suffix}` : ""}`;
}

export function calculateServiceValue(jobs: Array<{ price: number }>) {
  const total = jobs.reduce((sum, job) => sum + Number(job.price || 0), 0);
  return { total, average: jobs.length ? total / jobs.length : 0 };
}
