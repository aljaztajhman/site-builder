/**
 * pnpm details-pages [--out <dir>] [--only <id,..>] [--fresh-dir <dir>] [--concurrency 2]
 *
 * M1 type and details (PR #221), the per-page on/off renders: every fresh10 page rendered twice with today's renderer.
 * Arm `off` is today's output (no type voice, no detail switches). Arm `on` has the page's type voice (assignVoices over the
 * whole set, applyDetails) and every detail switch (PROOF_DETAILS), and NO first-screen structure preset (structure-proof
 * assigns Wave P structures; this does not). Both arms are captured by the same checkSite call, so they differ only by the
 * switches. Free: no model, picture or reviewer call.
 *
 * Output, so `pnpm outside-review --run-dir <out>/off` and `--run-dir <out>/on` read it:
 *   <out>/<arm>/<id>/{home-360-first,home-360,home-1280-first,home-1280}.png and spec.json,
 *   <out>/<arm>/manifest.json (what `pnpm details-sheet --before <out>/off --after <out>/on` reads),
 *   <out>/sheets/pairs-{desk,phone}-N.jpg (the side-by-side sheets), <out>/assign.json.
 * Needs the saved bases: pnpm studio:poc --fresh --bases-only (the default --fresh-dir is eval/runs/studio-poc).
 *
 * The pure parts (planArms, shotPaths, manifestOf) are tested in tools/eval/test/details-pages.test.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig, repoRoot } from "@sb/config";
import { checkSite, launchCheckBrowser } from "@sb/engine";
import { siteFiles } from "@sb/render";
import type { SiteSpec, VoiceId } from "@sb/spec";
import { pairRows, writePairSheets, type RunRow } from "./details-sheet.ts";
import type { SheetKind } from "./set-review.ts";
import { PROOF_DETAILS, applyDetails, assignVoices, loadFresh10, proofPageOf, type SourcePage } from "./structure-proof.ts";

// ---------------------------------------------------------------------------------------------------------------
// The pure parts

export const ARMS = ["off", "on"] as const;
export type Arm = (typeof ARMS)[number];

export interface ArmPlan {
  id: string;
  voice: VoiceId;
  /** Today's spec, untouched. */
  off: SiteSpec;
  /** The voice's type on a copy; nothing else (no structure, no chrome). */
  on: SiteSpec;
}

/** Both arms' specs for each page; the voices are assigned over the whole set, so `only` renders what a full run would. */
export function planArms(pages: readonly Pick<SourcePage, "id" | "business" | "trade" | "spec">[], only?: readonly string[]): ArmPlan[] {
  const proof = pages.map((p) => proofPageOf(p.id, p.spec, { business: p.business, trade: p.trade }));
  const voices = assignVoices(proof);
  return pages
    .filter((p) => !only?.length || only.includes(p.id))
    .map((p) => ({ id: p.id, voice: voices.get(p.id)!, off: p.spec, on: applyDetails(p.spec, voices.get(p.id)!) }));
}

/** The file names `pnpm outside-review --run-dir` expects in a page directory (loadRunDirItems), by the checkSite screenshot key. */
export const RUN_DIR_FILES = { mobile: "home-360-first.png", mobileFull: "home-360.png", desktopFirst: "home-1280-first.png", desktop: "home-1280.png" } as const;

/** Where a page's screenshots go: <out>/<arm>/<id>/home-*.png. */
export function shotPaths(out: string, arm: Arm, id: string): Record<keyof typeof RUN_DIR_FILES, string> {
  const dir = path.join(out, arm, id);
  return {
    mobile: path.join(dir, RUN_DIR_FILES.mobile),
    mobileFull: path.join(dir, RUN_DIR_FILES.mobileFull),
    desktopFirst: path.join(dir, RUN_DIR_FILES.desktopFirst),
    desktop: path.join(dir, RUN_DIR_FILES.desktop),
  };
}

