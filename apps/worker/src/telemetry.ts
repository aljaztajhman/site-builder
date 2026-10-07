import type { AppConfig } from "@sb/config";
import { SpendCapError, type GenerateResult } from "@sb/engine";
import { recordEvent, type GenerationProps, type Platform, type Tier } from "@sb/platform";

/**
 * Engine telemetry (docs/plans/analytics.md Step 3, it-analytics): one `generation` product event per generation job,
 * built from what the job already logged (model_calls: € per stage, pictures; site_events: stage times, the critique's
 * rounds, the direction) and its result (the last check's failures, Lighthouse). Plus the funnel's step for the owner:
 * `preview_ready` (a homepage) or `site_generated` (a whole site) when the job left a saved version. Written only with
 * config analytics.events on; never text from the site, only names, counts, seconds and €.
 */

export interface GenerationOutcome {
  siteId: string;
  jobId: string;
  scope: "home" | "full";
  tier: Tier | null;
  accountId: string | null;
  startedAt: number;
  outcome: GenerationProps["outcome"];
  /** The job saved a version (the owner has a site to look at), whatever happened after. */
  saved: boolean;
  result?: GenerateResult;
  error?: unknown;
}

/** A check failure line (check/index.ts failuresOf) as the check's name; the line itself can quote the site's facts. */
export function checkNames(failures: string[]): string[] {
  const out = new Set<string>();
  for (const f of failures) {
    const axe = /: axe (.+)$/.exec(f);
    if (/^spec invalid/.test(f)) out.add("spec-invalid");
    else if (/^facts not in brief/.test(f)) out.add("facts");
    else if (axe) for (const m of axe[1]!.matchAll(/([a-z0-9-]+)\(\d+\)/g)) out.add(`axe:${m[1]}`);
    else if (/horizontal scroll at 360/.test(f)) out.add("scroll-360");
    else if (/horizontal scroll at 1280/.test(f)) out.add("scroll-1280");
    else if (/primary targets < 44px/.test(f)) out.add("targets-44");
    else if (/primary targets < 8px apart/.test(f)) out.add("targets-apart");
    else if (/targets < 24px/.test(f)) out.add("targets-24");
    else if (/body text < 16px/.test(f)) out.add("text-16");
    else if (/: lang is /.test(f)) out.add("lang");
    else if (/click-to-call not reachable/.test(f)) out.add("call-reach");
    else if (/directions not reachable/.test(f)) out.add("directions-reach");
    else if (/banned patterns/.test(f)) out.add("banned");
    else if (/line length over/.test(f)) out.add("line-length");
    else {
      const lh = /lighthouse (performance|accessibility|best practices|seo) /.exec(f);
      out.add(lh ? `lighthouse-${lh[1]!.replace(" ", "-")}` : "other");
    }
  }
  return [...out].sort();
}

