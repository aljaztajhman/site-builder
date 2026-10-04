import type { Context } from "hono";
import type { AppConfig, PlanKey } from "@sb/config";
import { allowancePeriod, limitsInfo, picturesInfo, picturesNotice, planOffer, type LimitsInfo, type PicturesInfo } from "@sb/engine";
import { poolOf, type Pool, type Repo, type SiteRow, type Tier, type UsageQueries } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";
import { clientIp, ipKey, signInUrl, tierOf, type AppEnv, type Refusal, type Viewer } from "./access.ts";
import { PREVIEW_BADGE, formatDate } from "./ui/labels.ts";

/**
 * Free generation limits (docs/plans/free-generation-limits.md). The server decides before every
 * model job is queued; the browser decides nothing. All numbers come from config `tiers`.
 * - anonymous: `homepages` per device cookie; anonymous and free generations per keyed IP hash per day.
 * - free account: `homepages` more and `chatEdits` in total; the claimed anonymous preview doesn't count.
 * - paid (allow-listed before billing): a monthly € allowance, a share of the monthly price, plus a
 *   one-off amount in the first month; months run from the day the account got paid rights.
 * - every tier: its own daily € pool under the global cap; admin jobs use the paid pool.
 * A job's estimate is held (ai_jobs) until its calls are logged; the logged € then counts instead.
 */

export interface LimitDeps {
  repo: Repo;
  config: AppConfig;
  /** Key of the IP hashes (the session secret). */
  secret: string;
}

export interface JobAsk {
  /** "alt": photo descriptions for photos the owner added in the editor (the photos themselves are never limited). */
  kind: "generate" | "edit" | "alt";
  scope: "home" | "full";
  siteId?: string | null;
  /** Photos an "alt" job describes. */
  photos?: number;
}

// ---------- Slovene counts ----------

type Forms = { one: string; two: string; few: string; other: string };
const rules = new Intl.PluralRules("sl");
/** "2 brezplačni ustvarjanji": the number and the form Slovene wants for it. */
export const count = (n: number, forms: Forms): string => `${n} ${forms[rules.select(n) as keyof Forms]}`;
const HOMEPAGES: Forms = { one: "brezplačno ustvarjanje domače strani", two: "brezplačni ustvarjanji domače strani", few: "brezplačna ustvarjanja domače strani", other: "brezplačnih ustvarjanj domače strani" };
const EDITS: Forms = { one: "sprememba s pomočnikom", two: "spremembi s pomočnikom", few: "spremembe s pomočnikom", other: "sprememb s pomočnikom" };
/** After "dobite še …" (accusative). */
const MORE_HOMEPAGES: Forms = { one: "domačo stran", two: "domači strani", few: "domače strani", other: "domačih strani" };
/** "2 domači strani" (after "še"). */
export const moreHomepages = (n: number): string => count(n, MORE_HOMEPAGES);
/** "10 sprememb s pomočnikom". */
export const chatEdits = (n: number): string => count(n, EDITS);
/** After "starejša od …" (genitive): "1 dneva", "7 dni". */
const DAYS_AFTER_OD: Forms = { one: "dneva", two: "dni", few: "dni", other: "dni" };
export const daysAfterOd = (n: number): string => count(n, DAYS_AFTER_OD);
const FULL_SITES: Forms ={ one: "ustvarjanje celotne strani", two: "ustvarjanji celotne strani", few: "ustvarjanja celotne strani", other: "ustvarjanj celotne strani" };

// ---------- Paid allowance ----------

/** The allowance month `now` falls in (engine plan-limits.ts: the worker counts generated pictures by it too). */
export { allowancePeriod };

/** € a paid plan may spend on AI this allowance month: its monthly allowance, plus the first month's extra (sb-tiers). */
export function monthlyAllowance(config: AppConfig, plan: PlanKey, since: Date, now: Date): { eur: number; start: Date; end: Date } {
  const p = allowancePeriod(since, now);
  const ai = config.plans[plan].ai;
  return { eur: ai.allowanceEurPerMonth + (p.first ? ai.firstMonthExtraEur : 0), start: p.start, end: p.end };
}

