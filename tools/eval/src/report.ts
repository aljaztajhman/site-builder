import sharp, { type OverlayOptions } from "sharp";
import type { AppConfig } from "@sb/config";
import type { FixtureResult, Mode } from "./runner.ts";
import { skeletonSimilarity, type HomepageShape } from "./homepage-metrics.ts";
import type { Composition } from "@sb/engine";
import { mean } from "./judge.ts";

type Target = AppConfig["checks"]["composition"]["mobile"];
/** Which first-screen targets a homepage misses at one viewport. */
export function compositionMisses(c: Composition, t: Target, hasPhotos: boolean): string[] {
  const out: string[] = [];
  if (hasPhotos && c.imageShare < t.minImageShareWithPhotos) out.push(`photo ${Math.round(c.imageShare * 100)} % < ${Math.round(t.minImageShareWithPhotos * 100)} %`);
  if (c.buttonsFirstScreen > t.maxButtons) out.push(`${c.buttonsFirstScreen} buttons > ${t.maxButtons}`);
  if (c.headlineLines > t.maxHeadlineLines) out.push(`headline ${c.headlineLines} lines > ${t.maxHeadlineLines}`);
  if (c.largestGapPx > t.maxGapPx) out.push(`empty band ${c.largestGapPx} px > ${t.maxGapPx}`);
  return out;
}
const compCell = (c: Composition) =>
  `${Math.round(c.imageShare * 100)} % · ${c.firstImageAt === null ? "—" : c.firstImageAt.toFixed(2)} · ${c.buttonsFirstScreen} · ${c.headlineLines} · ${c.largestGapPx}`;

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const eur = (n: number) => `€${n.toFixed(3)}`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const mark = (ok: boolean | null) => (ok === null ? "?" : ok ? "✓" : "✗");

