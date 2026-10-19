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

describe("billing switch", () => {
  it("refuses billingEnabled while billing.company still has a [[…]] placeholder", () => {
    const on = raw() as Raw & { billing: { company: Record<string, unknown> } };
    on.plans.billingEnabled = true;
    expect(parses(on)).toBe(false);
    on.billing.company = { name: "Postavi d.o.o.", address: "Trubarjeva 1, 1000 Ljubljana", taxId: "SI12345678", registrationNo: "1234567000", iban: null, email: "racuni@postavi.si" };
    expect(parses(on)).toBe(true);
  });
});

describe("plans (sb-pricing, sb-tiers)", () => {
  it("keeps billing off: nothing is charged before the legal entity exists (sb-legal-entity)", () => {
    expect(loadConfig().plans.billingEnabled).toBe(false);
  });

  it("parses the repo's plans: Osnovni and a dearer Plus, VAT included, both paid by card", () => {
    const plans = AppConfigSchema.parse(raw()).plans;
    expect(plans.vatIncluded).toBe(true);
    expect("yearlyPayment" in plans.standard).toBe(false);
    expect(plans.premium.monthlyEur).toBeGreaterThan(plans.standard.monthlyEur);
  });

  it("makes money on every paid customer, even one who uses the whole AI allowance", () => {
    const { plans } = loadConfig();
    for (const k of PLAN_KEYS) {
      const m = planMargins(plans[k], plans.costs);
      expect(m.monthly, `${k} monthly`).toBeGreaterThan(0);
      expect(m.yearly, `${k} yearly`).toBeGreaterThan(0);
      if (m.foundingYear !== null) expect(m.foundingYear, `${k} founding year`).toBeGreaterThan(0);
      if (m.foundingRenewalYear !== null) expect(m.foundingRenewalYear, `${k} founding renewal year`).toBeGreaterThan(0);
    }
    // Plus earns more per year than Osnovni.
    expect(planMargins(plans.premium, plans.costs).yearly).toBeGreaterThan(planMargins(plans.standard, plans.costs).yearly);
    // Every price is paid by card (Stripe, 2026-10-19): 1.5 % + €0.25 of the gross comes off too.
    const card = (gross: number) => gross * 0.015 + 0.25;
    // Worked by hand for Osnovni yearly (sb-pricing-2): 190 / 1.22 = 155.74, minus the card fee 3.10, minus 12 × 1.50 + 3 (AI), 6 (hosting), 13 (domain) = 112.64.
    expect(planMargins(plans.standard, plans.costs).yearly).toBeCloseTo(190 / 1.22 - card(190) - 40, 6);
    // Plus yearly: 390 / 1.22 = 319.67, minus 6.10 (card), minus 12 × 3.50 + 3 (AI), 6, 13 = 249.57.
    expect(planMargins(plans.premium, plans.costs).yearly).toBeCloseTo(390 / 1.22 - card(390) - 64, 6);
    // Founding year: 99 / 1.22 = 81.15, minus 1.74 (card), minus the same 40 = 39.41.
    expect(planMargins(plans.standard, plans.costs).foundingYear).toBeCloseTo(99 / 1.22 - card(99) - 40, 6);
    // Founding renewal (20 % off for life): 190 × 0.8 = 152 / 1.22 = 124.59, minus 2.53 (card), minus 40 = 82.06. Plus has no founding offer.
    expect(planMargins(plans.standard, plans.costs).foundingRenewalYear).toBeCloseTo(152 / 1.22 - card(152) - 40, 6);
    expect(planMargins(plans.premium, plans.costs).foundingRenewalYear).toBeNull();
  });

  it("the repo's prices are the ones the owner decided (sb-pricing-2, 2026-10-19)", () => {
    const { plans } = loadConfig();
    expect([plans.standard.monthlyEur, plans.standard.yearlyEur, plans.standard.setupService.eur]).toEqual([19, 190, 149]);
    expect([plans.premium.monthlyEur, plans.premium.yearlyEur, plans.premium.setupService.eur]).toEqual([39, 390, 149]);
    expect(plans.standard.foundingOffer).toEqual({ customers: 100, firstYearEur: 99, renewalDiscountPercent: 20 });
  });

  it("refuses a founding renewal discount that would lose money, and one outside 0-99", () => {
    const offer = (renewalDiscountPercent: number) => withPlan("standard", { foundingOffer: { customers: 100, firstYearEur: 99, renewalDiscountPercent } });
    expect(parses(offer(20))).toBe(true);
    expect(parses(offer(0))).toBe(true);
    // 80 % off leaves 190 × 0.2 = 38 / 1.22 = 31.15, which does not cover the 40 a year costs us.
    expect(parses(offer(80))).toBe(false);
    expect(parses(offer(100))).toBe(false);
    expect(parses(offer(-5))).toBe(false);
    expect(parses(offer(12.5))).toBe(false);
  });

  it("refuses a config where a plan, the founding year or the top-up could lose money", () => {
    expect(parses(withPlan("standard", { ai: { allowanceEurPerMonth: 12, firstMonthExtraEur: 3 } }))).toBe(false);
    expect(parses(withPlan("standard", { foundingOffer: { customers: 100, firstYearEur: 45 } }))).toBe(false);
    const topUp = raw();
    topUp.plans.aiTopUp = { eur: 5, allowanceEur: 4.5, maxPerMonth: 2 };
    expect(parses(topUp)).toBe(false);
    // Plus can't be the cheaper plan.
    expect(parses(withPlan("premium", { monthlyEur: 18, yearlyEur: 180 }))).toBe(false);
  });

  it("refuses offers that don't add up", () => {
    expect(parses(withPlan("standard", { yearlyEur: 228, monthlyEur: 19 }))).toBe(false);
    expect(parses(withPlan("standard", { foundingOffer: { customers: 100, firstYearEur: 190 } }))).toBe(false);
    expect(parses(withPlan("standard", { monthlyEurRange: [15, 19] }))).toBe(false);
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
