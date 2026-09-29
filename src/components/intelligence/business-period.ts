const DAY = 86_400_000;

export function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, offset: number) {
  return dateKey(new Date(Date.parse(`${day}T00:00:00.000Z`) + offset * DAY));
}

export function previousPeriod(from: string, to: string) {
  const length = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  return { from: shiftDay(from, -length), to: shiftDay(from, -1), exclusiveTo: from };
}

export function presetRange(preset: "month" | "last30" | "last90", today: string) {
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: shiftDay(today, preset === "last30" ? -29 : -89), to: today };
}

export function delta(current: number, previous: number) {
  return { amount: current - previous, percent: previous === 0 ? null : Number(((current - previous) / Math.abs(previous) * 100).toFixed(1)) };
}
