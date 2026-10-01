import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppConfigSchema, loadConfig, repoRoot } from "../src/index.ts";

const raw = () => JSON.parse(readFileSync(path.join(repoRoot, "config/app.config.json"), "utf8")) as { plans: { paid: Record<string, unknown> } };
const withPaid = (patch: Record<string, unknown>) => {
  const config = raw();
  config.plans.paid = { ...config.plans.paid, ...patch };
  return config;
};

describe("paid plan config (sb-pricing)", () => {
  it("keeps billing off: nothing is charged before the legal entity exists (sb-legal-entity)", () => {
    expect(loadConfig().plans.paid.billingEnabled).toBe(false);
  });

  it("parses the repo's plan", () => {
    const paid = AppConfigSchema.parse(raw()).plans.paid;
    expect(paid.vatIncluded).toBe(true);
    expect(paid.yearlyPayment).toBe("invoice-bank-transfer");
  });

  it("rejects offers that don't add up", () => {
    expect(AppConfigSchema.safeParse(withPaid({ yearlyEur: 180, monthlyEur: 15 })).success).toBe(false);
    expect(AppConfigSchema.safeParse(withPaid({ foundingOffer: { customers: 100, firstYearEur: 150 } })).success).toBe(false);
    expect(AppConfigSchema.safeParse(withPaid({ vatIncluded: false })).success).toBe(false);
    expect(AppConfigSchema.safeParse(withPaid({ monthlyEurRange: [12, 19], monthlyEur: undefined })).success).toBe(false);
  });
});