/** After a free limit: what the first paid plan adds. */
const freeUpsell = (config: AppConfig): string => `Z naročnino ${planOffer(config, "standard")} dobite celotno stran, objavo na svoji domeni in pomočnika vsak mesec.`;
/** After a paid allowance: Plus for Osnovni, nothing more to sell for Plus. */
const allowanceUpsell = (config: AppConfig, plan: PlanKey): string =>
  plan === "standard" ? ` Paket ${planOffer(config, "premium")} vključuje več pomoči vsak mesec.` : "";

// ---------- Refusals (Slovene) ----------

const msg = (status: Refusal["status"], code: string, message: string, signIn?: string): Refusal => ({ status, code, message, ...(signIn ? { signIn } : {}) });

function poolRefusal(pool: Pool, signIn: string | undefined): Refusal {
  if (pool === "anonymous") return msg(429, "pool_empty", "Današnji brezplačni predogledi brez prijave so porabljeni. Prijavite se z e-pošto in nadaljujte ali poskusite jutri.", signIn);
  if (pool === "free") return msg(429, "pool_empty", "Današnja brezplačna ustvarjanja so porabljena. Poskusite jutri; stran lahko medtem urejate neposredno.");
  return msg(429, "pool_empty", "Današnja omejitev porabe pomočnika je dosežena. Jutri spet deluje; stran lahko medtem urejate neposredno.");
}

/** The estimated € a job may cost (config). */
export const estimateOf = (config: AppConfig, ask: Pick<JobAsk, "kind" | "scope" | "photos">): number =>
  ask.kind === "alt"
    ? config.tiers.estimatesEur.altTextPerPhoto * Math.max(1, ask.photos ?? 1)
    : ask.kind === "edit"
      ? config.tiers.estimatesEur.chatEdit
      : ask.scope === "full"
        ? config.tiers.estimatesEur.fullSite
        : config.tiers.estimatesEur.homepage;

/** Photo descriptions refused: the photo stays (adding photos is direct editing); the owner writes the description. */
const altRefusal = (code: string, reason: string): Refusal =>
  msg(429, code, `Fotografija je dodana, opisa pa ne napišemo samodejno: ${reason} Opis napišite sami pri fotografiji; brez njega strani ni mogoče objaviti.`);

/** Why photo descriptions can't be written by the model now, or null. Reads only through `u` (inside the quota lock). */
async function altRefusalFor(u: UsageQueries, config: AppConfig, who: Who, ask: JobAsk): Promise<Refusal | null> {
  const t = config.tiers;
  const cap = config.limits.dailyModelSpendCapEur;
  const estimate = estimateOf(config, ask);
  const photos = Math.max(1, ask.photos ?? 1);
  const v = who.viewer;
  if ((await u.spentToday()) >= cap) return altRefusal("spend_cap", "današnja omejitev porabe pomočnika je dosežena.");
  if (who.tier === "anonymous") return msg(401, "sign_in_required", "Za fotografije se prijavite z e-pošto. Predogled ostane vaš.", who.signIn);
  if (v.kind === "account" && (who.tier === "free" || who.tier === "paid")) {
    // Per account, whatever its tier was when the photos were described.
    const used = await u.countJobs({ kind: "alt", tiers: ["free", "paid"], accountId: v.account.id, sinceHours: 24, units: true });
    if (used + photos > t.altText.photosPerDay[who.tier]) return altRefusal("alt_limit", "danes ste porabili vse samodejne opise fotografij.");
  }
  if (who.tier === "paid" && v.kind === "account" && v.paidSince) {
    const a = monthlyAllowance(config, v.plan ?? "standard", new Date(v.paidSince), who.now);
    const s = await u.accountSpend(v.account.id, a.start);
    if (s.spent + s.held + estimate > a.eur + 1e-9) return altRefusal("allowance_used", "pomočnik je ta mesec porabil vse, kar vključuje naročnina.");
  }
  if (who.tier === "free" && v.kind === "account") {
    const s = await u.freeLifetimeSpend(v.account.id);
    if (s.spent + s.held + estimate > t.free.lifetimeEur + 1e-9) return altRefusal("free_budget_used", "brezplačni del pomočnika je porabljen.");
  }
  const pool = poolOf(who.tier);
  const p = await u.pool(pool);
  if (p.spent + p.held + estimate > t.pools[pool] * cap + 1e-9) return altRefusal("pool_empty", "današnja omejitev porabe pomočnika je dosežena.");
  return null;
}

