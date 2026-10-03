import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppConfigSchema, PLAN_KEYS, loadConfig, planMargins, repoRoot } from "../src/index.ts";

type Raw = { plans: Record<string, unknown> & { standard: Record<string, unknown>; premium: Record<string, unknown> }; tiers: { free: Record<string, unknown> } };
const raw = () => JSON.parse(readFileSync(path.join(repoRoot, "config/app.config.json"), "utf8")) as Raw;
const withPlan = (key: "standard" | "premium", patch: Record<string, unknown>) => {
  const config = raw();
  config.plans[key] = { ...config.plans[key], ...patch };
  return config;
};
const parses = (c: unknown) => AppConfigSchema.safeParse(c).success;

describe("plans (sb-pricing, sb-tiers)", () => {
  it("keeps billing off: nothing is charged before the legal entity exists (sb-legal-entity)", () => {
    expect(loadConfig().plans.billingEnabled).toBe(false);
  });

  it("parses the repo's plans: Osnovni and a dearer Plus, VAT included, yearly by bank transfer", () => {
    const plans = AppConfigSchema.parse(raw()).plans;
    expect(plans.vatIncluded).toBe(true);
    expect(plans.standard.yearlyPayment).toBe("invoice-bank-transfer");
    expect(plans.premium.monthlyEur).toBeGreaterThan(plans.standard.monthlyEur);
  });

  it("makes money on every paid customer, even one who uses the whole AI allowance", () => {
    const { plans } = loadConfig();
    for (const k of PLAN_KEYS) {
      const m = planMargins(plans[k], plans.costs);
      expect(m.monthly, `${k} monthly`).toBeGreaterThan(0);
      expect(m.yearly, `${k} yearly`).toBeGreaterThan(0);
      if (m.foundingYear !== null) expect(m.foundingYear, `${k} founding year`).toBeGreaterThan(0);
    }
    // Plus earns more per year than Osnovni.
    expect(planMargins(plans.premium, plans.costs).yearly).toBeGreaterThan(planMargins(plans.standard, plans.costs).yearly);
    // Worked by hand for Osnovni yearly: 150 / 1.22 = 122.95, minus 12 × 1.50 + 3 (AI), 6 (hosting), 13 (domain) = 82.95.
    expect(planMargins(plans.standard, plans.costs).yearly).toBeCloseTo(150 / 1.22 - 40, 6);
  });

  it("refuses a config where a plan, the founding year or the top-up could lose money", () => {
    expect(parses(withPlan("standard", { ai: { allowanceEurPerMonth: 12, firstMonthExtraEur: 3 } }))).toBe(false);
    expect(parses(withPlan("standard", { foundingOffer: { customers: 100, firstYearEur: 45 } }))).toBe(false);
    const topUp = raw();
    topUp.plans.aiTopUp = { eur: 5, allowanceEur: 4.5, maxPerMonth: 2 };
    expect(parses(topUp)).toBe(false);
    // Plus can't be the cheaper plan.
    expect(parses(withPlan("premium", { monthlyEur: 14, yearlyEur: 140 }))).toBe(false);
  });

  it("refuses offers that don't add up", () => {
    expect(parses(withPlan("standard", { yearlyEur: 180, monthlyEur: 15 }))).toBe(false);
    expect(parses(withPlan("standard", { foundingOffer: { customers: 100, firstYearEur: 150 } }))).toBe(false);
    expect(parses(withPlan("standard", { monthlyEurRange: [12, 19] }))).toBe(false);
    const vat = raw();
    vat.plans.vatIncluded = false;
    expect(parses(vat)).toBe(false);
  });

  it("caps what a free account may ever cost at micro losses", () => {
    expect(loadConfig().tiers.free.lifetimeEur).toBeLessThanOrEqual(1);
    const free = raw();
    free.tiers.free = { ...free.tiers.free, lifetimeEur: 5 };
    expect(parses(free)).toBe(false);
  });
});
