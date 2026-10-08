/**
 * The variety numbers of an eval run (docs/plans/variety-engine.md, Step 0): look distance within each trade and
 * across trades, the pairs that would read as one template, brand fit and motif fit per site.
 */
import { DIRECTIONS } from "@sb/spec";
import { lookSummary, type BrandFit, type LookSummary } from "./look-distance.ts";
import { copySummary, type HomepageCopy } from "./copy-similarity.ts";
import { mean, type JudgeOutput } from "./judge.ts";
import type { FixtureResult } from "./runner.ts";

/** The config variety switches an eval run can turn on (--variety). */
export const VARIETY_SWITCHES = ["families", "skeleton", "concept"] as const;

/**
 * The variety targets (docs/plans/variety-engine.md, Step 0 "Targets"): within-trade look distance at least today's
 * across-trade distance (0.47 replayed, 0.61 goldens on 2026-10-07; a before/after comparison uses the baseline run's
 * own number), no two sites of one trade sharing palette, font pair and hero, distinctiveness at least 3 on every site,
 * and judge medians not below today's 3.2 (3.7 on the template trades).
 */
export const VARIETY_TARGETS = { acrossTradesToday: 0.47, distinctiveness: 3, judgeMedian: 3.2, judgeMedianTemplate: 3.7 } as const;

/** A site's judge score: the mean of its phone and desktop means (each the mean of the six criteria). */
export const judgeScore = (j: JudgeOutput): number => (mean(j.phone) + mean(j.desktop)) / 2;
/** The lower of the phone and desktop distinctiveness scores. */
export const distinctiveness = (j: JudgeOutput): number => Math.min(j.phone.distinctiveness, j.desktop.distinctiveness);
/** A trade with its own template (directions.ts `template.firstFor`): the "template trades" of the 3.7 median. */
export const templateTrade = (businessType: string): boolean => DIRECTIONS.some((d) => d.template?.firstFor.includes(businessType as never));

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);

export interface VarietyTarget {
  name: string;
  value: string;
  target: string;
  met: boolean | null;
}

export interface VarietyData {
  meta: { mode: string; scope: string; startedAt: string; switches: string[]; label?: string; totalEur?: number };
  summary: Omit<LookSummary, "pairs" | "collisions"> & { collisionsWithinTrade: string[]; collisionsAcross: string[] };
  judge: { sites: number; median: number | null; medianTemplate: number | null; medianPhone: number | null; medianDesktop: number | null; minDistinctiveness: number | null; belowDistinctiveness: string[] };
  anotherLook: { measured: number; ok: number; meanDistance: number | null; minDistance: number | null; failing: string[]; none: string[] };
  regenerated: { measured: number; meanDistance: number | null; minDistance: number | null; sameLook: string[]; eur: number; failing: string[]; errors: string[] };
  generationEurMedian: number | null;
  sites: {
    id: string;
    trade: string;
    direction: string;
    fontPair: string;
    hero: string;
    primary: string;
    judge: number | null;
    distinctiveness: number | null;
    generationEur: number;
    failures: number;
    error?: string;
    anotherLook?: FixtureResult["anotherLook"];
    regenerated?: { distance: number; eur: number; failures: number } | { error: string };
  }[];
  targets: VarietyTarget[];
}

