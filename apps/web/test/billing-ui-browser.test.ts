// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { serve, type ServerType } from "@hono/node-server";
import { loadConfig } from "@sb/config";
import { launchCheckBrowser, runAxe, type AxeViolation, type CheckBrowser } from "@sb/engine";
import { Repo, createDb, createFsStorage, memoryMailer, migrate, type BillingSummary, type CheckoutRequest, type InvoiceView, type Platform, type Queue, type SubscriptionView } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { renderNarocnina, type NarocninaProps } from "../src/narocnina.tsx";
import { renderInvoiceHtml } from "../src/invoice-view.tsx";
import { linkFor } from "./session-helpers.ts";

/**
 * The owner-facing billing screens (M4 payments, Unit B) in Chromium at 360 and 1280 px, with GET /api/billing and
 * the checkout/portal answers stubbed in the browser (no Stripe, no backend billing): a free owner's Objavi opens
 * "Izberite paket" with the prices, founding line and setup service, and "Na plačilo" posts the choice and goes
 * where the answer says; /narocnina in each state (rendered from a stubbed summary); the invoice on A4. Axe finds
 * nothing, nothing scrolls sideways. SB_SCREENSHOT_DIR=<dir> saves a screenshot of each.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SB_SCREENSHOT_DIR;
const mail = memoryMailer();
let platform: Platform;
let dir: string;
let server: ServerType;
let base: string;
let cb: CheckBrowser;
let golden: SiteSpec;

const PERIOD_END = "2027-10-19T10:00:00.000Z";
const SUMMARY: BillingSummary = {
  enabled: true,
  subscription: null,
  grantedByAdmin: false,
  invoices: [],
  prices: { standard: { name: "Osnovni", monthEur: 19, yearEur: 190 }, premium: { name: "Plus", monthEur: 39, yearEur: 390 } },
  founding: { left: 37, firstYearEur: 99, renewalEur: 152 },
  setup: { eur: 149, includedYearly: { standard: false, premium: true } },
};
const sub = (o: Partial<SubscriptionView>): SubscriptionView => ({ plan: "standard", interval: "year", status: "active", currentPeriodEnd: PERIOD_END, cancelAtPeriodEnd: false, founding: false, entitled: true, ...o });
const INVOICES = [
  { id: "inv_2", number: "2026-00002", issuedAt: "2026-10-19T10:00:00.000Z", totalEur: 99, url: "/racun/inv_2" },
  { id: "inv_1", number: "2026-00001", issuedAt: "2026-09-19T10:00:00.000Z", totalEur: 19, url: "/racun/inv_1" },
];

/** Every /narocnina state the page knows, by name. */
const STATES: Record<string, Omit<NarocninaProps, "email" | "csrf">> = {
  none: { summary: SUMMARY },
  active: { summary: { ...SUMMARY, subscription: sub({ founding: true }), invoices: INVOICES } },
  ending: { summary: { ...SUMMARY, subscription: sub({ cancelAtPeriodEnd: true, plan: "premium", interval: "month" }), invoices: INVOICES } },
  past_due: { summary: { ...SUMMARY, subscription: sub({ status: "past_due" }), invoices: INVOICES }, graceEndsAt: "2026-10-26T10:00:00.000Z" },
  past_due_over: { summary: { ...SUMMARY, subscription: sub({ status: "past_due", entitled: false }), invoices: INVOICES } },
  canceled: { summary: { ...SUMMARY, subscription: sub({ status: "canceled", entitled: false, currentPeriodEnd: "2026-09-30T10:00:00.000Z" }), invoices: INVOICES } },
  granted: { summary: { ...SUMMARY, grantedByAdmin: true } },
  uspeh: { summary: { ...SUMMARY, subscription: sub({}), invoices: INVOICES.slice(0, 1) }, notice: "uspeh" },
  uspeh_pending: { summary: SUMMARY, notice: "uspeh" },
  preklic: { summary: SUMMARY, notice: "preklic" },
  off: { summary: { ...SUMMARY, enabled: false, founding: null } },
};

