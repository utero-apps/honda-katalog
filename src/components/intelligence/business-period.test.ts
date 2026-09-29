import { describe, expect, it } from "vitest";
import { delta, presetRange, previousPeriod } from "./business-period";

describe("business intelligence periods", () => {
  it("builds an equal-length previous period", () => {
    expect(previousPeriod("2026-09-01", "2026-09-30")).toEqual({
      from: "2026-08-02",
      to: "2026-08-31",
      exclusiveTo: "2026-09-01",
    });
  });

  it("keeps presets within the 92-day report limit", () => {
    expect(presetRange("month", "2026-09-29")).toEqual({ from: "2026-09-01", to: "2026-09-29" });
    expect(presetRange("last30", "2026-09-29")).toEqual({ from: "2026-08-31", to: "2026-09-29" });
    expect(presetRange("last90", "2026-09-29")).toEqual({ from: "2026-07-02", to: "2026-09-29" });
  });

  it("reports absolute and percentage deltas", () => {
    expect(delta(125, 100)).toEqual({ amount: 25, percent: 25 });
    expect(delta(20, 0)).toEqual({ amount: 20, percent: null });
  });
});
