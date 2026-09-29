import { describe, expect, it } from "vitest";
import { canIssueCustomerFeedbackLink, toAbsoluteFeedbackUrl } from "./CustomerFeedbackPanel";

describe("CustomerFeedbackPanel", () => {
  it("hanya mengizinkan owner, admin, dan cashier", () => {
    expect(canIssueCustomerFeedbackLink("owner")).toBe(true);
    expect(canIssueCustomerFeedbackLink("admin")).toBe(true);
    expect(canIssueCustomerFeedbackLink("cashier")).toBe(true);
    expect(canIssueCustomerFeedbackLink("mechanic")).toBe(false);
    expect(canIssueCustomerFeedbackLink("warehouse")).toBe(false);
  });

  it("mengubah path API menjadi URL pelanggan yang dapat disalin", () => {
    expect(toAbsoluteFeedbackUrl("/service-feedback/token", "https://service.example")).toBe("https://service.example/service-feedback/token");
  });
});
