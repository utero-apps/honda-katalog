import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/AccessibleDialog.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const businessWorkspace = readFileSync(new URL("../components/BusinessWorkspace.tsx", import.meta.url), "utf8");

describe("accessibility regressions", () => {
  it("keeps dialog semantics and complete keyboard behavior", () => {
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain('event.key === "Escape"');
    expect(dialog).toContain('event.key !== "Tab"');
    expect(dialog).toContain("previouslyFocusedRef.current?.focus");
  });

  it("associates form labels and validation errors", () => {
    for (const field of ["partCode", "name", "categoryId", "status", "het", "hpp", "unit", "minimumStock", "barcodes", "compatibleModelIds", "description"]) {
      expect(page).toContain(`fieldA11y("${field}")`);
      expect(page).toContain(`<FieldError errors={fieldErrors} name="${field}" />`);
    }
    expect(page).toContain('htmlFor="login-email"');
    expect(page).toMatch(/id="login-error"\s+role="alert"/);
  });

  it("preserves focus visibility, touch targets, and 360px layout", () => {
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("min-height: 44px");
    expect(styles).toContain("@media (max-width: 360px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("renders mobile page navigation and catalog feedback states", () => {
    expect(page).toContain('<DashboardMobileNav view={view} />');
    expect(page).toContain('Katalog belum dapat dimuat');
    expect(page).toContain('Produk tidak ditemukan');
    expect(page).toContain('aria-busy="true"');
  });

  it("keeps business workflow navigation and feedback accessible", () => {
    expect(businessWorkspace).toContain('aria-label="Navigasi modul bisnis"');
    expect(businessWorkspace).toContain('role="alert"');
    expect(businessWorkspace).toContain('aria-live="polite"');
    expect(businessWorkspace).toContain('data-dialog-initial-focus');
  });
});
