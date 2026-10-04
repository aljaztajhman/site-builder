import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, type AppConfig } from "@sb/config";
import { Repo, createDb, createFsStorage, migrate, type Platform, type Queue } from "@sb/platform";
import { createApp } from "../src/app.ts";
import { launchLine, launchProblems } from "../src/legal.tsx";

/**
 * The provider's facts and the legal pages (it-landing-claims): today's config has none of the facts, so every page
 * shows marked placeholders and the launch check fails; a filled config shows the facts and passes. The values below
 * are fictional test data, never shipped.
 */
const today = loadConfig();
const FILLED: AppConfig = {
  ...today,
  legal: {
    provider: { companyName: "Testno podjetje d.o.o.", address: "Testna ulica 1, 1000 Ljubljana", registrationNumber: "1234567000", taxNumber: "SI12345678", email: "info@primer.si" },
    terms: {
      cancellation: "Testno besedilo o odpovedi in vračilu.",
      liability: "Testno besedilo o odgovornosti.",
      changes: "Testno besedilo o spremembah pogojev.",
      law: "Testno besedilo o pravu in sodišču.",
    },
    lawyerReviewed: { privacy: true, terms: true },
  },
};

let dir: string;
let platform: Platform;
const apps = new Map<AppConfig, ReturnType<typeof createApp>>();
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-legal-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  for (const c of [today, FILLED]) apps.set(c, createApp({ platform, config: c, auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false } }));
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const page = async (c: AppConfig, p: string) => {
  const res = await apps.get(c)!.request(p);
  expect(res.status, p).toBe(200);
  expect(res.headers.get("x-robots-tag"), p).toContain("noindex");
  return res.text();
};
/** The marked placeholders on a page, as their text. */
const marks = (html: string) => [...html.matchAll(/<mark class="ph">\[([^\]]+)\]<\/mark>/g)].map((m) => m[1]);

describe("the launch check", () => {
  it("fails on today's config, naming every missing provider fact, unwritten point of the terms and unread draft", () => {
    const problems = launchProblems(today);
    expect(problems).toEqual([
      "legal.provider.companyName (polno ime podjetja) is not filled in",
      "legal.provider.address (naslov) is not filled in",
      "legal.provider.registrationNumber (matična številka) is not filled in",
      "legal.provider.taxNumber (davčna številka) is not filled in",
      "legal.provider.email (e-pošta) is not filled in",
      "legal.terms.cancellation (odpoved, vračilo plačila in odstop od pogodbe) is not written yet",
      "legal.terms.liability (odgovornost ponudnika) is not written yet",
      "legal.terms.changes (kako obveščamo o spremembah pogojev) is not written yet",
      "legal.terms.law (pravo in pristojno sodišče) is not written yet",
      "legal.lawyerReviewed.privacy: /zasebnost is a draft no lawyer has read",
      "legal.lawyerReviewed.terms: /pogoji is a draft no lawyer has read",
    ]);
    expect(launchLine(problems)).toMatch(/^\[web\] not ready for a public launch: legal\.provider\.companyName/);
  });

  it("passes on a filled config", () => {
    expect(launchProblems(FILLED)).toEqual([]);
    expect(launchLine([])).toBeNull();
  });

  it("refuses a malformed fact instead of showing it", async () => {
    const { AppConfigSchema } = await import("@sb/config");
    const bad = structuredClone(FILLED) as unknown as { legal: { provider: Record<string, unknown> } };
    bad.legal.provider.taxNumber = "123";
    expect(AppConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the legal pages", () => {
  it("show every provider fact as a marked placeholder while the config has none", async () => {
    const home = await page(today, "/");
    const footer = home.slice(home.indexOf("<footer"));
    expect(marks(footer)).toEqual(["e-pošta", "polno ime podjetja", "naslov", "matična številka", "davčna številka", "polno ime podjetja"]);
    // The footer links to all three legal pages; none of them is a dead label any more.
    for (const href of ["/zasebnost", "/pogoji", "/dostopnost"]) expect(footer).toContain(`href="${href}"`);
    expect(marks(await page(today, "/zasebnost"))).toEqual(["polno ime podjetja", "naslov", "e-pošta"]);
    const terms = await page(today, "/pogoji");
    expect(terms).toContain("Osnutek za pravni pregled");
    expect(marks(terms)).toEqual([
      "polno ime podjetja",
      "naslov",
      "matična številka",
      "davčna številka",
      "e-pošta",
      "odpoved, vračilo plačila in odstop od pogodbe: določi ponudnik s pravnikom",
      "odgovornost ponudnika: določi ponudnik s pravnikom",
      "kako obveščamo o spremembah pogojev: določi ponudnik s pravnikom",
      "pravo in pristojno sodišče: določi ponudnik s pravnikom",
    ]);
    expect(marks(await page(today, "/dostopnost"))).toEqual(["e-pošta"]);
  });

  it("the terms say only what config decides: plans, prices with VAT, limits; billing not started yet", async () => {
    const terms = await page(today, "/pogoji");
    const { standard, premium } = today.plans;
    expect(terms).toContain(`<strong>${standard.name}</strong>: ${standard.monthlyEur} € na mesec ali ${standard.yearlyEur} € na leto`);
    expect(terms).toContain(`<strong>${premium.name}</strong>: ${premium.monthlyEur} € na mesec ali ${premium.yearlyEur} € na leto`);
    expect(terms).toContain(`Do ${standard.site.maxPages} strani`);
    expect(terms).toContain("Cene vključujejo DDV.");
    expect(terms).toContain(`Če se v ${today.tiers.anonymous.keepDays} dneh ne prijavite, jo izbrišemo.`);
    expect(terms).toContain("Naročnin še ne zaračunavamo.");
    expect(terms).toContain("Ničesar si ne izmišljujemo");
  });

  it("show the facts and lose the draft notes once the config is filled", async () => {
    const home = await page(FILLED, "/");
    const footer = home.slice(home.indexOf("<footer"));
    expect(marks(footer)).toEqual([]);
    for (const v of ["Testno podjetje d.o.o.", "Testna ulica 1, 1000 Ljubljana", "1234567000", "SI12345678", 'href="mailto:info@primer.si"']) expect(footer).toContain(v);
    const privacy = await page(FILLED, "/zasebnost");
    expect(marks(privacy)).toEqual([]);
    expect(privacy).not.toContain("Osnutek");
    const terms = await page(FILLED, "/pogoji");
    expect(marks(terms)).toEqual([]);
    expect(terms).not.toContain("Osnutek");
    expect(terms).toContain("Testno besedilo o pravu in sodišču.");
    expect(marks(await page(FILLED, "/dostopnost"))).toEqual([]);
  });
});
