// @module-tag slow
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import {
  Repo,
  createDb,
  createFsStorage,
  lookupKey,
  memoryMailer,
  memoryStripe,
  migrate,
  signStripePayload,
  syncStripePrices,
  type BillingSummary,
  type Platform,
  type Queue,
  type StripePrice,
} from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { createApp } from "../src/app.ts";
import { ownerSignIn, type Browser, type Req } from "./session-helpers.ts";

/**
 * Billing through a fake Stripe (no network): checkout → Stripe's webhook (signed like Stripe signs) → an active plan
 * and invoice 2026-00001 → publishing allowed; a failed renewal keeps rights for the grace days, a deleted
 * subscription takes them away; replays and bad signatures change nothing.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const PASSWORD = "test-password-1234";
const WHSEC = "whsec_flow_test";
const config = loadConfig();
const mail = memoryMailer();
const stripe = memoryStripe();
let platform: Platform;
let dir: string;
let req: Req;
let eva: Browser;
let site: string;

const queue: Queue = { send: async () => "job", work: async () => undefined, ping: async () => undefined, stop: async () => undefined };
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sb-billing-"));
  const db = await createDb("pglite://memory");
  await migrate(db);
  platform = { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() };
  const app = createApp({
    platform,
    config,
    auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false },
    mailer: mail,
    appUrl: "https://postavi.example",
    stripe,
    stripeWebhookSecret: WHSEC,
    billingEnv: { BILLING_ENABLED: "true" },
  });
  req = (p, init) => app.request(p, init);
  await syncStripePrices(stripe, config);
  eva = await ownerSignIn(req, mail.sent, "eva@example.si");
  const account = (await platform.repo.accounts.byKey("eva@example.si"))!;
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  const s = await platform.repo.createSite({ name: "Pekarna", slug: "pekarna-billing", intake: { description: "Pekarna Kvas, Šutna 30, Kamnik.", photoAssetIds: [], scope: "home" }, accountId: account.id });
  await platform.repo.saveSpec(s.id, { ...golden, slug: "pekarna-billing" }, "generate");
  await platform.repo.setStatus(s.id, "ready");
  site = s.id;
});
afterAll(async () => {
  await platform.close();
  await rm(dir, { recursive: true, force: true });
});

const json = (b: Browser, body: unknown) => ({ method: "POST", headers: { cookie: b.cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
const summary = async (b: Browser) => (await (await req("/api/billing", { headers: { cookie: b.cookie } })).json()) as BillingSummary;
const publish = (b: Browser) => req(`/api/sites/${site}/publish`, { method: "POST", headers: { cookie: b.cookie } });

let n = 0;
async function deliver(type: string, object: Record<string, unknown>, opts: { id?: string; created?: Date; secret?: string; t?: number } = {}) {
  const event = { id: opts.id ?? `evt_flow_${++n}`, type, created: sec(opts.created ?? new Date()), data: { object } };
  const payload = JSON.stringify(event);
  const res = await req("/api/billing/stripe", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signStripePayload(payload, opts.secret ?? WHSEC, opts.t ?? sec(new Date())) }, body: payload });
  return { status: res.status, body: (await res.json()) as { result?: string; error?: string }, event };
}

describe("billing flow with a fake Stripe", () => {
  let customer: string;
  let price: StripePrice;
  const periodStart = new Date("2026-10-19T10:00:00Z");
  const periodEnd = new Date("2027-10-19T10:00:00Z");

  it("shows prices and the founding offer, and refuses publishing with a way to checkout", async () => {
    const s = await summary(eva);
    expect(s).toMatchObject({ enabled: true, subscription: null, grantedByAdmin: false, invoices: [] });
    expect(s.prices.standard).toEqual({ name: "Osnovni", monthEur: 19, yearEur: 190 });
    expect(s.founding).toEqual({ left: 100, firstYearEur: 99, renewalEur: 152 });
    const refused = await publish(eva);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "paid_only", checkout: "/api/billing/checkout" });
  });

  it("refuses checkout to anonymous visitors and bad bodies", async () => {
    expect((await req("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await req("/api/billing/checkout", json(eva, { plan: "gold", interval: "year" }))).status).toBe(400);
  });

  it("opens a Stripe Checkout for Osnovni yearly at the founding price, with the setup service", async () => {
    const res = await req("/api/billing/checkout", json(eva, { plan: "standard", interval: "year", setup: true }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    const session = stripe.sessions.at(-1)!;
    customer = session.customer;
    const byId = new Map(stripe.prices.map((p) => [p.id, p]));
    expect(session.lineItems.map((l) => byId.get(l.price)!.lookup_key)).toEqual([lookupKey(config, "standard_year_founding"), lookupKey(config, "setup")]);
    expect(session.couponId).toBe("postavi_founding_first_year_v1");
    expect(session.idempotencyKey).toMatch(/^checkout-.+-standard_year_founding\+setup-\d+$/);
    expect(session).toMatchObject({ successUrl: "https://postavi.example/narocnina?uspeh=1", cancelUrl: "https://postavi.example/narocnina?preklic=1", metadata: { plan: "standard", interval: "year", founding: "true" } });
    price = byId.get(session.lineItems[0]!.price)!;
    // Stripe makes the subscription when the card is paid.
    stripe.subscriptions.set("sub_flow", {
      id: "sub_flow",
      customer,
      status: "active",
      cancel_at_period_end: false,
      metadata: session.metadata,
      items: { data: [{ price, current_period_start: sec(periodStart), current_period_end: sec(periodEnd) }] },
    });
  });

  it("refuses an unsigned or wrongly signed webhook, and an old delivery", async () => {
    const body = JSON.stringify({ id: "evt_x", type: "invoice.paid", created: 1, data: { object: {} } });
    expect((await req("/api/billing/stripe", { method: "POST", body })).status).toBe(400);
    expect((await deliver("customer.created", { id: "c" }, { secret: "whsec_wrong" })).status).toBe(400);
    expect((await deliver("customer.created", { id: "c" }, { t: sec(new Date()) - 600 })).status).toBe(400);
  });

  it("activates the plan on checkout.session.completed, numbers the invoice on invoice.paid, then allows publishing", async () => {
    const done = await deliver("checkout.session.completed", { id: stripe.sessions.at(-1)!.id, customer, subscription: "sub_flow", client_reference_id: (await platform.repo.accounts.byKey("eva@example.si"))!.id });
    expect(done).toMatchObject({ status: 200, body: { result: "handled" } });
    const invoice = {
      id: "in_flow_1",
      customer,
      customer_email: "eva@example.si",
      customer_name: "Eva Novak",
      customer_address: { line1: "Šutna 30", postal_code: "1241", city: "Kamnik", country: "SI" },
      amount_paid: 24800,
      currency: "eur",
      created: sec(periodStart),
      parent: { subscription_details: { subscription: "sub_flow" } },
      status_transitions: { paid_at: sec(periodStart) },
      lines: {
        data: [
          { description: "Osnovni", amount: 15200, quantity: 1, price: { id: price.id }, period: { start: sec(periodStart), end: sec(periodEnd) } },
          { description: "Setup", amount: 14900, quantity: 1, price: { id: stripe.prices.find((p) => p.lookup_key === lookupKey(config, "setup"))!.id }, period: { start: sec(periodStart), end: sec(periodStart) } },
        ],
      },
    };
    const paid = await deliver("invoice.paid", invoice);
    expect(paid).toMatchObject({ status: 200, body: { result: "handled" } });
    // Stripe delivering the same event again changes nothing.
    const again = await req("/api/billing/stripe", { method: "POST", headers: { "stripe-signature": signStripePayload(JSON.stringify(paid.event), WHSEC, sec(new Date())) }, body: JSON.stringify(paid.event) });
    expect(((await again.json()) as { result: string }).result).toBe("duplicate");

    const s = await summary(eva);
    expect(s.subscription).toMatchObject({ plan: "standard", interval: "year", status: "active", founding: true, entitled: true, cancelAtPeriodEnd: false, currentPeriodEnd: periodEnd.toISOString() });
    expect(s.invoices.map((i) => [i.number, i.totalEur])).toEqual([["2026-00001", 248]]);
    // Her place is taken (99 left for others); the offer isn't shown to her again.
    expect(await platform.repo.accounts.foundingTaken()).toBe(1);
    expect(s.founding).toBeNull();
    const plan = await req("/narocnina?uspeh=1", { headers: { cookie: eva.cookie } });
    expect(plan.status).toBe(200);
    expect(await plan.text()).toContain("2026-00001");
    expect((await req("/narocnina", { redirect: "manual" })).status).toBe(302);
    expect((await publish(eva)).status).not.toBe(403);

    // The invoice page: its owner sees it; another owner gets a 404; the PDF waits for the worker.
    const page = await req(s.invoices[0]!.url, { headers: { cookie: eva.cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("2026-00001");
    expect(html).toContain("Popust: ustanovna cena za prvo leto");
    const ana = await ownerSignIn(req, mail.sent, "ana@example.si");
    expect((await req(s.invoices[0]!.url, { headers: { cookie: ana.cookie } })).status).toBe(404);
    expect((await req(`${s.invoices[0]!.url}.pdf`, { headers: { cookie: eva.cookie } })).status).toBe(404);
  });

  it("refuses a second checkout while subscribed, and opens the portal", async () => {
    expect((await req("/api/billing/checkout", json(eva, { plan: "premium", interval: "month" }))).status).toBe(409);
    const portal = await req("/api/billing/portal", { method: "POST", headers: { cookie: eva.cookie } });
    expect(((await portal.json()) as { url: string }).url).toBe(`https://billing.stripe.test/${customer}`);
    expect(stripe.portals.at(-1)!.returnUrl).toBe("https://postavi.example/narocnina");
  });

  it("keeps rights for the grace days after a failed renewal, then points to the portal", async () => {
    stripe.subscriptions.get("sub_flow")!.status = "past_due";
    await deliver("invoice.payment_failed", { id: "in_flow_2", customer, amount_paid: 0, currency: "eur", created: sec(new Date()), parent: { subscription_details: { subscription: "sub_flow" } }, lines: { data: [] } });
    const due = (await summary(eva)).subscription!;
    expect(due).toMatchObject({ status: "past_due", entitled: true });
    expect(Date.parse(due.graceEndsAt!) - Date.now()).toBeGreaterThan(6.9 * 86400_000);
    expect((await publish(eva)).status).not.toBe(403);
    // Eight days later.
    await platform.db.query("update subscriptions set past_due_since = now() - interval '8 days' where id = 'sub_flow'");
    expect((await summary(eva)).subscription).toMatchObject({ status: "past_due", entitled: false });
    const refused = await publish(eva);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "paid_only", portal: "/api/billing/portal" });
  });

  it("takes rights away when the subscription is deleted", async () => {
    stripe.subscriptions.get("sub_flow")!.status = "canceled";
    expect((await deliver("customer.subscription.deleted", { id: "sub_flow", customer })).body.result).toBe("handled");
    expect((await summary(eva)).subscription).toMatchObject({ status: "canceled", entitled: false });
    const refused = await publish(eva);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ checkout: "/api/billing/checkout" });
  });

  it("offers the founding price only once: after a canceled founding plan, checkout has no coupon and the full price", async () => {
    expect((await summary(eva)).founding).toBeNull();
    const res = await req("/api/billing/checkout", json(eva, { plan: "standard", interval: "year" }));
    expect(res.status).toBe(200);
    const session = stripe.sessions.at(-1)!;
    expect(session.couponId).toBeUndefined();
    expect(session.metadata.founding).toBe("false");
    expect(session.lineItems.map((l) => stripe.prices.find((p) => p.id === l.price)!.lookup_key)).toEqual([lookupKey(config, "standard_year")]);
  });
});

describe("a live Stripe key while the seller is a placeholder", () => {
  it("refuses checkout with provider_error (BILLING_ENABLED on, sk_live_ key, [[…]] in billing.company)", async () => {
    const db = await createDb("pglite://memory");
    await migrate(db);
    const live = memoryStripe();
    live.mode = "live";
    await syncStripePrices(live, config);
    const app = createApp({ platform: { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() }, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail, stripe: live, stripeWebhookSecret: WHSEC, billingEnv: { BILLING_ENABLED: "true" } });
    const r: Req = (p, init) => app.request(p, init);
    const b = await ownerSignIn(r, mail.sent, "live@example.si");
    const res = await r("/api/billing/checkout", json(b, { plan: "standard", interval: "month" }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("provider_error");
    expect(live.sessions).toHaveLength(0);
    await db.close();
  });
});

describe("billing off", () => {
  it("answers billing_off and keeps the old refusal", async () => {
    const db = await createDb("pglite://memory");
    await migrate(db);
    const off = createApp({ platform: { db, repo: new Repo(db), storage: createFsStorage(dir), queue, close: () => db.close() }, config, auth: { password: PASSWORD, secret: "s".repeat(32), secureCookies: false }, mailer: mail, stripe, stripeWebhookSecret: WHSEC, billingEnv: {} });
    const r: Req = (p, init) => off.request(p, init);
    const b = await ownerSignIn(r, mail.sent, "off@example.si");
    const s = (await (await r("/api/billing", { headers: { cookie: b.cookie } })).json()) as BillingSummary;
    expect(s).toMatchObject({ enabled: false, founding: null });
    expect((await r("/api/billing/checkout", json(b, { plan: "standard", interval: "month" }))).status).toBe(403);
    await db.close();
  });
});
