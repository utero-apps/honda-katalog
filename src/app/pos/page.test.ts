import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const posPage = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const reception = readFileSync(
  new URL("../../components/service-reception/ServiceReceptionWorkspace.tsx", import.meta.url),
  "utf8",
);
const mobileNavigation = readFileSync(
  new URL("../../components/DashboardMobileNav.tsx", import.meta.url),
  "utf8",
);
const legacyReception = readFileSync(
  new URL("../service/reception/page.tsx", import.meta.url),
  "utf8",
);

describe("service order desk", () => {
  it("uses Service Order reception rather than retail POS on /pos", () => {
    expect(posPage).toContain("ServiceReceptionWorkspace");
    expect(posPage).toContain('mode="service-order"');
    expect(posPage).not.toContain("PosWorkspace");
  });

  it("opens created order detail and exposes Service Order navigation", () => {
    expect(reception).toContain('href={`/business/service-orders/${success.id}`}');
    expect(reception).toContain("Service Order Desk");
    expect(mobileNavigation).toContain('href="/pos"');
    expect(mobileNavigation).toContain("Buka SO");
    expect(mobileNavigation).toContain('href="/business/service-orders"');
  });

  it("keeps one canonical intake URL without deleting retail checkout", () => {
    expect(legacyReception).toContain('permanentRedirect("/pos")');
    expect(existsSync(new URL("../retail-pos/page.tsx", import.meta.url))).toBe(true);
    expect(reception).toContain("Order aktif");
  });
});