/** The run's variety numbers and targets as data (eval/…/variety-*.json), for pnpm variety:compare. */
export function varietyData(results: FixtureResult[], meta: { mode: string; scope: string; startedAt: Date; switches: string[]; label?: string; totalEur?: number }): VarietyData {
  const sites = results.filter((r) => r.look);
  const s = lookSummary(sites.map((r) => r.look!.site));
  const judged = results.filter((r) => r.judge);
  const looks = results.flatMap((r) => (r.anotherLook ? [{ id: r.id, a: r.anotherLook }] : []));
  const okLooks = looks.flatMap((l) => (l.a.ok ? [{ id: l.id, a: l.a }] : []));
  const regens = results.flatMap((r) => (r.regenerated && r.regenerated.error === undefined ? [{ id: r.id, g: r.regenerated, r }] : []));
  const { pairs: _pairs, collisions, ...rest } = s;
  const data: Omit<VarietyData, "targets"> = {
    meta: { mode: meta.mode, scope: meta.scope, startedAt: meta.startedAt.toISOString(), switches: meta.switches, ...(meta.label ? { label: meta.label } : {}), ...(meta.totalEur !== undefined ? { totalEur: meta.totalEur } : {}) },
    summary: {
      ...rest,
      collisionsWithinTrade: collisions.filter((p) => p.sameTrade).map((p) => `${p.a} / ${p.b}`),
      collisionsAcross: collisions.filter((p) => !p.sameTrade).map((p) => `${p.a} / ${p.b}`),
    },
    judge: {
      sites: judged.length,
      median: median(judged.map((r) => judgeScore(r.judge!))),
      medianTemplate: median(judged.filter((r) => templateTrade(r.type)).map((r) => judgeScore(r.judge!))),
      medianPhone: median(judged.map((r) => mean(r.judge!.phone))),
      medianDesktop: median(judged.map((r) => mean(r.judge!.desktop))),
      minDistinctiveness: judged.length ? Math.min(...judged.map((r) => distinctiveness(r.judge!))) : null,
      belowDistinctiveness: judged.filter((r) => distinctiveness(r.judge!) < VARIETY_TARGETS.distinctiveness).map((r) => r.id),
    },
    anotherLook: {
      measured: looks.length,
      ok: okLooks.length,
      meanDistance: avg(okLooks.map((l) => l.a.distance)),
      minDistance: okLooks.length ? Math.min(...okLooks.map((l) => l.a.distance)) : null,
      failing: okLooks.filter((l) => l.a.failures.length || !l.a.valid).map((l) => l.id),
      none: looks.flatMap((l) => (l.a.ok ? [] : [`${l.id} (${l.a.reason})`])),
    },
    regenerated: {
      measured: regens.length,
      meanDistance: avg(regens.map((x) => x.g.distance)),
      minDistance: regens.length ? Math.min(...regens.map((x) => x.g.distance)) : null,
      // Same direction, font pair, primary and hero: "Ustvari znova" brought back the look it replaced.
      sameLook: regens
        .filter((x) => {
          const a = x.r.look!.site.features;
          const b = x.g.features;
          return a.direction === b.direction && a.fontPair === b.fontPair && a.palette.primary === b.palette.primary && a.hero.type === b.hero.type && a.hero.variant === b.hero.variant;
        })
        .map((x) => x.id),
      eur: regens.reduce((a, x) => a + x.g.eur, 0),
      failing: regens.filter((x) => x.g.failures.length).map((x) => x.id),
      errors: results.flatMap((r) => (r.regenerated && r.regenerated.error !== undefined ? [`${r.id}: ${r.regenerated.error}`] : [])),
    },
    generationEurMedian: median(results.filter((r) => !r.error).map((r) => r.generationEur)),
    sites: results.map((r) => {
      const f = r.look?.site.features;
      return {
        id: r.id,
        trade: r.type,
        direction: f?.direction ?? "—",
        fontPair: f?.fontPair ?? "—",
        hero: f ? `${f.hero.type}:${f.hero.variant}` : "—",
        primary: f?.palette.primary ?? "—",
        judge: r.judge ? judgeScore(r.judge) : null,
        distinctiveness: r.judge ? distinctiveness(r.judge) : null,
        generationEur: r.generationEur,
        failures: r.checkpoints[0]?.failures.length ?? 0,
        ...(r.error ? { error: (r.error.split("\n")[0] ?? "").slice(0, 300) } : {}),
        ...(r.anotherLook ? { anotherLook: r.anotherLook } : {}),
        ...(r.regenerated
          ? { regenerated: r.regenerated.error === undefined ? { distance: r.regenerated.distance, eur: r.regenerated.eur, failures: r.regenerated.failures.length } : { error: r.regenerated.error } }
          : {}),
      };
    }),
  };
  return { ...data, targets: varietyTargets(data) };
}

/**
 * The targets of one run. `baselineAcross`: the across-trade distance of the run this one is compared with (the
 * switches-off baseline); without it, today's lowest measured number (0.47).
 */