const INVOICE: InvoiceView = {
  id: "inv_2",
  number: "2026-00002",
  issuedAt: "2026-10-19T10:00:00.000Z",
  serviceFrom: "2026-10-19T10:00:00.000Z",
  serviceTo: "2027-10-19T10:00:00.000Z",
  paidAt: "2026-10-19T10:00:00.000Z",
  paymentMethod: "card",
  seller: { name: "[[Ime podjetja d.o.o.]]", address: "[[Ulica 1, 1000 Ljubljana]]", taxId: "[[SI12345678]]", registrationNo: "[[1234567000]]", email: "[[racuni@postavi.si]]" },
  buyer: { name: "Pekarna Kvas, Ana Novak s.p.", email: "ana@pekarna-kvas.si", address: "Šutna 30, 1241 Kamnik", taxId: "SI87654321" },
  lines: [
    { text: "Naročnina Osnovni, letno (19. 10. 2026 – 19. 10. 2027), ustanovna cena", qty: 1, unitGrossEur: 99 },
    { text: "Postavitev skupaj z vami", qty: 1, unitGrossEur: 149 },
  ],
  vat: { mode: "included", rate: 0.22, netEur: 203.28, vatEur: 44.72 },
  totalEur: 248,
  fiscal: null,
  notes: ["Plačano s plačilno kartico. Račun je plačan."],
};

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-billing-ui-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({ platform, config: loadConfig(), mailer: mail, auth: { password: "test-password-1234", secret: "s".repeat(32), secureCookies: false } });
  // The pages the backend mounts, here with stubbed data; everything else is the real app (assets, editor, sign-in).
  const outer = new Hono();
  outer.get("/t/narocnina/:state", (c) => c.html(renderNarocnina({ ...STATES[c.req.param("state")]!, email: "ana@pekarna-kvas.si", csrf: "x" })));
  outer.get("/t/racun", (c) => c.html(renderInvoiceHtml(INVOICE)));
  outer.get("/t/stripe", (c) => c.text("Stripe (stub)"));
  outer.all("*", (c) => app.fetch(c.req.raw));
  server = serve({ fetch: outer.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((r) => server.once("listening", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  cb = await launchCheckBrowser();
}, 120_000);

afterAll(async () => {
  await cb?.close();
  server?.close();
  await platform?.close();
  await rm(dir, { recursive: true, force: true });
}, 60_000);

type Page = Awaited<ReturnType<CheckBrowser["browser"]["newPage"]>>;
const norm = (s: string | null): string => (s ?? "").replace(/\u00a0/g, " ");
const describeAxe = (v: AxeViolation[]) => v.map((x) => `${x.id} (${x.impact}, ${x.nodes}): ${x.targets.join(" | ")}`);

async function check(page: Page, width: number, name: string, fullPage = false): Promise<void> {
  expect(describeAxe(await runAxe(page)), name).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(width);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `billing-${name}-${width}.png`), fullPage });
}

async function context(width: number) {
  const ctx = await cb.browser.newContext({ viewport: { width, height: width > 900 ? 900 : 780 }, reducedMotion: "reduce", ...(width < 500 ? { isMobile: true, hasTouch: true } : {}) });
  ctx.setDefaultTimeout(60_000);
  return ctx;
}

async function signIn(page: Page, email: string): Promise<string> {
  await page.goto(`${base}/login`);
  await page.locator("#email").fill(email);
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Pošlji povezavo" }).click()]);
  await page.goto(linkFor(mail.sent, email));
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Prijava" }).click()]);
  return (await platform.repo.accounts.byKey(email))!.id;
}

/** Stubs the billing API in this page; returns the checkout bodies posted. */
async function stubBilling(page: Page, summary: BillingSummary): Promise<CheckoutRequest[]> {
  const posted: CheckoutRequest[] = [];
  await page.route("**/api/billing", (r) => r.fulfill({ json: summary }));
  await page.route("**/api/billing/checkout", (r) => {
    posted.push(r.request().postDataJSON() as CheckoutRequest);
    return r.fulfill({ json: { url: `${base}/t/stripe` } });
  });
  await page.route("**/api/billing/portal", (r) => r.fulfill({ json: { url: `${base}/t/stripe` } }));
  return posted;
}

