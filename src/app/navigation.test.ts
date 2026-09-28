import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const mobileNavigation = readFileSync(new URL("../components/DashboardMobileNav.tsx", import.meta.url), "utf8");

describe("dashboard navigation", () => {
  it("uses application routes rather than content anchors", () => {
    expect(page).toContain('import Link from "next/link"');
    expect(page).toContain('href="/catalog"');
    expect(page).toContain('href="/business"');
    expect(page).not.toContain('href="#workspace"');
    expect(page).not.toContain('href="#catalog"');
  });

  it("tracks active page and retains accessible main navigation", () => {
    expect(page).toContain("usePathname()");
    expect(page).toContain('aria-current={view === "dashboard" ? "page" : undefined}');
    expect(page).toContain('aria-current={view === "catalog" ? "page" : undefined}');
    expect(page).toContain('aria-current={view === "business" ? "page" : undefined}');
    expect(page).toContain('aria-label="Navigasi utama"');
    expect(page).toContain('<DashboardMobileNav view={view} />');
    expect(page).toContain('href="#main-content"');
  });

  it("provides dedicated catalog and business routes", () => {
    expect(existsSync(new URL("./catalog/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("./business/page.tsx", import.meta.url))).toBe(true);
    expect(existsSync(new URL("./business/[module]/page.tsx", import.meta.url))).toBe(true);
  });

  it("treats nested business routes as the business area", () => {
    expect(page).toContain('pathname.startsWith("/business/")');
    expect(page).toContain('<BusinessWorkspace role={user.role} />');
  });

  it("keeps all primary pages reachable on mobile", () => {
    expect(mobileNavigation).toContain('aria-label="Navigasi utama mobile"');
    expect(mobileNavigation).toContain('href: "/"');
    expect(mobileNavigation).toContain('href: "/catalog"');
    expect(mobileNavigation).toContain('href: "/business"');
    expect(mobileNavigation).toContain('aria-current={view === item.view ? "page" : undefined}');
  });
});