export function varietyTargets(d: Omit<VarietyData, "targets">, baselineAcross?: number | null): VarietyTarget[] {
  const across = baselineAcross ?? VARIETY_TARGETS.acrossTradesToday;
  const within = d.summary.withinTradeAll;
  return [
    {
      name: "Look distance within a trade ≥ across trades",
      value: n2(within),
      target: `≥ ${across.toFixed(2)} (${baselineAcross != null ? "the baseline's across-trade distance" : "today's lowest across-trade distance"})`,
      met: within === null ? null : within >= across,
    },
    {
      name: "No two sites of one trade share palette, font pair and hero",
      value: `${d.summary.collisionsWithinTrade.length}${d.summary.collisionsWithinTrade.length ? ` (${d.summary.collisionsWithinTrade.join(", ")})` : ""}`,
      target: "0",
      met: d.summary.withinTradeAll === null ? null : d.summary.collisionsWithinTrade.length === 0,
    },
    {
      name: "Judge distinctiveness ≥ 3 on every site (lower of phone and desktop)",
      value: d.judge.minDistinctiveness === null ? "—" : `min ${d.judge.minDistinctiveness}${d.judge.belowDistinctiveness.length ? `; below 3: ${d.judge.belowDistinctiveness.join(", ")}` : ""}`,
      target: "≥ 3",
      met: d.judge.minDistinctiveness === null ? null : d.judge.minDistinctiveness >= VARIETY_TARGETS.distinctiveness,
    },
    {
      name: "Judge median (mean of phone and desktop)",
      value: n2(d.judge.median),
      target: `≥ ${VARIETY_TARGETS.judgeMedian}`,
      met: d.judge.median === null ? null : d.judge.median >= VARIETY_TARGETS.judgeMedian,
    },
    {
      name: "Judge median on the template trades",
      value: n2(d.judge.medianTemplate),
      target: `≥ ${VARIETY_TARGETS.judgeMedianTemplate}`,
      met: d.judge.medianTemplate === null ? null : d.judge.medianTemplate >= VARIETY_TARGETS.judgeMedianTemplate,
    },
  ];
}

export function targetLines(targets: VarietyTarget[]): string[] {
  return [
    "| Target | Value | Needed | Met |",
    "|---|---|---|---|",
    ...targets.map((t) => `| ${t.name} | ${t.value} | ${t.target} | ${t.met === null ? "not measured" : t.met ? "✓" : "✗"} |`),
  ];
}

const n2 = (x: number | null) => (x === null ? "—" : x.toFixed(2));

function brandLine(b: BrandFit): string {
  if (b.kind === "no-logo") return "no logo";
  if (b.kind === "no-colour") return "logo has no usable colour";
  return `${b.kind === "fit" ? "✓" : "✗"} ${b.logo} → ${b.role} (ΔE ${b.deltaE.toFixed(0)})`;
}