interface Who {
  viewer: Viewer;
  tier: Tier;
  deviceId: string;
  ipKey: string;
  signIn: string;
  now: Date;
}

/** Why this job can't start now, or null. Reads only through `u` (inside the quota lock). */
async function refusalFor(u: UsageQueries, config: AppConfig, who: Who, ask: JobAsk): Promise<Refusal | null> {
  if (ask.kind === "alt") return altRefusalFor(u, config, who, ask);
  const t = config.tiers;
  const cap = config.limits.dailyModelSpendCapEur;
  const estimate = estimateOf(config, ask);
  if ((await u.spentToday()) >= cap) return msg(429, "spend_cap", "Današnja omejitev porabe je dosežena. Jutri spet deluje; do takrat stran urejate neposredno.");
  const ipLimit = async (tiers: Tier[]) => (await u.countJobs({ kind: "generate", tiers, ipKey: who.ipKey, sinceHours: 24, allStatuses: true })) >= t.perIpGenerationsPerDay;
  const v = who.viewer;
  if (who.tier === "anonymous") {
    if (ask.kind === "edit") return msg(401, "sign_in_required", "Za spremembe s pomočnikom se prijavite z e-pošto. Predogled ostane vaš.", who.signIn);
    if ((await u.countJobs({ kind: "generate", tiers: ["anonymous"], deviceId: who.deviceId })) >= t.anonymous.homepages) {
      return msg(429, "anonymous_used", `Brezplačni predogled brez prijave ste že naredili. Prijavite se z e-pošto: predogled ostane vaš in dobite še ${count(t.free.homepages, MORE_HOMEPAGES)}.`, who.signIn);
    }
    if (await ipLimit(["anonymous", "free"])) return msg(429, "ip_limit", "Iz tega omrežja je bilo danes narejenih že veliko predogledov. Prijavite se z e-pošto ali poskusite jutri.", who.signIn);
  } else if (who.tier === "free" && v.kind === "account") {
    if (ask.kind === "generate") {
      if ((await u.countJobs({ kind: "generate", tiers: ["free"], accountId: v.account.id })) >= t.free.homepages) {
        return msg(429, "free_homepages_used", `Porabili ste ${count(t.free.homepages, HOMEPAGES)}. Stran lahko še naprej urejate neposredno. ${freeUpsell(config)}`);
      }
      if (await ipLimit(["anonymous", "free"])) return msg(429, "ip_limit", "Iz tega omrežja je bilo danes narejenih že veliko predogledov. Poskusite jutri; stran lahko medtem urejate neposredno.");
    } else if ((await u.countJobs({ kind: "edit", tiers: ["free"], accountId: v.account.id })) >= t.free.chatEdits) {
      return msg(429, "free_edits_used", `Porabili ste vseh ${count(t.free.chatEdits, EDITS)}. Stran lahko še naprej urejate neposredno. ${freeUpsell(config)}`);
    }
    // Whatever the counts say, a free account never costs more than its lifetime € (sb-tiers: micro losses only).
    const s = await u.freeLifetimeSpend(v.account.id);
    if (s.spent + s.held + estimate > t.free.lifetimeEur + 1e-9) {
      return msg(429, "free_budget_used", `Brezplačni del pomočnika je porabljen. Stran lahko še naprej urejate neposredno. ${freeUpsell(config)}`);
    }
  } else if (who.tier === "paid" && v.kind === "account" && v.paidSince) {
    const plan = v.plan ?? "standard";
    const a = monthlyAllowance(config, plan, new Date(v.paidSince), who.now);
    const s = await u.accountSpend(v.account.id, a.start);
    if (s.spent + s.held + estimate > a.eur + 1e-9) {
      return msg(
        429,
        "allowance_used",
        `Pomočnik je ta mesec porabil vse, kar vključuje naročnina. Stran lahko še naprej urejate neposredno; pomočnik spet deluje ${formatDate(a.end.toISOString())}.${allowanceUpsell(config, plan)}`,
      );
    }
  }
  const pool = poolOf(who.tier);
  const p = await u.pool(pool);
  if (p.spent + p.held + estimate > t.pools[pool] * cap + 1e-9) return poolRefusal(pool, who.tier === "anonymous" ? who.signIn : undefined);
  return null;
}

/**
 * Checks the viewer's limits and, when the job may start, writes its ai_jobs row (holding its estimate)
 * in the same locked transaction, so concurrent requests can't both take the last free slot.
 */
