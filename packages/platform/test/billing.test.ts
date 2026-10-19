import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig, type AppConfig } from "@sb/config";
import {
  BillingStore,
  Repo,
  buildInvoiceView,
  createDb,
  desiredPrices,
  formEncode,
  foundingCoupon,
  handleStripeEvent,
  invoiceNumber,
  invoiceYear,
  isEntitled,
  lookupKey,
  mapStatus,
  memoryStripe,
  migrate,
  signStripePayload,
  slotOfLookupKey,
  syncStripePrices,
  verifyStripeSignature,
  VAT_EXEMPT_NOTE,
  type Db,
  type StripeEvent,
  type StripeInvoice,
  type StripeSubscription,
} from "../src/index.ts";

/** Billing (platform/src/billing*.ts): prices from config, webhook signatures, rights, invoices numbered without gaps. */
const config = loadConfig();
const SECRET = "whsec_test_secret_for_unit_tests";
const sec = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

describe("prices from config", () => {
  it("names every price by lookup key and makes the founding first year cost firstYearEur", () => {
    const want = desiredPrices(config);
    const by = new Map(want.map((w) => [w.slot, w]));
    expect(by.get("standard_month")).toMatchObject({ lookupKey: "postavi_standard_month_v1", unitAmountCents: config.plans.standard.monthlyEur * 100, interval: "month" });
    expect(by.get("premium_year")).toMatchObject({ lookupKey: "postavi_premium_year_v1", unitAmountCents: config.plans.premium.yearlyEur * 100, interval: "year" });
    expect(by.get("setup")).toMatchObject({ interval: null, unitAmountCents: config.plans.standard.setupService.eur * 100 });
    const f = config.plans.standard.foundingOffer!;
    const renewal = by.get("standard_year_founding")!.unitAmountCents;
    expect(renewal).toBe(Math.round(config.plans.standard.yearlyEur * (100 - f.renewalDiscountPercent!)));
    // Year one: the renewal price less the one-time coupon.
    expect(renewal - foundingCoupon(config)!.amountOffCents).toBe(f.firstYearEur * 100);
  });

  it("maps a lookup key back to what it sells", () => {
    expect(slotOfLookupKey(config, lookupKey(config, "premium_month"))).toEqual({ plan: "premium", interval: "month", founding: false });
    expect(slotOfLookupKey(config, lookupKey(config, "standard_year_founding"))).toEqual({ plan: "standard", interval: "year", founding: true });
    expect(slotOfLookupKey(config, lookupKey(config, "setup"))).toBe("setup");
    expect(slotOfLookupKey(config, "someone_elses_price")).toBeNull();
  });

  it("encodes Stripe's nested form parameters", () => {
    expect(decodeURIComponent(formEncode({ line_items: [{ price: "p1", quantity: 1 }], metadata: { a: "b" }, skip: undefined }))).toBe("line_items[0][price]=p1&line_items[0][quantity]=1&metadata[a]=b");
  });

  it("syncs prices idempotently: a second run keeps everything; a changed price replaces its key", async () => {
    const stripe = memoryStripe();
    const first = await syncStripePrices(stripe, config);
    expect(first.filter((l) => l.action === "created").length).toBe(first.length);
    const second = await syncStripePrices(stripe, config);
    expect(second.every((l) => l.action === "kept")).toBe(true);
    const dearer: AppConfig = { ...config, plans: { ...config.plans, premium: { ...config.plans.premium, monthlyEur: config.plans.premium.monthlyEur + 1 } } };
    const third = await syncStripePrices(stripe, dearer);
    expect(third.find((l) => l.what === "postavi_premium_month_v1")!.action).toBe("replaced");
    const now = await stripe.pricesByLookupKeys(["postavi_premium_month_v1"]);
    expect(now.map((p) => p.unit_amount)).toEqual([(config.plans.premium.monthlyEur + 1) * 100]);
  });
});