/** An arm's manifest.json (details-sheet's input), paths relative to the manifest. */
export function manifestOf(plans: readonly ArmPlan[], arm: Arm): { id: string; spec: string; desk: string; phone: string; voice?: string }[] {
  return plans.map((p) => ({
    id: p.id,
    spec: `${p.id}/spec.json`,
    desk: `${p.id}/${RUN_DIR_FILES.desktopFirst}`,
    phone: `${p.id}/${RUN_DIR_FILES.mobile}`,
    ...(arm === "on" ? { voice: p.voice } : {}),
  }));
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

const USAGE = "Usage: pnpm details-pages [--out <dir>] [--only <id,..>] [--fresh-dir <dir>] [--concurrency 2]";

export async function main(argv: string[], print: (line: string) => void = console.log): Promise<number> {
  let v;
  try {
    v = parseArgs({ args: argv, options: { out: { type: "string" }, only: { type: "string" }, "fresh-dir": { type: "string" }, concurrency: { type: "string" } } }).values;
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  const concurrency = v.concurrency === undefined ? 2 : Number(v.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    print(`--concurrency needs a whole number above 0, got "${v.concurrency}".\n${USAGE}`);
    return 2;
  }
  const out = path.resolve(v.out ?? path.join(repoRoot, "eval/runs/details-pages"));
  const only = v.only?.split(",").map((s) => s.trim()).filter(Boolean);
  const config = loadConfig();
  const browser = await launchCheckBrowser();
  try {
    const sources = await loadFresh10(config, browser, path.resolve(v["fresh-dir"] ?? path.join(repoRoot, "eval/runs/studio-poc")), print);
    const unknown = (only ?? []).filter((id) => !sources.some((s) => s.id === id));
    if (unknown.length) {
      print(`Unknown page id: ${unknown.join(", ")}`);
      return 2;
    }
    const plans = planArms(sources, only);
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "assign.json"), `${JSON.stringify(Object.fromEntries(plans.map((p) => [p.id, { voice: p.voice }])), null, 2)}\n`);

    const t0 = Date.now();
    const failed: string[] = [];
    const jobs = plans.flatMap((p) => ARMS.map((arm) => ({ p, arm })));
    await Promise.all(
      Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
        for (let job = jobs.shift(); job !== undefined; job = jobs.shift()) {
          const { p, arm } = job;
          try {
            const spec = p[arm];
            const media = await sources.find((s) => s.id === p.id)!.media();
            // RenderOptions.details comes from a variable, so the object literal's extra-key check does not apply.
            const renderOpts = { imageWidths: config.images.widths, ...(arm === "on" ? { details: PROOF_DETAILS } : {}) };
            const files = siteFiles(spec, media, renderOpts);
            const report = await checkSite(spec, files, { config, corpus: "", lighthouse: false, browser, pages: ["index.html"] });
            const shots = shotPaths(out, arm, p.id);
            mkdirSync(path.dirname(shots.mobile), { recursive: true });
            for (const k of Object.keys(shots) as (keyof typeof shots)[]) {
              const shot = report.screenshots[k];
              if (!shot.length) throw new Error(`no ${k} screenshot (the homepage did not render)`);
              writeFileSync(shots[k], shot);
            }
            writeFileSync(path.join(out, arm, p.id, "spec.json"), `${JSON.stringify(spec, null, 2)}\n`);
            print(`${p.id} ${arm}${arm === "on" ? ` ${p.voice}` : ""}`);
          } catch (e) {
            failed.push(`${p.id}/${arm}`);
            print(`${p.id} ${arm}: FAILED ${(e as Error).message}`);
          }
        }
      }),
    );

    const ok = plans.filter((p) => !failed.some((f) => f.startsWith(`${p.id}/`)));
    for (const arm of ARMS) writeFileSync(path.join(out, arm, "manifest.json"), `${JSON.stringify(manifestOf(ok, arm), null, 2)}\n`);
    const rows = (arm: Arm): RunRow[] => ok.map((p) => ({ id: p.id, desk: shotPaths(out, arm, p.id).desktopFirst, phone: shotPaths(out, arm, p.id).mobile, ...(arm === "on" ? { voice: p.voice } : {}) }));
    const { pairs } = pairRows(rows("off"), rows("on"));
    const sheets: string[] = [];
    if (pairs.length) {
      const dir = path.join(out, "sheets");
      mkdirSync(dir, { recursive: true });
      for (const k of ["desk", "phone"] as SheetKind[]) sheets.push(...(await writePairSheets(pairs, k, dir)));
    }
    print(`${ok.length} of ${plans.length} pages x 2 arms -> ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s. No model call.`);
    for (const f of sheets) print(`sheet: ${f}`);
    print(`score: pnpm outside-review --run-dir ${path.join(out, "off")} --dry-run   (and ${path.join(out, "on")})`);
    return failed.length ? 1 : 0;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