export function renderReport(results: FixtureResult[], config: AppConfig, meta: { mode: Mode; scope: string; startedAt: Date; totalEur: number; wallMs: number }): string {
  const lh = config.checks.lighthouse;
  const lines: string[] = [];
  lines.push(`# Eval report`, "");
  lines.push(`Mode: **${meta.mode}**, scope: **${meta.scope}**, started ${meta.startedAt.toISOString()}, wall time ${sec(meta.wallMs)}, paid this run ${eur(meta.totalEur)} (replayed answers and cached pictures are free; the € columns below price every call like production).`, "");
  const sum = (f: (r: FixtureResult) => number) => results.reduce((a, r) => a + f(r), 0);
  const reused = [
    results.some((r) => r.calls) ? `${sum((r) => r.calls?.replayed ?? 0)} model calls replayed from the recordings, ${sum((r) => r.calls?.recorded ?? 0)} paid and recorded` : "",
    results.some((r) => r.pictures) ? `${sum((r) => r.pictures?.cached ?? 0)} generated pictures from the cache, ${sum((r) => r.pictures?.made ?? 0)} made` : "",
  ].filter(Boolean);
  if (reused.length) lines.push(`${reused.join("; ")}.`, "");
  if (meta.mode === "offline") lines.push("Offline mode renders hand-authored golden specs with no model calls: it measures the components, directions and checks, not generation quality, cost or time.", "");

  const checkpoints = results.flatMap((r) => r.checkpoints);
  const passing = checkpoints.filter((c) => c.failures.length === 0).length;
  lines.push(`## Summary`, "");
  lines.push(`- Checkpoints passing every automated check: **${passing}/${checkpoints.length}**`);
  const editChecks = checkpoints.filter((c) => c.edit);
  lines.push(`- Scripted edits: ${editChecks.filter((c) => c.edit!.check.pass === true).length} pass, ${editChecks.filter((c) => c.edit!.check.pass === false).length} fail, ${editChecks.filter((c) => c.edit!.check.pass === null).length} manual`);
  if (meta.mode !== "offline") {
    const gens = results.filter((r) => !r.error);
    const target = meta.scope === "home" ? { eur: config.targets.homepagePreviewEur, s: config.targets.homepagePreviewSeconds } : { eur: config.targets.fullSiteEur, s: config.targets.fullSiteSeconds };
    const mEur = median(gens.map((r) => r.generationEur));
    const mMs = median(gens.map((r) => r.generationMs));
    lines.push(`- Median generation cost ${eur(mEur)} (target ≤ ${eur(target.eur)}) ${mark(mEur <= target.eur)}`);
    lines.push(`- Median generation time ${sec(mMs)} (target ≤ ${target.s} s) ${mark(mMs <= target.s * 1000)}`);
    const firsts = gens.map((r) => r.firstVersionMs).filter((ms): ms is number => ms !== null);
    if (firsts.length) lines.push(`- Median time to first preview ${sec(median(firsts))} (first saved version; checks and critique continue after it)`);
    lines.push(`- Median edit cost ${eur(median(gens.map((r) => r.editsEur / Math.max(1, r.checkpoints.length - 1))))} per edit`);
  }
  const homes = results.map((r) => r.home).filter((h): h is HomepageShape => h !== null);
  if (homes.length) {
    lines.push(`- Homepages repeating the contact facts (2+ contact blocks): ${homes.filter((h) => h.contactBlocks >= 2).length}/${homes.length}`);
    if (homes.length > 1) lines.push(`- Homepage skeleton similarity across sites: ${skeletonSimilarity(homes).toFixed(2)} (0 = nothing shared, 1 = same section order)`);
  }
  const comps = results.filter((r) => r.composition);
  if (comps.length) {
    const t = config.checks.composition;
    const okM = comps.filter((r) => compositionMisses(r.composition!.mobile, t.mobile, r.photoCount > 0).length === 0).length;
    const okD = comps.filter((r) => compositionMisses(r.composition!.desktop, t.desktop, r.photoCount > 0).length === 0).length;
    lines.push(`- First screen meets the composition targets: phone ${okM}/${comps.length}, desktop ${okD}/${comps.length} (report-only; table below)`);
  }
  const judged = results.filter((r) => r.judge);
  if (judged.length) {
    const m = (xs: number[]) => median(xs).toFixed(1);
    lines.push(`- Vision judge (1–5, 3 = ordinary small-business site): phone median ${m(judged.map((r) => mean(r.judge!.phone)))}, desktop median ${m(judged.map((r) => mean(r.judge!.desktop)))} (${judged.length} sites, ${eur(judged.reduce((a, r) => a + r.judgeEur, 0))})`);
  }
  const errors = results.filter((r) => r.error);
  if (errors.length) lines.push(`- **Errors:** ${errors.map((r) => r.id).join(", ")}`);
  lines.push("");
  if (judged.length || results.some((r) => r.judgeError)) {
    lines.push(`## Vision judge`, "");
    lines.push("Scores: impression / hierarchy / imagery / spacing / clutter / distinctiveness. Review sheets for a human look: `eval/look/<site>.png`.", "");
    lines.push(`| Site | Phone | Phone note | Desktop | Desktop note | Top fix |`, `|---|---|---|---|---|---|`);
    const row = (s: NonNullable<typeof judged[number]["judge"]>["phone"]) => `**${mean(s).toFixed(1)}** (${[s.impression, s.hierarchy, s.imagery, s.spacing, s.clutter, s.distinctiveness].join("/")})`;
    const esc = (t: string) => t.replace(/\|/g, "/").replace(/\s+/g, " ");
    for (const r of results) {
      if (r.judge) lines.push(`| ${r.id} | ${row(r.judge.phone)} | ${esc(r.judge.phoneNote)} | ${row(r.judge.desktop)} | ${esc(r.judge.desktopNote)} | ${esc(r.judge.fixes[0] ?? "—")} |`);
      else if (r.judgeError) lines.push(`| ${r.id} | — | judge failed: ${esc(r.judgeError)} | — | — | — |`);
    }
    lines.push("");
  }
  if (comps.length) {
    const t = config.checks.composition;
    lines.push(`## First screen`, "");
    lines.push(
      `Measured on the rendered homepage before scrolling: photo share · first photo at (screens) · buttons · headline lines · largest empty band (px). Targets: phone photo ≥ ${Math.round(t.mobile.minImageShareWithPhotos * 100)} % (with photos), ≤ ${t.mobile.maxButtons} buttons, ≤ ${t.mobile.maxHeadlineLines} lines, band ≤ ${t.mobile.maxGapPx} px; desktop photo ≥ ${Math.round(t.desktop.minImageShareWithPhotos * 100)} %, ≤ ${t.desktop.maxButtons} buttons, ≤ ${t.desktop.maxHeadlineLines} lines, band ≤ ${t.desktop.maxGapPx} px.`,
      "",
    );
    lines.push(`| Site | Photos | Phone 360×800 | Misses | Desktop 1280×800 | Misses |`, `|---|---|---|---|---|---|`);
    for (const r of comps) {
      const m = compositionMisses(r.composition!.mobile, t.mobile, r.photoCount > 0);
      const d = compositionMisses(r.composition!.desktop, t.desktop, r.photoCount > 0);
      lines.push(`| ${r.id} | ${r.photoCount} | ${compCell(r.composition!.mobile)} | ${m.join("; ") || "✓"} | ${compCell(r.composition!.desktop)} | ${d.join("; ") || "✓"} |`);
    }
    lines.push("");
  }

  lines.push(`## Sites`, "");
  lines.push(`Lighthouse thresholds: performance ≥ ${lh.performance}, accessibility ${lh.accessibility}, best practices ≥ ${lh.bestPractices}, SEO ≥ ${lh.seo}.`, "");
  lines.push(`| Site | Type | Direction | LH P/A/BP/SEO | axe | 360 px width | Facts | Placeholders | Export offline | Gen cost | Gen time | First preview | Pass |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const r of results) {
    const g = r.checkpoints[0];
    if (!g) {
      lines.push(`| ${r.id} | ${r.type} | — | — | — | — | — | — | — | — | — | — | error |`);
      continue;
    }
    const l = g.lighthouse;
    lines.push(
      `| ${r.id} | ${r.type} | ${r.direction} | ${l ? `${l.performance}/${l.accessibility}/${l.bestPractices}/${l.seo}` : "—"} | ${g.axe} | ${g.maxScrollWidth360} | ${g.facts} | ${g.placeholders} | ${r.exportCheck ? `${mark(r.exportCheck.ok)} ${(r.exportCheck.bytes / 1e6).toFixed(1)} MB` : "—"} | ${meta.mode === "offline" ? "—" : eur(r.generationEur)} | ${meta.mode === "offline" ? "—" : sec(r.generationMs)} | ${r.firstVersionMs === null ? "—" : sec(r.firstVersionMs)} | ${mark(g.failures.length === 0)} |`,
    );
  }
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.id}`, "");
    if (r.error) {
      lines.push("```", r.error.slice(0, 2000), "```", "");
      continue;
    }
    if (r.costByStage.length) {
      lines.push(`| Stage | Calls | Input | Output | Cache read | Cache write | € | Model time |`, `|---|---|---|---|---|---|---|---|`);
      for (const c of r.costByStage) lines.push(`| ${c.stage} | ${c.calls} | ${c.input} | ${c.output} | ${c.cacheRead} | ${c.cacheWrite} | ${c.eur.toFixed(4)} | ${sec(c.ms)} |`);
      lines.push(`| **total** | | | | | | **${r.costByStage.reduce((a, c) => a + c.eur, 0).toFixed(4)}** | |`, "");
      if (Object.keys(r.timings).length) lines.push(`Stage wall times: ${Object.entries(r.timings).map(([k, v]) => `${k} ${sec(v)}`).join(", ")}.`, "");
    }
    if (r.home) {
      lines.push(`Homepage: ${r.home.sections.join(" › ")} (${r.home.contactBlocks} contact block${r.home.contactBlocks === 1 ? "" : "s"}).`, "");
    }
    const entries = (r.checkpoints[0]?.pages ?? []).filter((f) => f.includes("/"));
    if (entries.length) lines.push(`Collection entry pages checked: ${entries.length} (${entries.slice(0, 6).join(", ")}${entries.length > 6 ? ", …" : ""}).`, "");
    lines.push(`| Checkpoint | LH P/A/BP/SEO | axe | Valid | Edit check | Failures |`, `|---|---|---|---|---|---|`);
    for (const c of r.checkpoints) {
      const l = c.lighthouse;
      const edit = c.edit ? `${mark(c.edit.check.pass)} ${c.edit.check.detail}${c.edit.issues.length ? ` (rejected: ${c.edit.issues.slice(0, 2).join("; ")})` : ""}` : "";
      lines.push(`| ${c.label}${c.edit ? `: “${c.edit.message.replace(/\|/g, "/")}”` : ""} | ${l ? `${l.performance}/${l.accessibility}/${l.bestPractices}/${l.seo}` : "—"} | ${c.axe} | ${mark(c.valid)} | ${edit} | ${c.failures.map((f) => f.replace(/\|/g, "/")).join("<br>") || "—"} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Grid of mobile homepage screenshots (360×800 first viewport), labelled. */
export async function contactSheet(results: FixtureResult[]): Promise<Buffer> {
  const shots = results.filter((r) => r.mobileShot && r.mobileShot.length);
  const cols = Math.min(5, Math.max(1, shots.length));
  const rows = Math.ceil(shots.length / cols) || 1;
  const w = 360;
  const h = 800;
  const labelH = 44;
  const gap = 16;
  const W = cols * w + (cols + 1) * gap;
  const H = rows * (h + labelH) + (rows + 1) * gap;
  const composites: OverlayOptions[] = [];
  for (const [i, r] of shots.entries()) {
    const x = gap + (i % cols) * (w + gap);
    const y = gap + Math.floor(i / cols) * (h + labelH + gap);
    const img = await sharp(r.mobileShot!).resize(w, h, { fit: "cover", position: "top" }).png().toBuffer();
    composites.push({ input: img, left: x, top: y + labelH });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${labelH}"><text x="0" y="18" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#111">${r.id}</text><text x="0" y="37" font-family="Arial, sans-serif" font-size="13" fill="#555">${r.type} · ${r.direction ?? ""}</text></svg>`;
    composites.push({ input: Buffer.from(svg), left: x, top: y });
  }
  return sharp({ create: { width: W, height: H, channels: 3, background: "#e9ecf1" } }).composite(composites).png().toBuffer();
}