export async function reserveJob(deps: LimitDeps, c: Context<AppEnv>, ask: JobAsk, now = new Date()): Promise<{ ok: true; aiJobId: string; tier: Tier } | { ok: false; refusal: Refusal }> {
  const viewer = c.get("viewer");
  const tier = tierOf(viewer);
  const who: Who = {
    viewer,
    tier,
    deviceId: c.get("deviceId"),
    ipKey: ipKey(deps.secret, clientIp(c)),
    signIn: signInUrl(ask.siteId ? `/sites/${ask.siteId}` : "/#zacni"),
    now,
  };
  return deps.repo.usage.withQuotaLock(async (u) => {
    const refusal = await refusalFor(u, deps.config, who, ask);
    if (refusal) return { ok: false as const, refusal };
    const aiJobId = await u.insertJob({
      kind: ask.kind,
      scope: ask.kind === "generate" ? ask.scope : null,
      tier,
      accountId: viewer.kind === "account" ? viewer.account.id : null,
      // Kept only where a limit needs it: the device for anonymous previews, the IP hash for free generations.
      deviceId: tier === "anonymous" ? who.deviceId : null,
      ipKey: (tier === "anonymous" || tier === "free") && ask.kind === "generate" ? who.ipKey : "",
      siteId: ask.siteId ?? null,
      estimateEur: estimateOf(deps.config, ask),
      units: ask.kind === "alt" ? Math.max(1, ask.photos ?? 1) : 1,
    });
    return { ok: true as const, aiJobId, tier };
  });
}

// ---------- What the viewer has left (GET /api/sites/:id → access, the landing page) ----------

export interface Allowance {
  /** Homepage generations left and in total (anonymous, free); null where € count instead. */
  homepagesLeft: number | null;
  homepagesTotal: number | null;
  /** Chat edits left and in total (free); null otherwise. */
  chatEditsLeft: number | null;
  chatEditsTotal: number | null;
  /** € of this month's AI allowance left and in total (paid); null otherwise. */
  eurLeft: number | null;
  eurTotal: number | null;
  /** When the paid allowance renews (ISO). */
  renewsAt: string | null;
  /** One Slovene sentence for the owner, e.g. "Še 1 brezplačno ustvarjanje domače strani in 5 sprememb s pomočnikom." */
  text: string;
}

export interface AccessInfo {
  viewer: Tier;
  can: { edit: boolean; chat: boolean; regenerate: boolean; publish: boolean; export: boolean; fullSite: boolean };
  allowance: Allowance;
  /** An unclaimed anonymous preview is deleted then (ISO); null otherwise. */
  expiresAt: string | null;
  /** Anonymous: the sign-in page that comes back to this site. */
  signIn: string | null;
  /** The free-preview badge the editor shows beside the preview frame (never inside it); null for none. */
  badge: string | null;
  /** What a site may have on the viewer's plan, and the note each button reads at its limit (null: the admin). */
  limits: LimitsInfo | null;
  /**
   * Free previews (it-upsells): the pages the brief planned beyond the homepage, by their menu names, shown
   * locked with the first paid plan's price (no model call: the brief already names them).
   */
  lockedPages: string[];
  /** Free previews: the first paid plan, its prices in one Slovene line. Null for paid viewers and the admin. */
  offer: { plan: PlanKey; name: string; monthlyEur: number; text: string } | null;
  /** A paid plan's generated pictures this allowance month (null otherwise); `short`: regenerating this site would get fewer than it would without the limit. */
  pictures: (PicturesInfo & { short: boolean }) | null;
  /** An unclaimed anonymous preview: the address its one reminder goes to before it is deleted, if the visitor left one. */
  reminder: { email: string | null; status: "none" | "pending" | "sent" | "failed"; sendsAt: string } | null;
}

/** "Osnovni: 15 € na mesec ali 150 € na leto, domena je vključena v letno ceno." */
export function offerText(config: AppConfig, plan: PlanKey = "standard"): string {
  const p = config.plans[plan];
  return `${p.name}: ${p.monthlyEur} € na mesec ali ${p.yearlyEur} € na leto${p.yearlyIncludesDomain ? ", domena je vključena v letno ceno" : ""}.`;
}

