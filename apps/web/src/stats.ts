import { createHmac } from "node:crypto";
import type { Context, Hono } from "hono";
import type { AppConfig } from "@sb/config";
import type { MailMessage, Mailer, Repo, StatTotals } from "@sb/platform";
import { clientIp, type AppEnv } from "./access.ts";

/**
 * Cookieless statistics for published sites (it-site-stats-report): page views counted when a published
 * page is served, taps on call and directions links (stats.js sends one word), and contact-form messages.
 * Only daily totals per site are stored (site_stats). The visitor's IP is used in memory only, as a keyed
 * hash, to skip a reload within `stats.visitDedupeMinutes` and to cap taps per visitor and day.
 * Once a month the owner gets the previous month's totals by email (`sendMonthlyReports`, web process).
 */

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Crawlers, link previews, monitors and checkers (ours included): not visitors. */
const NOT_A_VISITOR = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|lighthouse|headless|curl|wget|python|httpclient|axios|node-fetch|monitor|pingdom|uptime|StrankoPregled/i;

/** The calendar day (YYYY-MM-DD) of `d` in `timeZone`. */
export function dayIn(timeZone: string, d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Counts keys over a window, in memory only; bounded so a flood can't grow it without end. */
class Recent {
  private readonly seen = new Map<string, { until: number; n: number }>();
  constructor(private readonly max = 100_000) {}
  /** How many times `key` was seen within its window, this time included (a new window starts after `ms`). */
  hit(key: string, ms: number, now = Date.now()): number {
    const e = this.seen.get(key);
    const next = e && e.until >= now ? { until: e.until, n: e.n + 1 } : { until: now + ms, n: 1 };
    this.seen.set(key, next);
    if (this.seen.size > this.max) {
      for (const [k, v] of this.seen) if (v.until < now) this.seen.delete(k);
      if (this.seen.size > this.max) this.seen.clear();
    }
    return next.n;
  }
}

export interface StatsCounter {
  /** A published page was served: counted unless it is a bot, a prefetch, or the same visitor again soon. */
  visit(c: Context, siteId: string, page: string): Promise<void>;
}

export function statsCounter(repo: Repo, config: AppConfig, secret: string): StatsCounter & { recent: Recent } {
  const recent = new Recent();
  const visitorKey = (c: Context, rest: string) => createHmac("sha256", secret).update(`stats:${clientIp(c)}:${rest}`).digest("hex").slice(0, 32);
  return {
    recent,
    async visit(c, siteId, page) {
      if (c.req.method !== "GET" || NOT_A_VISITOR.test(c.req.header("user-agent") ?? "") || !c.req.header("user-agent")) return;
      // Speculative loads (Chrome's prerender/prefetch) aren't views.
      if (/prefetch|prerender/i.test(`${c.req.header("sec-purpose") ?? ""} ${c.req.header("purpose") ?? ""}`)) return;
      const minutes = config.stats.visitDedupeMinutes;
      if (minutes > 0 && recent.hit(`v:${visitorKey(c, `${siteId}:${page}`)}`, minutes * 60_000) > 1) return;
      await repo.stats.bump(siteId, "visits", dayIn(config.stats.timeZone));
    },
  };
}

/** The beacon from stats.js: POST /s/<slug>/_hit with "call" or "directions" as the body. */
export function registerStatsRoutes(app: Hono<AppEnv>, d: { repo: Repo; config: AppConfig; secret: string; counter: ReturnType<typeof statsCounter> }): void {
  app.post("/s/:slug/_hit", async (c) => {
    const slug = c.req.param("slug");
    const kind = (await c.req.text().catch(() => "")).trim();
    // Always 204: a beacon's answer is never read, and nobody learns which sites exist.
    if (!SAFE_SLUG.test(slug) || (kind !== "call" && kind !== "directions") || NOT_A_VISITOR.test(c.req.header("user-agent") ?? "")) return c.body(null, 204);
    const site = await d.repo.getSiteBySlug(slug);
    if (!site?.published_version) return c.body(null, 204);
    const day = dayIn(d.config.stats.timeZone);
    const key = createHmac("sha256", d.secret).update(`tap:${clientIp(c)}:${site.id}:${day}`).digest("hex").slice(0, 32);
    if (d.counter.recent.hit(`t:${key}`, 24 * 3600_000) > d.config.stats.tapsPerVisitorPerDay) return c.body(null, 204);
    await d.repo.stats.bump(site.id, kind === "call" ? "calls" : "directions", day);
    return c.body(null, 204);
  });
}

// ---------- The monthly report email ----------

const MONTH_IN = ["januarju", "februarju", "marcu", "aprilu", "maju", "juniju", "juliju", "avgustu", "septembru", "oktobru", "novembru", "decembru"];
const VIEWS: Record<string, string> = { one: "ogled", two: "ogleda", few: "ogledi", other: "ogledov" };
const MONTH_NAME = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface ReportMailInput {
  to: string;
  siteId: string;
  siteName: string;
  /** YYYY-MM. */
  month: string;
  totals: StatTotals;
  /** The month before, for comparison; null when the site has no earlier month. */
  before: StatTotals | null;
  siteUrl: string | null;
  dashboardUrl: string | null;
}

export function monthlyReportMail(m: ReportMailInput): MailMessage {
  const monthIndex = Number(m.month.slice(5, 7)) - 1;
  const name = m.siteName.replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "vaša spletna stran";
  const rows: [string, keyof StatTotals][] = [
    ["Ogledi strani", "visits"],
    ["Tapi na klic", "calls"],
    ["Tapi na pot do vas", "directions"],
    ["Sporočila prek obrazca", "forms"],
  ];
  const fmt = (n: number) => n.toLocaleString("sl-SI");
  const line = (label: string, k: keyof StatTotals) => `${label}: ${fmt(m.totals[k])}${m.before ? ` (${MONTH_NAME[(monthIndex + 11) % 12]}: ${fmt(m.before[k])})` : ""}`;
  const text = [
    "Pozdravljeni,",
    "",
    `to so številke vaše spletne strani ${name} v ${MONTH_IN[monthIndex]} ${m.month.slice(0, 4)}:`,
    "",
    ...rows.map(([l, k]) => line(l, k)),
    "",
    "Štejemo brez piškotkov in brez podatkov o obiskovalcih: samo, kolikokrat so bile strani odprte in kolikokrat so obiskovalci tapnili klic ali pot. Ponovnih ogledov iste osebe v pol ure ne štejemo, robotov in iskalnikov tudi ne.",
    ...(m.siteUrl ? ["", `Vaša stran: ${m.siteUrl}`] : []),
    ...(m.dashboardUrl ? [`Urejanje: ${m.dashboardUrl}`] : []),
  ].join("\n");
  const cell = (s: string, right = false) => `<td style="padding:4px 16px 4px 0;${right ? "text-align:right;font-variant-numeric:tabular-nums" : ""}">${s}</td>`;
  const html = [
    `<div style="font:16px/1.5 system-ui,sans-serif;color:#16181d;max-width:36rem">`,
    `<p>Pozdravljeni,</p>`,
    `<p>to so številke vaše spletne strani ${escapeHtml(name)} v ${MONTH_IN[monthIndex]} ${m.month.slice(0, 4)}:</p>`,
    `<table style="border-collapse:collapse">`,
    ...rows.map(([l, k]) => `<tr>${cell(l)}${cell(fmt(m.totals[k]), true)}${m.before ? cell(`<span style="color:#555">${MONTH_NAME[(monthIndex + 11) % 12]}: ${fmt(m.before[k])}</span>`, true) : ""}</tr>`),
    `</table>`,
    `<p style="color:#555;font-size:14px">Štejemo brez piškotkov in brez podatkov o obiskovalcih: samo, kolikokrat so bile strani odprte in kolikokrat so obiskovalci tapnili klic ali pot. Ponovnih ogledov iste osebe v pol ure ne štejemo, robotov in iskalnikov tudi ne.</p>`,
    ...(m.siteUrl ? [`<p><a href="${escapeHtml(m.siteUrl)}">Vaša stran</a>${m.dashboardUrl ? ` · <a href="${escapeHtml(m.dashboardUrl)}">Urejanje</a>` : ""}</p>`] : []),
    `</div>`,
  ].join("");
  return {
    to: m.to,
    subject: `${name}: ${fmt(m.totals.visits)} ${VIEWS[new Intl.PluralRules("sl-SI").select(m.totals.visits)] ?? "ogledov"} v ${MONTH_IN[monthIndex]}`,
    text,
    html,
    // At most once per site and month, also across a retry within Resend's 24 h window.
    idempotencyKey: `stats-report-${m.siteId}-${m.month}`,
  };
}

/** The month before the one `now` falls in (in `timeZone`): its key and its [start, end) days. */
export function previousMonth(timeZone: string, now = new Date()): { month: string; start: string; end: string; day: number; hour: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const mo = Number(parts.month);
  const py = mo === 1 ? y - 1 : y;
  const pm = mo === 1 ? 12 : mo - 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { month: `${py}-${pad(pm)}`, start: `${py}-${pad(pm)}-01`, end: `${y}-${pad(mo)}-01`, day: Number(parts.day), hour: Number(parts.hour) };
}

export interface ReportDeps {
  repo: Repo;
  config: AppConfig;
  mailer: Mailer;
  appUrl?: string;
  log?: (line: string) => void;
}

/**
 * Sends last month's report to every published site's owner that hasn't had it, within the first
 * `stats.reportWithinDays` days of the month (from `reportFromHour` on day 1). Called hourly; safe to run
 * in several processes (each report is claimed first). Returns how many were sent.
 */
export async function sendMonthlyReports(deps: ReportDeps, now = new Date(), limit = 100): Promise<number> {
  const { repo, config, mailer } = deps;
  const s = config.stats;
  const log = deps.log ?? ((l: string) => console.warn(l));
  const p = previousMonth(s.timeZone, now);
  if (p.day > s.reportWithinDays || (p.day === 1 && p.hour < s.reportFromHour)) return 0;
  const due = await repo.stats.dueReports(p.month, p.end, { maxAttempts: s.maxAttempts, retryAfterMinutes: s.retryEveryMinutes, limit });
  const origin = deps.appUrl?.replace(/\/$/, "") ?? null;
  let sent = 0;
  for (const d of due) {
    if (!(await repo.stats.claimReport(d.siteId, p.month, d.attempts))) continue;
    const site = await repo.getSite(d.siteId);
    const to = site ? await repo.siteOwnerEmail(site.id) : null;
    if (!site || !to) {
      await repo.stats.setReport(d.siteId, p.month, "none");
      continue;
    }
    try {
      const totals = await repo.stats.totals(site.id, p.start, p.end);
      const before = previousMonth(s.timeZone, new Date(`${p.start}T12:00:00Z`));
      const earlier = await repo.stats.totals(site.id, before.start, before.end);
      const hadEarlier = Object.values(earlier).some((n) => n > 0);
      const spec = site.published_version ? (await repo.getSpec(site.id, site.published_version))?.spec : undefined;
      const siteName = spec && typeof spec.business.name === "string" && spec.business.name.trim() ? spec.business.name : site.name;
      await mailer.send(
        monthlyReportMail({
          to,
          siteId: site.id,
          siteName,
          month: p.month,
          totals,
          before: hadEarlier ? earlier : null,
          siteUrl: origin ? `${origin}/s/${site.slug}/` : null,
          dashboardUrl: origin ? `${origin}/sites/${site.id}` : null,
        }),
      );
      await repo.stats.setReport(site.id, p.month, "sent");
      sent++;
    } catch (e) {
      const last = d.attempts + 1 >= s.maxAttempts;
      await repo.stats.setReport(site.id, p.month, last ? "failed" : "pending").catch(() => undefined);
      const reason = e instanceof Error ? (e.name === "MailUnavailableError" ? "email is not configured" : e.message.slice(0, 120)) : "unknown error";
      log(`[stats-report] ${site.id} ${p.month}: attempt ${d.attempts + 1} failed (${reason})${last ? ", giving up" : ", will retry"}`);
    }
  }
  return sent;
}