export function renderVariety(results: FixtureResult[], meta: { mode: string; scope: string; startedAt: Date; note?: string; switches?: string[]; label?: string }): string {
  const sites = results.filter((r) => r.look);
  const s = lookSummary(sites.map((r) => r.look!.site));
  const lines = [
    "# Variety: how alike the generated homepages look",
    "",
    `Mode **${meta.mode}**, scope **${meta.scope}**, ${meta.startedAt.toISOString()}, ${sites.length} sites, ${s.pairs.length} pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).`,
    "",
  ];
  if (meta.note) lines.push(meta.note, "");
  if (meta.switches) lines.push(`Variety switches on: **${meta.switches.length ? meta.switches.join(", ") : "none"}**${meta.label ? ` (run ${meta.label})` : ""}.`, "");
  const data = varietyData(results, { ...meta, switches: meta.switches ?? [] });
  if (results.some((r) => r.judge) || s.withinTradeAll !== null) lines.push("## Targets", "", ...targetLines(data.targets), "");
  lines.push(
    "## Summary",
    "",
    `- Across trades (pairs of different business types): **${n2(s.acrossTrades)}**`,
    `- Within a trade (pairs of the same business type): **${n2(s.withinTradeAll)}**${s.withinTradeAll === null ? " (no two sites of one trade in this run: run with --twins)" : ""}`,
    `- Pairs a visitor would take for one template (same palette family, font pair and hero): **${s.collisions.length}**${s.collisions.length ? `: ${s.collisions.map((p) => `${p.a} / ${p.b}`).join(", ")}` : ""}`,
    `- Brand fit (a logo colour reaches primary, band or accent within ΔE 20): ${sites.filter((r) => r.look!.brand.kind === "fit").length} of ${sites.filter((r) => r.look!.brand.kind === "fit" || r.look!.brand.kind === "miss").length} sites with a coloured logo`,
    `- Motif fit: ${sites.filter((r) => r.look!.motif === "fit").length} fit, ${sites.filter((r) => r.look!.motif === "misfit").length} misfit, ${sites.filter((r) => r.look!.motif === "no-motif").length} without a motif`,
    "",
  );
  if (Object.keys(s.withinTrade).length) {
    lines.push("## Within each trade", "", "| Trade | Pairs | Mean | Closest pair |", "|---|---|---|---|");
    for (const [trade, w] of Object.entries(s.withinTrade)) lines.push(`| ${trade} | ${w.pairs} | ${w.mean.toFixed(2)} | ${w.min.toFixed(2)} |`);
    lines.push("");
  }
  lines.push("## Per site", "", "| Site | Trade | Direction | Font pair | Hero | Brand fit | Motif |", "|---|---|---|---|---|---|---|");
  for (const r of sites) {
    const f = r.look!.site.features;
    lines.push(`| ${r.id} | ${r.look!.site.trade} | ${f.direction} | ${f.fontPair} | ${f.hero.type}:${f.hero.variant} | ${brandLine(r.look!.brand)} | ${f.motif ?? "—"} ${r.look!.motif === "fit" ? "✓" : r.look!.motif === "misfit" ? "✗" : ""} |`);
  }
  const a = data.anotherLook;
  const g = data.regenerated;
  if (a.measured || g.measured || g.errors.length) lines.push("", "## Druga podoba and Ustvari znova", "");
  if (a.measured) {
    lines.push(
      `- Druga podoba (no model call): ${a.ok} of ${a.measured} sites got another look, mean distance from the generated look **${n2(a.meanDistance)}** (closest ${n2(a.minDistance)}); with check failures or invalid: ${a.failing.length ? a.failing.join(", ") : "none"}${a.none.length ? `; none offered: ${a.none.join(", ")}` : ""}`,
    );
  }
  if (g.measured || g.errors.length) {
    lines.push(
      `- Ustvari znova (paid, €${g.eur.toFixed(3)}): ${g.measured} regenerated, mean distance from the first look **${n2(g.meanDistance)}** (closest ${n2(g.minDistance)}); the same look again: ${g.sameLook.length ? g.sameLook.join(", ") : "none"}; with check failures: ${g.failing.length ? g.failing.join(", ") : "none"}${g.errors.length ? `; failed: ${g.errors.join("; ")}` : ""}`,
    );
  }
  lines.push("", "## Closest pairs", "", "| Pair | Same trade | Spec | Screens | Look distance |", "|---|---|---|---|---|");
  for (const p of [...s.pairs].sort((a, b) => a.total - b.total).slice(0, 12)) {
    lines.push(`| ${p.a} / ${p.b} | ${p.sameTrade ? "yes" : "no"} | ${p.spec.toFixed(2)} | ${n2(p.screens)} | ${p.total.toFixed(2)} |`);
  }
  lines.push(...copyLines(results.flatMap((r) => (r.copy ? [r.copy] : []))));
  return `${lines.join("\n")}\n`;
}

/** The copy overlap section (copy-similarity.ts): how alike the homepages' headings read. */
export function copyLines(sites: HomepageCopy[]): string[] {
  if (sites.length < 2) return [];
  const c = copySummary(sites);
  const lines = [
    "",
    "## Copy: how alike the homepages read",
    "",
    "Word overlap (Jaccard of word stems) of each homepage's hero headline, eyebrows and section titles, the business's own name and town left out: 0 = no word in common, 1 = the same words. Free, from the spec.",
    "",
    `- Across trades: **${n2(c.acrossTrades)}**`,
    `- Within a trade: **${n2(c.withinTrade)}**${c.withinTrade === null ? " (no two sites of one trade in this run: run with --twins)" : ""}`,
    `- Headings used word for word on more than one homepage: ${c.repeated.length ? c.repeated.slice(0, 12).map((r) => `„${r.heading}" ×${r.sites}`).join(", ") : "none"}`,
    "",
    "| Pair | Same trade | Copy overlap |",
    "|---|---|---|",
  ];
  for (const p of [...c.pairs].sort((a, b) => b.overlap - a.overlap).slice(0, 8)) lines.push(`| ${p.a} / ${p.b} | ${p.sameTrade ? "yes" : "no"} | ${p.overlap.toFixed(2)} |`);
  return lines;
}