/** The brief's planned pages that the site doesn't have yet, by menu name (at most what the first paid plan allows). */
export function lockedPagesOf(config: AppConfig, site: Pick<SiteRow, "brief">, spec: Pick<SiteSpec, "pages"> | null): string[] {
  const planned = (site.brief as { pages?: { kind?: string; slug?: string; navLabel?: string }[] } | null)?.pages;
  if (!Array.isArray(planned)) return [];
  const have = new Set((spec?.pages ?? []).map((p) => p.slug));
  return planned
    .filter((p) => p.kind === "standard" && typeof p.navLabel === "string" && p.navLabel.trim() && !have.has(p.slug ?? ""))
    .map((p) => p.navLabel!.trim())
    .slice(0, config.plans.standard.site.maxPages - 1);
}

/**
 * `sb-preview-watermark` = small badge: a free preview (no account or a free account) of a site that isn't
 * published gets PREVIEW_BADGE in the app chrome around the preview; config `plans.freePreview.watermark` switches it.
 */
export function previewBadge(config: AppConfig, tier: Tier, site: Pick<SiteRow, "published_version">): string | null {
  if (config.plans.freePreview.watermark !== "app-badge") return null;
  if (tier !== "anonymous" && tier !== "free") return null;
  return site.published_version ? null : PREVIEW_BADGE;
}

const none = { homepagesLeft: null, homepagesTotal: null, chatEditsLeft: null, chatEditsTotal: null, eurLeft: null, eurTotal: null, renewsAt: null };

/** What the viewer has left right now (no lock: for display; the job start checks again). */
export async function allowanceFor(deps: Pick<LimitDeps, "repo" | "config">, viewer: Viewer, deviceId: string, now = new Date()): Promise<Allowance> {
  const t = deps.config.tiers;
  const u = deps.repo.usage;
  const tier = tierOf(viewer);
  if (tier === "anonymous") {
    const left = Math.max(0, t.anonymous.homepages - (await u.countJobs({ kind: "generate", tiers: ["anonymous"], deviceId })));
    // The landing page shows a shorter line while the free homepage is left (app.ts landingAllowance).
    const more = `Z brezplačno prijavo dobite še ${count(t.free.homepages, MORE_HOMEPAGES)} in ${count(t.free.chatEdits, EDITS)}.`;
    return {
      ...none,
      homepagesLeft: left,
      homepagesTotal: t.anonymous.homepages,
      text: left > 0 ? `Prva domača stran je brezplačna, brez prijave. ${more}` : `Brezplačni predogled brez prijave ste že naredili. ${more}`,
    };
  }
  if (viewer.kind === "account" && tier === "free") {
    const homepagesLeft = Math.max(0, t.free.homepages - (await u.countJobs({ kind: "generate", tiers: ["free"], accountId: viewer.account.id })));
    const chatEditsLeft = Math.max(0, t.free.chatEdits - (await u.countJobs({ kind: "edit", tiers: ["free"], accountId: viewer.account.id })));
    const parts = [homepagesLeft ? count(homepagesLeft, HOMEPAGES) : null, chatEditsLeft ? count(chatEditsLeft, EDITS) : null].filter(Boolean);
    const text = parts.length
      ? `Še ${parts.join(" in ")}. Neposredno urejanje je vedno brezplačno.`
      : "Brezplačna ustvarjanja in spremembe s pomočnikom ste porabili. Stran lahko še naprej urejate neposredno.";
    return { ...none, homepagesLeft, homepagesTotal: t.free.homepages, chatEditsLeft, chatEditsTotal: t.free.chatEdits, text };
  }
  if (viewer.kind === "account" && viewer.paidSince) {
    const a = monthlyAllowance(deps.config, viewer.plan ?? "standard", new Date(viewer.paidSince), now);
    const s = await u.accountSpend(viewer.account.id, a.start);
    const left = Math.max(0, a.eur - s.spent - s.held);
    const sites = Math.floor(left / t.estimatesEur.fullSite + 1e-9);
    const edits = Math.floor(left / t.estimatesEur.chatEdit + 1e-9);
    const renews = formatDate(a.end.toISOString());
    const text =
      edits > 0
        ? `Pomočnik ta mesec še za približno ${sites ? `${count(sites, FULL_SITES)} ali ` : ""}${count(edits, EDITS)} (obnovi se ${renews}). Neposredno urejanje je vedno brezplačno.`
        : `Pomočnik je ta mesec porabil vse, kar vključuje naročnina; spet deluje ${renews}. Neposredno urejanje je vedno brezplačno.`;
    return { ...none, eurLeft: Math.round(left * 100) / 100, eurTotal: a.eur, renewsAt: a.end.toISOString(), text };
  }
  return { ...none, text: "Skrbnik: brez omejitev, velja dnevna omejitev porabe." };
}

