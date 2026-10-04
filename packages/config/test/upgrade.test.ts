import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppConfigSchema, loadConfig, repoRoot, upgradeQuote } from "../src/index.ts";

/**
 * Osnovni → Plus at renewal or before it (docs/plans/pricing-tiers.md, config `plans.upgrade`): the unused whole
 * months already paid for come off Plus's price. Billing doesn't exist yet; this is the rule it will charge by.
 */
const { plans } = loadConfig();
const raw = () => JSON.parse(readFileSync(path.join(repoRoot, "config/app.config.json"), "utf8")) as { plans: Record<string, Record<string, unknown> & { site: Record<string, unknown> }> };

describe("upgradeQuote (plans.upgrade = unused-whole-months)", () => {
  const start = new Date("2026-01-15T09:00:00Z");
  const end = new Date("2027-01-15T09:00:00Z");

  it("credits the whole months left of a yearly Osnovni against a year of Plus", () => {
    // 4 months and a bit used: 7 whole months left of 12 → 150 × 7 / 12 = 87.50 off 290.
    const q = upgradeQuote(plans, { from: "standard", to: "premium", period: "yearly", paidEur: 150, periodStart: start, periodEnd: end, now: new Date("2026-05-20T12:00:00Z") });
    expect(q).toEqual({ unusedMonths: 7, creditEur: 87.5, priceEurNew: 290, dueEur: 202.5 });
  });

  it("credits the founding year by what was paid for it (€99), not the list price", () => {
    const q = upgradeQuote(plans, { from: "standard", to: "premium", period: "yearly", paidEur: 99, periodStart: start, periodEnd: end, now: new Date("2026-07-15T09:00:00Z") });
    expect(q.unusedMonths).toBe(6);
    expect(q.creditEur).toBe(49.5);
    expect(q.dueEur).toBe(240.5);
  });

  it("at renewal (the period over) nothing is left to credit; a part month is never credited", () => {
    expect(upgradeQuote(plans, { from: "standard", to: "premium", period: "yearly", paidEur: 150, periodStart: start, periodEnd: end, now: end })).toMatchObject({ unusedMonths: 0, creditEur: 0, dueEur: 290 });
    // Monthly: 20 days left of the month is not a whole month.
    const monthEnd = new Date("2026-02-15T09:00:00Z");
    expect(upgradeQuote(plans, { from: "standard", to: "premium", period: "monthly", paidEur: 15, periodStart: start, periodEnd: monthEnd, now: new Date("2026-01-26T09:00:00Z") })).toEqual({ unusedMonths: 0, creditEur: 0, priceEurNew: 29, dueEur: 29 });
    // On the first day of a monthly period the whole month is left.
    expect(upgradeQuote(plans, { from: "standard", to: "premium", period: "monthly", paidEur: 15, periodStart: start, periodEnd: monthEnd, now: start }).dueEur).toBe(14);
  });

  it("only moves up", () => {
    expect(() => upgradeQuote(plans, { from: "premium", to: "standard", period: "yearly", paidEur: 290, periodStart: start, periodEnd: end, now: start })).toThrow(/not dearer/);
  });
});

describe("plan limits in config (it-plan-limits)", () => {
  it("refuses a Plus that allows less than Osnovni (the upsell would name a plan that adds nothing)", () => {
    const c = raw();
    c.plans.premium!.site = { ...c.plans.premium!.site, maxPages: 4 };
    expect(AppConfigSchema.safeParse(c).success).toBe(false);
    const d = raw();
    d.plans.standard!.site = { ...d.plans.standard!.site, collections: ["blog"] };
    d.plans.premium!.site = { ...d.plans.premium!.site, collections: ["events"] };
    expect(AppConfigSchema.safeParse(d).success).toBe(false);
    expect(AppConfigSchema.safeParse(raw()).success).toBe(true);
  });
});
