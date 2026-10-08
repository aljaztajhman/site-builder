/**
 * pnpm variety:compare <before.json> <after.json> [--out <file.md>]
 *
 * A before/after report of two variety runs (the .json beside each eval/…/variety-*.md, written by pnpm eval): the
 * targets of each (the after run's look distance measured against the before run's across-trade distance, as
 * docs/plans/variety-engine.md asks), the judge and cost per site side by side, and the switches each run had on.
 * Free: reads the two files, no model call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { targetLines, varietyTargets, type VarietyData } from "./variety-report.ts";

const n2 = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toFixed(2));
const eur = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `€${x.toFixed(3)}`);
const switches = (d: VarietyData) => (d.meta.switches.length ? d.meta.switches.join(", ") : "none");

export function renderCompare(before: VarietyData, after: VarietyData): string {
  const afterTargets = varietyTargets(after, before.summary.acrossTrades);
  const ids = after.sites.map((s) => s.id);
  const lines = [
    "# Variety: before and after",
    "",
    `Before: **${switches(before)}** (${before.meta.mode}, ${before.meta.scope}, ${before.meta.startedAt}${before.meta.label ? `, run ${before.meta.label}` : ""}, ${before.sites.length} sites${before.meta.totalEur !== undefined ? `, paid €${before.meta.totalEur.toFixed(2)}` : ""}).`,
    `After: **${switches(after)}** (${after.meta.mode}, ${after.meta.scope}, ${after.meta.startedAt}${after.meta.label ? `, run ${after.meta.label}` : ""}, ${after.sites.length} sites${after.meta.totalEur !== undefined ? `, paid €${after.meta.totalEur.toFixed(2)}` : ""}).`,
    "",
    "## Targets after (look distance against the before run's across-trade distance)",
    "",
    ...targetLines(afterTargets),
    "",
    "## Targets before",
    "",
    ...targetLines(before.targets),
    "",
    "## Numbers",
    "",
    "| | Before | After |",
    "|---|---|---|",
    `| Look distance across trades | ${n2(before.summary.acrossTrades)} | ${n2(after.summary.acrossTrades)} |`,
    `| Look distance within a trade | ${n2(before.summary.withinTradeAll)} | ${n2(after.summary.withinTradeAll)} |`,
    ...[...new Set([...Object.keys(before.summary.withinTrade), ...Object.keys(after.summary.withinTrade)])].map(
      (t) => `| … ${t} (mean, closest pair) | ${n2(before.summary.withinTrade[t]?.mean)}, ${n2(before.summary.withinTrade[t]?.min)} | ${n2(after.summary.withinTrade[t]?.mean)}, ${n2(after.summary.withinTrade[t]?.min)} |`,
    ),
    `| Same-trade pairs with one palette, font pair and hero | ${before.summary.collisionsWithinTrade.length} | ${after.summary.collisionsWithinTrade.length} |`,
    `| Judge median (phone / desktop) | ${n2(before.judge.median)} (${n2(before.judge.medianPhone)} / ${n2(before.judge.medianDesktop)}) | ${n2(after.judge.median)} (${n2(after.judge.medianPhone)} / ${n2(after.judge.medianDesktop)}) |`,
    `| Judge median, template trades | ${n2(before.judge.medianTemplate)} | ${n2(after.judge.medianTemplate)} |`,
    `| Lowest distinctiveness | ${before.judge.minDistinctiveness ?? "—"} | ${after.judge.minDistinctiveness ?? "—"} |`,
    `| Median generation cost per homepage | ${eur(before.generationEurMedian)} | ${eur(after.generationEurMedian)} |`,
    `| Druga podoba: sites with another look, mean distance | ${before.anotherLook.measured ? `${before.anotherLook.ok}/${before.anotherLook.measured}, ${n2(before.anotherLook.meanDistance)}` : "—"} | ${after.anotherLook.measured ? `${after.anotherLook.ok}/${after.anotherLook.measured}, ${n2(after.anotherLook.meanDistance)}` : "—"} |`,
    `| Ustvari znova: regenerated, mean distance, same look again | ${before.regenerated.measured ? `${before.regenerated.measured}, ${n2(before.regenerated.meanDistance)}, ${before.regenerated.sameLook.length}` : "—"} | ${after.regenerated.measured ? `${after.regenerated.measured}, ${n2(after.regenerated.meanDistance)}, ${after.regenerated.sameLook.length}` : "—"} |`,
    "",
    "Only sites in both runs are compared below; the before run's numbers above cover all of its sites.",
    "",
    "## Per site",
    "",
    "| Site | Trade | Before: direction, font pair, hero | After: direction, font pair, hero | Judge before → after | Distinctiveness before → after | Generation € before → after | Check failures before → after |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const id of ids) {
    const a = after.sites.find((s) => s.id === id)!;
    const b = before.sites.find((s) => s.id === id);
    if (!b) continue;
    lines.push(
      `| ${id} | ${a.trade} | ${b.direction}, ${b.fontPair}, ${b.hero} | ${a.direction}, ${a.fontPair}, ${a.hero} | ${n2(b.judge)} → ${n2(a.judge)} | ${b.distinctiveness ?? "—"} → ${a.distinctiveness ?? "—"} | ${eur(b.generationEur)} → ${eur(a.generationEur)} | ${b.failures} → ${a.failures}${a.error ? ` (error: ${a.error})` : ""} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("variety-compare.ts")) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  const files = outAt < 0 ? args : args.filter((_, i) => i !== outAt && i !== outAt + 1);
  if (files.length !== 2) {
    console.error("Usage: pnpm variety:compare <before.json> <after.json> [--out <file.md>]");
    process.exit(2);
  }
  const [before, after] = files.map((f) => JSON.parse(readFileSync(f!, "utf8")) as VarietyData);
  const md = renderCompare(before!, after!);
  if (out) writeFileSync(out, md);
  else process.stdout.write(md);
}