describe.each([1280, 360])("billing screens at %i px", (width) => {
  it("a free owner's Objavi opens the plan sheet; Na plačilo posts the choice and goes to payment", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      const accountId = await signIn(page, `placa${width}@siol.net`);
      const s = await platform.repo.createSite({ name: "Pekarna Kvas", slug: `placilo-${width}`, intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, accountId });
      await platform.repo.saveSpec(s.id, { ...golden, slug: `placilo-${width}` }, "generate");
      await platform.repo.setStatus(s.id, "ready");
      const posted = await stubBilling(page, SUMMARY);
      await page.goto(`${base}/sites/${s.id}`);
      await page.frameLocator('iframe[title="Predogled strani"]').locator("main").waitFor();
      await page.locator(".top .publish").click();
      const sheet = page.getByRole("dialog", { name: "Izberite paket" });
      await sheet.waitFor();
      // Yearly first: Osnovni at the founding price, Plus at its yearly price with the saving.
      const options = sheet.locator(".plan-option");
      expect(norm(await options.nth(0).textContent())).toBe("Osnovni99 € prvo letoUstanovna cena za Osnovni letno: prvo leto 99 €, nato 152 € na leto · še 37 prostih mest");
      expect(norm(await options.nth(1).textContent())).toBe("Plus390 € na letoLetno prihranite 78 €.");
      expect(norm(await sheet.locator("#plan-pay").textContent())).toBe("Danes plačate 99 €, nato 152 € vsako leto.");
      expect(await sheet.getByText("Plačilo s kartico prek Stripe.", { exact: false }).count()).toBe(1);
      // The tap targets: 44 px at least.
      for (const box of [await sheet.getByRole("button", { name: "Na plačilo" }).boundingBox(), await sheet.locator(".plan-seg span").first().boundingBox(), await sheet.getByRole("button", { name: "Zapri" }).boundingBox()]) expect(box!.height).toBeGreaterThanOrEqual(44);
      await check(page, width, "sheet-year");
      // Plus yearly includes the setup service; monthly it is a checkbox.
      await options.nth(1).click();
      expect(await sheet.locator(".plan-included").textContent()).toBe("Postavitev skupaj z vami je v letnem paketu Plus vključena.");
      await sheet.getByText("Mesečno", { exact: true }).click();
      expect(norm(await options.nth(1).textContent())).toBe("Plus39 € na mesecali 390 € na leto");
      await sheet.getByText("Postavitev skupaj z vami, enkratno 149 €").click();
      expect(norm(await sheet.locator("#plan-pay").textContent())).toBe("Danes plačate 188 €, nato 39 € vsak mesec.");
      await check(page, width, "sheet-month");
      await Promise.all([page.waitForURL(`${base}/t/stripe`), sheet.getByRole("button", { name: "Na plačilo" }).click()]);
      expect(posted).toEqual([{ plan: "premium", interval: "month", setup: true }]);
    } finally {
      await ctx.close();
    }
  }, 120_000);

  it("the plan sheet says why checkout failed and stays open", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      await stubBilling(page, SUMMARY);
      await page.route("**/api/billing/checkout", (r) => r.fulfill({ status: 409, json: { code: "already_subscribed", message: "x" } }));
      await page.goto(`${base}/t/narocnina/none`);
      await page.getByRole("button", { name: "Izberite paket" }).click();
      const sheet = page.getByRole("dialog", { name: "Izberite paket" });
      await sheet.getByRole("button", { name: "Na plačilo" }).click();
      await expect.poll(() => sheet.locator("#plan-sheet-error").textContent()).toBe("Naročnino že imate. Paket spremenite na strani Naročnina.");
      await page.keyboard.press("Escape");
      await expect.poll(() => page.locator("#plan-sheet").count()).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 60_000);

  const EXPECT: Record<string, string[]> = {
    none: ["Brez naročnine", "Za objavo strani izberite paket.", "Osnovni19 € na mesec ali 190 € na leto", "še 37 prostih mest", "Računov še ni."],
    active: ["Aktivna", "Osnovni, letno", "Ustanovna cena", "Naslednje plačilo19. oktober 2027", "Račun 2026-00002"],
    ending: ["Preklicana", "Plus, mesečno", "Velja do19. oktober 2027", "Naročnino ste preklicali."],
    past_due: ["Plačilo ni uspelo", "Posodobite kartico do 26. oktober 2026"],
    past_due_over: ["zato strani zdaj ne morete objavljati"],
    canceled: ["Potekla", "Naročnina je potekla 30. september 2026."],
    granted: ["Dodeljena", "Plačilo ni potrebno."],
    uspeh: ["Hvala, plačilo je uspelo. Stran lahko zdaj objavite. Račun smo poslali na ana@pekarna-kvas.si.", "Aktivna"],
    uspeh_pending: ["Hvala, plačilo obdelujemo."],
    preklic: ["Plačila niste zaključili, zato vam ničesar nismo zaračunali."],
    off: ["Plačevanje še ni na voljo."],
  };
  const BUTTONS: Record<string, string | null> = { none: "Izberite paket", active: "Spremeni ali prekliči", ending: "Obnovi ali spremeni", past_due: "Plačaj zdaj", past_due_over: "Plačaj zdaj", canceled: "Izberite paket", granted: null, uspeh: "Spremeni ali prekliči", uspeh_pending: "Izberite paket", preklic: "Izberite paket", off: null };

  it("/narocnina in every state: what it says, its one button, axe clean", async () => {
    const ctx = await context(width);
    const page = await ctx.newPage();
    try {
      await stubBilling(page, SUMMARY);
      for (const state of Object.keys(STATES)) {
        await page.goto(`${base}/t/narocnina/${state}`);
        const text = norm(await page.locator("main").textContent());
        for (const want of EXPECT[state]!) expect(text, state).toContain(want);
        const buttons = page.locator("[data-billing-action]:visible");
        expect(await buttons.allTextContents(), state).toEqual(BUTTONS[state] ? [BUTTONS[state]] : []);
        if (BUTTONS[state]) expect((await buttons.first().boundingBox())!.height, state).toBeGreaterThanOrEqual(44);
        await check(page, width, `narocnina-${state}`, true);
      }
      // The invoices link to the HTML view and its PDF.
      await page.goto(`${base}/t/narocnina/active`);
      expect(await page.locator(".invoice-list a").evaluateAll((as) => as.map((a) => a.getAttribute("href")))).toEqual(["/racun/inv_2", "/racun/inv_2.pdf", "/racun/inv_1", "/racun/inv_1.pdf"]);
      // "Spremeni ali prekliči" goes to the portal's answer.
      await Promise.all([page.waitForURL(`${base}/t/stripe`), page.getByRole("button", { name: "Spremeni ali prekliči" }).click()]);
    } finally {
      await ctx.close();
    }
  }, 120_000);
});

