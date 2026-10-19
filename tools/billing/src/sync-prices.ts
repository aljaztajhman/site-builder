/**
 * pnpm billing:sync-prices — creates (or keeps) the Stripe products, prices and founding coupon config names, by
 * lookup key (packages/platform/src/billing-sync.ts). Needs STRIPE_SECRET_KEY (sk_test_… on staging, sk_live_… once
 * the company exists). Safe to run again: what already matches is kept. Prints one line per object, never the key.
 */
import { loadConfig } from "../../../packages/config/src/index.ts";
import { stripeRest } from "../../../packages/platform/src/billing-stripe.ts";
import { syncStripePrices } from "../../../packages/platform/src/billing-sync.ts";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set (see docs/dev/billing.md)");
  process.exit(1);
}
const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
console.log(`[billing] syncing prices with Stripe (${mode} mode)`);
const lines = await syncStripePrices(stripeRest({ secretKey: key }), loadConfig());
for (const l of lines) console.log(`  ${l.action.padEnd(8)} ${l.what}`);
