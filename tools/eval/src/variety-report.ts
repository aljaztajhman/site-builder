/**
 * The variety numbers of an eval run (docs/plans/variety-engine.md, Step 0): look distance within each trade and
 * across trades, the pairs that would read as one template, brand fit and motif fit per site.
 */
import { lookSummary, type BrandFit } from "./look-distance.ts";
import type { FixtureResult } from "./runner.ts";

const n2 = (x: number | null) => (x === null ? "—" : x.toFixed(2));

function brandLine(b: BrandFit): string {
  if (b.kind === "no-logo") return "no logo";
  if (b.kind === "no-colour") return "logo has no usable colour";
  return `${b.kind === "fit" ? "✓" : "✗"} ${b.logo} → ${b.role} (ΔE ${b.deltaE.toFixed(0)})`;
}

export function renderVariety(results: FixtureResult[], meta: { mode: string; scope: string; startedAt: Date; note?: string }): string {
  const sites = results.filter((r) => r.look);
  const s = lookSummary(sites.map((r) => r.look!.site));
  const lines = [
    "# Variety: how alike the generated homepages look",
    "",
    `Mode **${meta.mode}**, scope **${meta.scope}**, ${meta.startedAt.toISOString()}, ${sites.length} sites, ${s.pairs.length} pairs. Look distance 0 = the same site, 1 = nothing in common: the spec (direction, font pair, palette ΔE, hero, header, section sequence) and the first screens at 360 and 1280 px (layout gradients, colour histogram), weighted equally. Free, no model call (tools/eval/src/look-distance.ts).`,
    "",
  ];
  if (meta.note) lines.push(meta.note, "");
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
  lines.push("", "## Closest pairs", "", "| Pair | Same trade | Spec | Screens | Look distance |", "|---|---|---|---|---|");
  for (const p of [...s.pairs].sort((a, b) => a.total - b.total).slice(0, 12)) {
    lines.push(`| ${p.a} / ${p.b} | ${p.sameTrade ? "yes" : "no"} | ${p.spec.toFixed(2)} | ${n2(p.screens)} | ${p.total.toFixed(2)} |`);
  }
  return `${lines.join("\n")}\n`;
}
