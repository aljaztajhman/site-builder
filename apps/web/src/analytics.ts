import { createHmac } from "node:crypto";
import type { Context } from "hono";
import type { AppConfig } from "@sb/config";
import { recordEvent, type ProductEvent, type Repo } from "@sb/platform";
import { tierOf, type AppEnv } from "./access.ts";
import { NOT_A_VISITOR } from "./stats.ts";

/**
 * Stranko's own funnel events from the web process (docs/plans/analytics.md Step 1, config `analytics`). Each is
 * written where its step happens, after the step itself, and never stands in its way: with `analytics.events` off
 * nothing is written, and a failed write is logged and ignored. The device is named only by a keyed hash of its
 * cookie; no IP and no email ever go into an event. The admin's own clicks are not the funnel's: skipped.
 */

/** The keyed hash that names a device in product_events (not the cookie's id, which signs the device's forms). */
export const deviceKey = (secret: string, deviceId: string): string => createHmac("sha256", secret).update(`events-device:${deviceId}`).digest("hex").slice(0, 32);

export type Track = (c: Context<AppEnv>, e: ProductEvent, opts?: { onceMinutes?: number; deviceId?: string | null }) => Promise<void>;

export function tracker(deps: { repo: Repo; config: AppConfig; secret: string }): Track {
  const { repo, config, secret } = deps;
  return async (c, e, opts = {}) => {
    if (!config.analytics.events) return;
    const viewer = c.get("viewer");
    if (viewer?.kind === "admin") return;
    const device = opts.deviceId !== undefined ? opts.deviceId : c.get("deviceId");
    await recordEvent(
      repo.events,
      config,
      {
        ...e,
        deviceKey: e.deviceKey ?? (device ? deviceKey(secret, device) : null),
        accountId: e.accountId !== undefined ? e.accountId : viewer?.kind === "account" ? viewer.account.id : null,
        tier: e.tier ?? (viewer ? tierOf(viewer) : null),
        plan: e.plan ?? (viewer?.kind === "account" ? viewer.plan : null),
      },
      opts.onceMinutes ? { onceMinutes: opts.onceMinutes } : {},
    );
  };
}

/**
 * A campaign name from a UTM source (`?utm_source=` on the printed cards, letters and posts; docs/plans/analytics.md
 * Step 2), stored as `source`: lower case, letters, digits, dot, dash and underscore, at most 40 characters; anything
 * else is no source (it is never shown, only counted, but a stray value must not become a new row in every roll-up).
 */
export function campaignSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,39}$/.test(s) ? s : null;
}

/** A real page view of the landing page: not a bot (the list the site statistics use), not a prefetch. */
export function isPageView(c: Context): boolean {
  const ua = c.req.header("user-agent") ?? "";
  if (!ua || NOT_A_VISITOR.test(ua)) return false;
  return !/prefetch|prerender/i.test(`${c.req.header("sec-purpose") ?? ""} ${c.req.header("purpose") ?? ""}`);
}
