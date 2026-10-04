import { PLAN_KEYS, type AppConfig, type PlanKey } from "@sb/config";
import type { Tier } from "@sb/platform";
import type { SiteSpec } from "@sb/spec";

/**
 * Per-plan site limits and the upsell that names the next plan (it-plan-limits, it-upsells; docs/plans/pricing-tiers.md).
 * The numbers, names and prices are config (`plans.freePreview`, `plans.standard`, `plans.premium`); this only counts
 * and words them. The web API checks every direct edit with `limitBreach`, the worker every chat edit, so the browser
 * decides nothing. A limit refuses only what grows past it: a site already over (made before the limit, or moved to
 * a smaller plan) can still be edited and trimmed.
 */

export type CollectionKey = AppConfig["plans"]["standard"]["site"]["collections"][number];

export interface SiteLimits {
  /** Home and standard pages; a collection's list page counts. Privacy, accessibility and 404 pages don't. */
  maxPages: number;
  locales: number;
  collections: readonly CollectionKey[];
  /** Generated pictures per allowance month (paid plans); 0 for a free preview, which has a per-generation count instead. */
  pictures: number;
}

/** What a site may have for this viewer: a free preview's (anonymous or free account), a paid plan's, or none (the admin). */
export function siteLimits(config: AppConfig, tier: Tier, plan: PlanKey | null): SiteLimits | null {
  if (tier === "admin") return null;
  if (tier === "paid") {
    const s = config.plans[plan ?? "standard"].site;
    return { maxPages: s.maxPages, locales: s.locales, collections: s.collections, pictures: s.generatedPicturesPerMonth };
  }
  return { maxPages: config.plans.freePreview.pages.length, locales: config.plans.freePreview.locales, collections: [], pictures: 0 };
}

export const pageCount = (spec: Pick<SiteSpec, "pages">): number => spec.pages.filter((p) => p.kind === "home" || p.kind === "standard").length;
export const localeCount = (spec: Pick<SiteSpec, "locales">): number => spec.locales.enabled.length;
export const collectionKinds = (spec: Pick<SiteSpec, "collections">): CollectionKey[] =>
  Object.entries(spec.collections ?? {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k]) => k as CollectionKey);

/** "Plus (29 € na mesec)": the plan an upsell points to. */
export const planOffer = (config: AppConfig, plan: PlanKey): string => `${config.plans[plan].name} (${config.plans[plan].monthlyEur} € na mesec)`;

export interface PlanUpgrade {
  plan: PlanKey;
  name: string;
  monthlyEur: number;
}

const upgradeOf = (config: AppConfig, plan: PlanKey): PlanUpgrade => ({ plan, name: config.plans[plan].name, monthlyEur: config.plans[plan].monthlyEur });

/** The cheapest plan above the viewer's whose site limits satisfy `fits`, or null (Plus, the admin, or none fits). */
export function nextPlanFor(config: AppConfig, tier: Tier, plan: PlanKey | null, fits: (s: SiteLimits) => boolean): PlanKey | null {
  if (tier === "admin") return null;
  const above = tier === "paid" ? PLAN_KEYS.slice(PLAN_KEYS.indexOf(plan ?? "standard") + 1) : [...PLAN_KEYS];
  return above.find((k) => fits(siteLimits(config, "paid", k)!)) ?? null;
}

// ---------- Slovene ----------

type Forms = { one: string; two: string; few: string; other: string };
const rules = new Intl.PluralRules("sl");
const count = (n: number, f: Forms): string => `${n} ${f[rules.select(n) as keyof Forms]}`;
const PAGES: Forms = { one: "stran", two: "strani", few: "strani", other: "strani" };
const PICTURES: Forms = { one: "ustvarjeno sliko", two: "ustvarjeni sliki", few: "ustvarjene slike", other: "ustvarjenih slik" };
/** "v enem jeziku", "v dveh jezikih". */
const inLanguages = (n: number): string => (n === 1 ? "v enem jeziku" : n === 2 ? "v dveh jezikih" : n === 3 ? "v treh jezikih" : n === 4 ? "v štirih jezikih" : `v ${n} jezikih`);
const COLLECTION_SENTENCE: Record<CollectionKey, string> = {
  blog: "Novice so",
  events: "Dogodki so",
  services: "Storitve kot seznam so",
  team: "Ekipa kot seznam je",
};
const FREE_PREFIX = "Brezplačni predogled je domača stran.";

