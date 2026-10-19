import type { AppConfig } from "@sb/config";
import { desiredPrices, foundingCoupon } from "./billing.ts";
import type { StripeApi } from "./billing-stripe.ts";

/**
 * `pnpm billing:sync-prices`: makes Stripe hold exactly the prices config names, found by lookup key. Idempotent: a
 * price whose amount and interval already match is kept; a changed one gets a new Price that takes over the lookup
 * key (Stripe never edits an amount; subscriptions on the old price keep it until they change plan); the products
 * and the founding coupon are created once under our own ids. Nobody types a price id by hand.
 */
export interface SyncLine {
  what: string;
  action: "kept" | "created" | "replaced";
}

export async function syncStripePrices(stripe: StripeApi, config: AppConfig): Promise<SyncLine[]> {
  const out: SyncLine[] = [];
  const want = desiredPrices(config);
  const existing = new Map((await stripe.pricesByLookupKeys(want.map((w) => w.lookupKey))).map((p) => [p.lookup_key, p]));
  const products = new Map<string, string>();
  for (const w of want) if (!products.has(w.product)) products.set(w.product, w.productName);
  for (const [id, name] of products) {
    if (await stripe.getProduct(id)) out.push({ what: `product ${id}`, action: "kept" });
    else {
      await stripe.createProduct({ id, name });
      out.push({ what: `product ${id}`, action: "created" });
    }
  }
  for (const w of want) {
    const p = existing.get(w.lookupKey);
    const same = p && p.unit_amount === w.unitAmountCents && p.currency === config.billing.currency && (p.recurring?.interval ?? null) === w.interval;
    if (same) {
      out.push({ what: w.lookupKey, action: "kept" });
      continue;
    }
    await stripe.createPrice({ product: w.product, lookupKey: w.lookupKey, unitAmountCents: w.unitAmountCents, currency: config.billing.currency, interval: w.interval, nickname: w.nickname });
    out.push({ what: w.lookupKey, action: p ? "replaced" : "created" });
  }
  const coupon = foundingCoupon(config);
  if (coupon) {
    const have = await stripe.getCoupon(coupon.id);
    if (have && have.amount_off !== coupon.amountOffCents) {
      // A coupon's amount can't change: a new founding offer needs a new lookupKeyVersion (and so a new coupon id).
      throw new Error(`coupon ${coupon.id} takes off ${have.amount_off} cents, config wants ${coupon.amountOffCents}: raise billing.lookupKeyVersion`);
    }
    if (have) out.push({ what: `coupon ${coupon.id}`, action: "kept" });
    else {
      await stripe.createCoupon({ id: coupon.id, name: coupon.name, amountOffCents: coupon.amountOffCents, currency: config.billing.currency });
      out.push({ what: `coupon ${coupon.id}`, action: "created" });
    }
  }
  return out;
}