describe("the invoice", () => {
  it("prints on one A4 page and reads well on a phone", async () => {
    const ctx = await cb.browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/t/racun`);
      const text = norm(await page.locator("main").textContent());
      for (const want of ["Račun", "št. 2026-00002", "Pekarna Kvas, Ana Novak s.p.", "Datum izdaje19. 10. 2026", "Plačilna kartica", "Osnova brez DDV203,28 €", "DDV 22 %44,72 €", "Skupaj248,00 €", "ID za DDV: [[SI12345678]]"]) expect(text).toContain(want);
      expect(await page.getByRole("link", { name: "Prenesi PDF" }).getAttribute("href")).toBe("/racun/inv_2.pdf");
      await check(page, 1280, "invoice", true);
      // Printed: the sheet only, on one A4 page.
      await page.emulateMedia({ media: "print" });
      expect(await page.getByRole("link", { name: "Prenesi PDF" }).isVisible()).toBe(false);
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages).toBe(1);
      if (SHOTS) {
        await page.setViewportSize({ width: 794, height: 1123 });
        await page.screenshot({ path: path.join(SHOTS, "billing-invoice-a4-print.png"), fullPage: true });
      }
    } finally {
      await ctx.close();
    }
    const phone = await context(360);
    const p = await phone.newPage();
    try {
      await p.goto(`${base}/t/racun`);
      await check(p, 360, "invoice", true);
    } finally {
      await phone.close();
    }
  }, 90_000);
});