/** A generation of this site in `scope` would want more generated pictures than the plan has left this month. */
export function picturesShort(config: AppConfig, site: Pick<SiteRow, "intake">, scope: "home" | "full", left: number): boolean {
  const wanted = config.imageGen.pipeline.enabled ? Math.max(0, config.imageGen.pipeline.fillUpTo[scope] - (site.intake?.photoAssetIds?.length ?? 0)) : 0;
  return wanted > left;
}

/** A paid viewer's generated pictures this allowance month (it-plan-limits), or null. */
export async function picturesFor(deps: Pick<LimitDeps, "repo" | "config">, viewer: Viewer, now = new Date()): Promise<PicturesInfo | null> {
  if (viewer.kind !== "account" || !viewer.paidSince) return null;
  const plan = viewer.plan ?? "standard";
  const period = allowancePeriod(new Date(viewer.paidSince), now);
  const used = await deps.repo.usage.generatedPictures(viewer.account.id, period.start);
  return picturesInfo(deps.config, plan, used, period.end, formatDate(period.end.toISOString()));
}

/** GET /api/sites/:id → `access`. */
export async function accessInfo(deps: Pick<LimitDeps, "repo" | "config">, viewer: Viewer, deviceId: string, site: SiteRow, now = new Date(), spec: Pick<SiteSpec, "pages"> | null = null): Promise<AccessInfo> {
  const t = deps.config.tiers;
  const tier = tierOf(viewer);
  const free = tier === "anonymous" || tier === "free";
  const plan = viewer.kind === "account" ? viewer.plan : null;
  const allowance = await allowanceFor(deps, viewer, deviceId, now);
  const paidish = tier === "paid" || tier === "admin";
  const regenerateCost = site.intake?.scope === "full" ? t.estimatesEur.fullSite : t.estimatesEur.homepage;
  const chat = tier === "admin" || (tier === "free" && (allowance.chatEditsLeft ?? 0) > 0) || (tier === "paid" && (allowance.eurLeft ?? 0) >= t.estimatesEur.chatEdit);
  const regenerate =
    tier === "admin" || ((tier === "anonymous" || tier === "free") && (allowance.homepagesLeft ?? 0) > 0) || (tier === "paid" && (allowance.eurLeft ?? 0) >= regenerateCost);
  const unclaimed = site.account_id === null && !!site.device_id;
  const created = Date.parse(site.created_at);
  return {
    viewer: tier,
    can: { edit: tier !== "anonymous", chat, regenerate, publish: paidish, export: paidish, fullSite: paidish },
    allowance,
    expiresAt: unclaimed ? new Date(created + t.anonymous.keepDays * 86400_000).toISOString() : null,
    signIn: tier === "anonymous" ? signInUrl(`/sites/${site.id}`) : null,
    badge: previewBadge(deps.config, tier, site),
    limits: limitsInfo(deps.config, tier, tier === "paid" ? (plan ?? "standard") : null),
    lockedPages: free ? lockedPagesOf(deps.config, site, spec) : [],
    offer: free ? { plan: "standard", name: deps.config.plans.standard.name, monthlyEur: deps.config.plans.standard.monthlyEur, text: offerText(deps.config) } : null,
    // For this site: a full regeneration would get fewer generated pictures than it wants; the note says so, naming Plus.
    pictures: await picturesFor(deps, viewer, now).then((p) => {
      if (!p) return null;
      const short = picturesShort(deps.config, site, "full", p.left);
      return { ...p, short, notice: short ? picturesNotice(deps.config, plan ?? "standard", p.left, formatDate(p.renewsAt)) : null };
    }),
    reminder:
      unclaimed && tier === "anonymous"
        ? { email: site.reminder_email ?? null, status: site.reminder ?? "none", sendsAt: new Date(created + (t.anonymous.keepDays - t.anonymous.reminder.daysBefore) * 86400_000).toISOString() }
        : null,
  };
}