/** The `generation` event's props for a finished job. */
export async function generationProps(platform: Pick<Platform, "repo">, o: GenerationOutcome, now = Date.now()): Promise<GenerationProps> {
  const db = platform.repo.db;
  const { rows: calls } = await db.query<{ stage: string; eur: string; calls: string; ok: string }>(
    `select stage, coalesce(sum(cost_eur), 0) as eur, count(*) as calls, count(*) filter (where ok) as ok
       from model_calls where job_id = $1 and not pending group by stage`,
    [o.jobId],
  );
  const { rows: events } = await db.query<{ stage: string; message: string; data: Record<string, unknown> | unknown[] | null }>(
    "select stage, message, data from site_events where job_id = $1 order by id",
    [o.jobId],
  );
  const stages: GenerationProps["stages"] = {};
  const open = new Map<string, number>();
  let lastOpen: string | null = null;
  let firstVersionMs: number | null = null;
  let direction: string | null = null;
  let pictureLimit = false;
  const critiqueIssues: number[] = [];
  for (const e of events) {
    const data = (e.data ?? {}) as Record<string, unknown>;
    if (e.message === "start") {
      open.set(e.stage, (open.get(e.stage) ?? 0) + 1);
      lastOpen = e.stage;
    } else if (e.message === "done") {
      open.set(e.stage, (open.get(e.stage) ?? 1) - 1);
      const s = (stages[e.stage] ??= { seconds: 0, eur: 0 });
      s.seconds += Number(data.ms ?? 0) / 1000;
    }
    if (e.stage === "preview" && typeof data.ms === "number") firstVersionMs ??= data.ms;
    if (e.stage === "design" && typeof data.direction === "string") direction = data.direction;
    if (e.stage === "imageGen" && data.planLimit === true) pictureLimit = true;
    if (e.stage === "critique" && /^Round \d+:/.test(e.message)) critiqueIssues.push(Array.isArray(e.data) ? e.data.length : 0);
  }
  for (const c of calls) {
    const s = (stages[c.stage] ??= { seconds: 0, eur: 0 });
    s.eur += Number(c.eur);
  }
  for (const s of Object.values(stages)) {
    s.seconds = Math.round(s.seconds * 10) / 10;
    s.eur = Math.round(s.eur * 1e6) / 1e6;
  }
  // The stage still open when the job failed (started more often than it finished): the last one that started.
  const stillOpen = [...open.entries()].filter(([, n]) => n > 0).map(([s]) => s);
  const failedStage = o.outcome === "failed" ? (stillOpen.includes(lastOpen ?? "") ? lastOpen : (stillOpen.at(-1) ?? lastOpen)) : null;
  const callsOf = (stage: string) => calls.find((c) => c.stage === stage);
  const check = o.result?.check ?? null;
  const spec = o.saved ? (await platform.repo.getSpec(o.siteId))?.spec : undefined;
  const home = spec?.pages.find((p) => p.kind === "home") ?? spec?.pages[0];
  const hero = home?.sections[0];
  return {
    scope: o.scope,
    outcome: o.outcome,
    seconds: Math.round((now - o.startedAt) / 100) / 10,
    firstVersionSeconds: firstVersionMs === null ? (o.result ? Math.round(o.result.firstVersionMs / 100) / 10 : null) : Math.round(firstVersionMs / 100) / 10,
    eur: Math.round(calls.reduce((s, c) => s + Number(c.eur), 0) * 1e6) / 1e6,
    stages,
    failedStage,
    error: o.error === undefined ? null : o.error instanceof Error ? o.error.name : "unknown",
    checksFailed: check ? checkNames(check.failures) : [],
    lighthouse: check?.lighthouse ? { performance: check.lighthouse.performance, accessibility: check.lighthouse.accessibility, bestPractices: check.lighthouse.bestPractices, seo: check.lighthouse.seo } : null,
    critique: { rounds: o.result?.critiqueRounds ?? critiqueIssues.length, issues: critiqueIssues },
    pictures: Number(callsOf("imageGen")?.ok ?? 0),
    retries: Math.max(0, Number(callsOf("content")?.calls ?? 0) - 1),
    caps: { spend: o.error instanceof SpendCapError || o.result?.critiqueSkipped === "spend_cap", pictures: pictureLimit },
    direction: spec?.design.direction ?? direction,
    hero: hero ? `${hero.type}:${String((hero as { variant?: unknown }).variant ?? "")}` : null,
  };
}

/**
 * Writes the job's `generation` event and, when it left a saved version for an owner (not the admin), the funnel's
 * `preview_ready` or `site_generated`. Off with config analytics.events off; never throws.
 */
export async function recordGeneration(platform: Pick<Platform, "repo">, config: AppConfig, o: GenerationOutcome): Promise<void> {
  if (!config.analytics.events) return;
  try {
    const props = await generationProps(platform, o);
    const base = { siteId: o.siteId, accountId: o.accountId, tier: o.tier };
    await recordEvent(platform.repo.events, config, { kind: "generation", ...base, props: props as unknown as Record<string, unknown> });
    if (o.saved && o.tier !== "admin") {
      await recordEvent(platform.repo.events, config, {
        kind: o.scope === "full" ? "site_generated" : "preview_ready",
        ...base,
        props: { seconds: props.firstVersionSeconds ?? props.seconds, eur: props.eur },
      });
    }
  } catch (e) {
    console.error(`[events] generation of ${o.siteId} not written:`, (e as Error).message);
  }
}