export type LimitKind = "pages" | "locales" | "collections";

export interface LimitBreach {
  what: LimitKind;
  code: `plan_${LimitKind}`;
  /** Slovene, for the owner: what this plan has and which plan adds it. */
  message: string;
  upgrade: PlanUpgrade | null;
}

/**
 * What the owner reads when a limit stops them (the API's refusal and the editor's note at the button):
 * `need` is the number of pages or languages wanted, or the collection.
 */
export function limitMessage(config: AppConfig, tier: Tier, plan: PlanKey | null, what: LimitKind, need: number | CollectionKey): { message: string; upgrade: PlanUpgrade | null } {
  const free = tier !== "paid";
  const current = tier === "paid" ? config.plans[plan ?? "standard"] : null;
  const fits = (s: SiteLimits) =>
    what === "pages" ? s.maxPages >= (need as number) : what === "locales" ? s.locales >= (need as number) : s.collections.includes(need as CollectionKey);
  const next = nextPlanFor(config, tier, plan, fits);
  const upgrade = next ? upgradeOf(config, next) : null;
  const n = next ? config.plans[next] : null;
  let message: string;
  if (what === "pages") {
    if (free) message = n ? `${FREE_PREFIX} Z naročnino ${planOffer(config, next!)} dobite do ${count(n.site.maxPages, PAGES)}, objavo na svoji domeni in pomočnika vsak mesec.` : FREE_PREFIX;
    else message = `Paket ${current!.name} ima največ ${count(current!.site.maxPages, PAGES)}.${n ? ` Paket ${planOffer(config, next!)} jih ima do ${n.site.maxPages}.` : " Izbrišite stran, ki je ne potrebujete, in dodajte novo."}`;
  } else if (what === "locales") {
    const head = free ? `Brezplačni predogled je ${inLanguages(config.plans.freePreview.locales)}.` : `Paket ${current!.name} ima stran ${inLanguages(current!.site.locales)}.`;
    message = n ? `${head} Paket ${planOffer(config, next!)} ima stran ${inLanguages(n.site.locales)}, na primer v slovenščini in angleščini.` : head;
  } else {
    const sentence = COLLECTION_SENTENCE[need as CollectionKey];
    message = `${free ? `${FREE_PREFIX} ` : ""}${n ? `${sentence} v paketu ${planOffer(config, next!)}.` : `${sentence} v tem paketu ni.`}`;
  }
  return { message, upgrade };
}

/**
 * The limit an edit from `before` to `after` would break for this viewer, or null. Only growth counts: a new
 * collection, more pages or languages than the plan has and than the site had.
 */
export function limitBreach(config: AppConfig, tier: Tier, plan: PlanKey | null, before: SiteSpec, after: SiteSpec): LimitBreach | null {
  const limits = siteLimits(config, tier, plan);
  if (!limits) return null;
  const had = new Set(collectionKinds(before));
  const added = collectionKinds(after).find((k) => !had.has(k) && !limits.collections.includes(k));
  const breach = (what: LimitKind, need: number | CollectionKey): LimitBreach => ({ what, code: `plan_${what}`, ...limitMessage(config, tier, plan, what, need) });
  if (added) return breach("collections", added);
  const pages = pageCount(after);
  if (pages > limits.maxPages && pages > pageCount(before)) return breach("pages", pages);
  const locales = localeCount(after);
  if (locales > limits.locales && locales > localeCount(before)) return breach("locales", locales);
  return null;
}

/** What the editor shows at the buttons that hit a limit: the limits, and the note each one reads once reached. */
export interface LimitsInfo extends SiteLimits {
  /** The plan the viewer is on ("Osnovni", "Plus"), or null for a free preview. */
  planName: string | null;
  /** The note at "+ Dodaj stran" once the site has maxPages, with the plan that adds more (upgrade null: none does). */
  pagesNote: { message: string; upgrade: PlanUpgrade | null };
  /** The note about another language once the site has `locales`. */
  localesNote: { message: string; upgrade: PlanUpgrade | null };
  /** Per collection the plan doesn't include: the note at its button. */
  collectionNotes: Partial<Record<CollectionKey, { message: string; upgrade: PlanUpgrade | null }>>;
}

const ALL_COLLECTIONS: readonly CollectionKey[] = ["blog", "events", "services", "team"];