describe("Stripe-Signature", () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const now = Date.UTC(2026, 9, 19, 12);
  const t = Math.floor(now / 1000);

  it("accepts Stripe's HMAC-SHA256 of `<t>.<body>` with the signing secret", () => {
    const v1 = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
    expect(signStripePayload(body, SECRET, t)).toBe(`t=${t},v1=${v1}`);
    expect(verifyStripeSignature(body, `t=${t},v1=${v1}`, SECRET, 300, now)).toBe(true);
    // Several v1 entries (a secret being rolled) and a v0: one match is enough.
    expect(verifyStripeSignature(body, `t=${t},v1=${"0".repeat(64)},v1=${v1},v0=abc`, SECRET, 300, now)).toBe(true);
  });

  it("refuses a changed body, another secret, an old timestamp and a missing header", () => {
    const h = signStripePayload(body, SECRET, t);
    expect(verifyStripeSignature(body.replace("evt_1", "evt_2"), h, SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, h, "whsec_other", 300, now)).toBe(false);
    expect(verifyStripeSignature(body, h, SECRET, 300, now + 301_000)).toBe(false);
    expect(verifyStripeSignature(body, undefined, SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t}`, SECRET, 300, now)).toBe(false);
  });
});

describe("rights and numbers", () => {
  it("keeps paid rights while active, and past_due only within the grace days", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(isEntitled({ status: "active", past_due_since: null }, now, 7)).toBe(true);
    expect(isEntitled({ status: "past_due", past_due_since: "2026-10-13T12:00:00Z" }, now, 7)).toBe(true);
    expect(isEntitled({ status: "past_due", past_due_since: "2026-10-11T12:00:00Z" }, now, 7)).toBe(false);
    expect(isEntitled({ status: "canceled", past_due_since: null }, now, 7)).toBe(false);
    expect(isEntitled({ status: "incomplete", past_due_since: null }, now, 7)).toBe(false);
    expect(mapStatus("unpaid")).toBe("canceled");
    expect(mapStatus("paused")).toBe("incomplete");
  });

  it("numbers invoices <year>-<5 digits> in Slovenia's year", () => {
    expect(invoiceNumber(2026, 1)).toBe("2026-00001");
    // 23:30 UTC on 31 December is already the new year in Ljubljana.
    expect(invoiceYear(new Date("2026-12-31T23:30:00Z"))).toBe(2027);
  });
});

const invoiceFor = (customer: string, sub: string, over: Partial<StripeInvoice> = {}): StripeInvoice => ({
  id: `in_${Math.random().toString(16).slice(2, 10)}`,
  customer,
  customer_email: "eva@example.si",
  customer_name: "Pekarna Kvas d.o.o.",
  customer_address: { line1: "Šutna 30", postal_code: "1241", city: "Kamnik", country: "SI" },
  customer_tax_ids: [{ type: "eu_vat", value: "SI12345678" }],
  amount_paid: 9900,
  currency: "eur",
  created: sec("2026-10-19T10:00:00Z"),
  parent: { subscription_details: { subscription: sub } },
  status_transitions: { paid_at: sec("2026-10-19T10:00:05Z") },
  lines: { data: [{ description: "1 × Osnovni (at €152.00 / year)", amount: 15200, quantity: 1, period: { start: sec("2026-10-19T10:00:00Z"), end: sec("2027-10-19T10:00:00Z") } }] },
  ...over,
});

describe("invoice view", () => {
  it("splits VAT out of the gross total and adds the founding discount as a line", () => {
    const v = buildInvoiceView({ id: "inv_0", number: "2026-00001", issuedAt: new Date("2026-10-19T10:00:05Z"), invoice: invoiceFor("cus_1", "sub_1"), config, priceKeys: new Map(), founding: true });
    expect(v.totalEur).toBe(99);
    expect(v.lines.map((l) => [l.qty, l.unitGrossEur])).toEqual([
      [1, 152],
      [1, -53],
    ]);
    expect(v.lines[1]!.text).toMatch(/ustanovna/);
    expect(v.vat).toEqual({ mode: "included", rate: 0.22, netEur: 81.15, vatEur: 17.85 });
    expect(v.buyer).toEqual({ name: "Pekarna Kvas d.o.o.", email: "eva@example.si", address: "Šutna 30, 1241 Kamnik", taxId: "SI12345678" });
    expect(v.seller.name).toBe(config.billing.company.name);
    expect(v.fiscal).toBeNull();
  });

  it("prints no VAT and the ZDDV-1 sentence when not a VAT payer", () => {
    const exempt: AppConfig = { ...config, billing: { ...config.billing, vat: { mode: "exempt", rate: 0.22 } } };
    const v = buildInvoiceView({ id: "inv_0", number: "2026-00001", issuedAt: new Date(), invoice: invoiceFor("cus_1", "sub_1", { amount_paid: 15200 }), config: exempt, priceKeys: new Map(), founding: false });
    expect(v.vat).toEqual({ mode: "exempt", rate: 0, netEur: 152, vatEur: 0 });
    expect(v.notes).toContain(VAT_EXEMPT_NOTE);
  });
});

describe("webhook events in the database", () => {
  let db: Db;
  let repo: Repo;
  const stripe = memoryStripe();
  const deps = () => ({ db, config, stripe });
  let accountId: string;
  let foundingPrice: StripeSubscription["items"]["data"][number]["price"];
  const event = (id: string, type: string, object: Record<string, unknown>, created = sec("2026-10-19T10:00:06Z")): StripeEvent => ({ id, type, created, data: { object } });

  beforeAll(async () => {
    db = await createDb("pglite://memory");
    await migrate(db);
    repo = new Repo(db);
    await syncStripePrices(stripe, config);
    foundingPrice = (await stripe.pricesByLookupKeys([lookupKey(config, "standard_year_founding")]))[0]!;
    accountId = (await repo.accounts.signIn("eva@example.si", "eva@example.si")).id;
    await new BillingStore(db).saveCustomer(accountId, "cus_eva");
    stripe.subscriptions.set("sub_eva", {
      id: "sub_eva",
      customer: "cus_eva",
      status: "active",
      cancel_at_period_end: false,
      metadata: { account_id: accountId, plan: "standard", interval: "year", founding: "true" },
      items: { data: [{ price: foundingPrice, current_period_start: sec("2026-10-19T10:00:00Z"), current_period_end: sec("2027-10-19T10:00:00Z") }] },
    });
  });
  afterAll(async () => {
    await db.close();
  });

  it("creates the billing tables (migration 25)", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_name in ('billing_customers', 'subscriptions', 'invoices', 'invoice_counters', 'stripe_events') order by table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(["billing_customers", "invoice_counters", "invoices", "stripe_events", "subscriptions"]);
    const { rows: m } = await db.query<{ id: number }>("select id from schema_migrations where name = 'billing'");
    expect(m[0]?.id).toBe(25);
  });

  it("records the subscription, numbers the invoice once and ignores a replay", async () => {
    expect(await handleStripeEvent(deps(), event("evt_1", "checkout.session.completed", { id: "cs_1", customer: "cus_eva", subscription: "sub_eva", client_reference_id: accountId }))).toBe("handled");
    const store = new BillingStore(db);
    const sub = (await store.subscriptionOf(accountId))!;
    expect(sub).toMatchObject({ plan: "standard", billing_interval: "year", status: "active", founding: true });
    expect(await repo.accounts.planOf(accountId)).toMatchObject({ plan: "standard" });
    expect(await repo.accounts.foundingTaken()).toBe(1);

    const paid = event("evt_2", "invoice.paid", invoiceFor("cus_eva", "sub_eva", { lines: { data: [{ description: "x", amount: 15200, quantity: 1, price: { id: foundingPrice.id }, period: { start: sec("2026-10-19T10:00:00Z"), end: sec("2027-10-19T10:00:00Z") } }] } }) as unknown as Record<string, unknown>);
    expect(await handleStripeEvent(deps(), paid)).toBe("handled");
    expect(await handleStripeEvent(deps(), paid)).toBe("duplicate");
    const list = await store.invoicesOf(accountId);
    expect(list.map((i) => [i.number, i.totalEur])).toEqual([["2026-00001", 99]]);
    const inv = (await store.invoice(list[0]!.id))!;
    expect(inv.view.lines[0]!.text).toMatch(/^Naročnina Osnovni, letna/);
    // The same Stripe invoice under another event id (Stripe retried with a new event) still gives one invoice.
    expect(await handleStripeEvent(deps(), { ...paid, id: "evt_3" })).toBe("handled");
    expect((await store.invoicesOf(accountId)).length).toBe(1);
  });

  it("gives every invoice of a year the next number, without gaps, even when one fails and rolls back", async () => {
    const store = new BillingStore(db);
    const inv = (n: number) => event(`evt_par_${n}`, "invoice.paid", invoiceFor("cus_eva", "sub_eva", { id: `in_par_${n}` }) as unknown as Record<string, unknown>);
    await Promise.all([1, 2, 3, 4].map((n) => handleStripeEvent(deps(), inv(n))));
    // A failure after the number was taken (here: the fiscal step) gives the number back.
    const failing = { ...deps(), fiscal: { mode: "none" as const, verify: async () => Promise.reject(new Error("down")) } };
    await expect(handleStripeEvent(failing, inv(5))).rejects.toThrow("down");
    expect(await handleStripeEvent(deps(), inv(5))).toBe("handled");
    const numbers = (await store.invoicesOf(accountId)).map((i) => i.number).sort();
    expect(numbers).toEqual(["2026-00001", "2026-00002", "2026-00003", "2026-00004", "2026-00005", "2026-00006"]);
  });

  it("marks a failed renewal past_due from Stripe's state, and a deletion canceled", async () => {
    const store = new BillingStore(db);
    stripe.subscriptions.get("sub_eva")!.status = "past_due";
    await handleStripeEvent(deps(), event("evt_f", "invoice.payment_failed", invoiceFor("cus_eva", "sub_eva", { id: "in_failed", amount_paid: 0 }) as unknown as Record<string, unknown>, sec("2026-10-20T10:00:00Z")));
    const s = (await store.subscriptionOf(accountId))!;
    expect(s.status).toBe("past_due");
    expect(new Date(s.past_due_since!).toISOString()).toBe("2026-10-20T10:00:00.000Z");
    expect(await store.entitlement(accountId, new Date("2026-10-26T10:00:00Z"), 7)).not.toBeNull();
    expect(await store.entitlement(accountId, new Date("2026-10-28T10:00:00Z"), 7)).toBeNull();
    stripe.subscriptions.get("sub_eva")!.status = "canceled";
    await handleStripeEvent(deps(), event("evt_d", "customer.subscription.deleted", { id: "sub_eva", customer: "cus_eva" }));
    expect((await store.subscriptionOf(accountId))!.status).toBe("canceled");
    expect(await repo.accounts.planOf(accountId)).toBeNull();
    expect(await repo.accounts.foundingTaken()).toBe(0);
  });

  it("records events it doesn't act on, once", async () => {
    expect(await handleStripeEvent(deps(), event("evt_other", "customer.created", { id: "cus_x" }))).toBe("ignored");
    expect(await handleStripeEvent(deps(), event("evt_other", "customer.created", { id: "cus_x" }))).toBe("duplicate");
  });
});