export function limitsInfo(config: AppConfig, tier: Tier, plan: PlanKey | null): LimitsInfo | null {
  const limits = siteLimits(config, tier, plan);
  if (!limits) return null;
  return {
    ...limits,
    planName: tier === "paid" ? config.plans[plan ?? "standard"].name : null,
    pagesNote: limitMessage(config, tier, plan, "pages", limits.maxPages + 1),
    localesNote: limitMessage(config, tier, plan, "locales", limits.locales + 1),
    collectionNotes: Object.fromEntries(ALL_COLLECTIONS.filter((k) => !limits.collections.includes(k)).map((k) => [k, limitMessage(config, tier, plan, "collections", k)])),
  };
}

// ---------- Allowance months and generated pictures ----------

const addMonths = (d: Date, n: number): Date => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
};

/** The allowance month `now` falls in, counted from the day paid rights started; the first one is month 0. */
export function allowancePeriod(since: Date, now: Date): { start: Date; end: Date; first: boolean } {
  let k = (now.getUTCFullYear() - since.getUTCFullYear()) * 12 + (now.getUTCMonth() - since.getUTCMonth());
  if (addMonths(since, k) > now) k--;
  k = Math.max(0, k);
  return { start: addMonths(since, k), end: addMonths(since, k + 1), first: k === 0 };
}

/**
 * How many generated pictures one generation may make (the pipeline's `pictures`): a free preview fills up to
 * `imageGen.pipeline.fillUpToFree`; a paid plan fills up to `fillUpTo[scope]` but makes at most what is left of
 * its month (`generatedPicturesPerMonth` minus `used`); the admin fills up to `fillUpTo[scope]`.
 */
export function pictureBudget(config: AppConfig, tier: Tier, scope: "home" | "full", paid?: { plan: PlanKey; used: number }): { fillTo: number; max: number } {
  const fill = config.imageGen.pipeline.fillUpTo[scope];
  if (tier === "anonymous" || tier === "free") return { fillTo: Math.min(fill, config.imageGen.pipeline.fillUpToFree), max: Infinity };
  if (tier === "paid" && paid) return { fillTo: fill, max: Math.max(0, config.plans[paid.plan].site.generatedPicturesPerMonth - paid.used) };
  return { fillTo: fill, max: Infinity };
}

/** A paid plan's generated pictures this allowance month, for the editor and the generate endpoint's notice. */
export interface PicturesInfo {
  used: number;
  total: number;
  left: number;
  renewsAt: string;
  /** Slovene: what a generation does now that the pictures are used up, and the plan that has more (null while some are left). */
  notice: string | null;
  upgrade: PlanUpgrade | null;
}

/** `renews`: the date the next allowance month starts, as the owner reads it ("4. 11. 2026"). */
export function picturesInfo(config: AppConfig, plan: PlanKey, used: number, renewsAt: Date, renews: string): PicturesInfo {
  const total = config.plans[plan].site.generatedPicturesPerMonth;
  const left = Math.max(0, total - used);
  const next = nextPlanFor(config, "paid", plan, (s) => s.pictures > total);
  const upgrade = next ? upgradeOf(config, next) : null;
  return { used, total, left, renewsAt: renewsAt.toISOString(), notice: left ? null : picturesNotice(config, plan, 0, renews), upgrade };
}

/** The owner's note when a generation got fewer pictures (`made`) than the site would have had: the plan's month is used up. */
export function picturesNotice(config: AppConfig, plan: PlanKey, made: number, renews: string): string {
  const total = config.plans[plan].site.generatedPicturesPerMonth;
  const next = nextPlanFor(config, "paid", plan, (s) => s.pictures > total);
  const more = next ? ` Paket ${planOffer(config, next)} vključuje ${count(config.plans[next].site.generatedPicturesPerMonth, PICTURES)} na mesec.` : "";
  const got = made ? `zato ima nova različica strani le ${count(made, PICTURES)}` : "zato jih nova različica strani ne dobi";
  return `Ta mesec ste porabili vse ustvarjene slike paketa ${config.plans[plan].name} (${total}), ${got}. Nove so na voljo ${renews}.${more}`;
}

/** "4. 11. 2026" in the app's time zone (config stats.timeZone). */
export const slDate = (config: AppConfig, d: Date): string => d.toLocaleDateString("sl-SI", { timeZone: config.stats.timeZone });
