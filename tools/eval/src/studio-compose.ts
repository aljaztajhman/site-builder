/**
 * pnpm studio:compose: the preset composer's pages (packages/inventory/src/composer.ts, studio-phase2-design.md P4a).
 *
 *   pnpm studio:compose --fixture <id> --stance <id> --seed <n> [--out dir] [--catalogue drafts|approved] [--shots]
 *   pnpm studio:compose --batch [--count 30] [--out dir] [--shots]
 *
 * One page writes the published site (`<out>/<slug>/index.html …`), its spec (`<slug>.spec.json`) and what it is made of
 * (`<slug>.used.json`). The batch writes the approval set: the 9 pages the design names (3 fixtures × 3 stances of
 * different families) plus pages added so that together they show as many draft presets, palettes, drawings and
 * wordmarks as possible, with `pages.json` (the list and the coverage numbers). `--shots` adds first-screen and
 * whole-page PNGs at 1280 and 360 px (`shots/<slug>-desk.png` …). No model call. Default out: eval/runs/studio-compose.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveStatic } from "@sb/engine";
import { COMPOSER_FIXTURES, approvalPlan, composeHomepageDetailed, type ComposeResult, type ComposerCatalogue } from "@sb/inventory";
import type { SiteSpec } from "@sb/spec";
import { writeSiteFiles } from "./kitchen-sink.ts";
import { shoot, specMedia } from "./okus-items.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");
export const COMPOSE_OUT = path.join(REPO_ROOT, "eval/runs/studio-compose");

/** Processes the fixture's photos for a composed spec and writes its published site into `dir`; returns the homepage path relative to it. `widths` limits the image sizes encoded. */
export async function writeComposedSite(fixtureId: string, spec: SiteSpec, dir: string, opts: { widths?: readonly number[] } = {}): Promise<string> {
  const media = await specMedia(fixtureId, spec, opts.widths);
  await writeSiteFiles(spec, media, dir, opts.widths);
  return `${spec.slug}/index.html`;
}

async function writeOne(r: ComposeResult, out: string, shots: { browser: Awaited<ReturnType<typeof chromium.launch>>; base: string; work: string } | null): Promise<void> {
  const { spec, used } = r;
  const slug = spec.slug;
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, `${slug}.used.json`), `${JSON.stringify(used, null, 2)}\n`);
  await writeFile(path.join(out, `${slug}.spec.json`), `${JSON.stringify(spec, null, 2)}\n`);
  const home = await writeComposedSite(used.fixtureId, structuredClone(spec), path.join(out, "site"));
  if (shots) {
    await writeComposedSite(used.fixtureId, structuredClone(spec), path.join(shots.work, slug));
    await mkdir(path.join(out, "shots"), { recursive: true });
    await shoot(shots.browser, slug, `${shots.base}/${slug}/${home}`, path.join(out, "shots"), null);
  }
}

async function withShots<T>(want: boolean, fn: (s: { browser: Awaited<ReturnType<typeof chromium.launch>>; base: string; work: string } | null) => Promise<T>): Promise<T> {
  if (!want) return fn(null);
  const work = await mkdtemp(path.join(tmpdir(), "sb-compose-"));
  const server = await serveStatic(work);
  const browser = await chromium.launch();
  try {
    return await fn({ browser, base: server.url, work });
  } finally {
    await browser.close();
    await server.close();
    await rm(work, { recursive: true, force: true });
  }
}

const USAGE = "Usage: studio:compose --fixture <id> --stance <id> --seed <n> [--out dir] [--catalogue drafts|approved] [--shots] | --batch [--count 30] [--out dir] [--shots]";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const out = path.resolve(val("--out") ?? COMPOSE_OUT);
  const want = args.includes("--shots");
  if (args.includes("--batch")) {
    const count = Number(val("--count") ?? 30);
    const plan = approvalPlan({ count });
    await withShots(want, async (shots) => {
      for (const [i, p] of plan.pages.entries()) {
        await writeOne(plan.results[i]!, out, shots);
        console.log(`${String(i + 1).padStart(2)} ${p.kind.padEnd(5)} ${p.fixtureId} / ${p.stance} / seed ${p.seed}`);
      }
    });
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, "pages.json"), `${JSON.stringify({ pages: plan.pages, used: plan.used, coverage: Object.fromEntries(Object.entries(plan.coverage).map(([k, v]) => [k, { covered: v.covered, total: v.total, missing: v.missing }])) }, null, 2)}\n`);
    for (const [k, v] of Object.entries(plan.coverage)) console.log(`${k.padEnd(13)} ${v.covered}/${v.total}`);
    console.log(`${plan.pages.length} pages in ${path.relative(REPO_ROOT, out)}`);
  } else {
    const fixtureId = val("--fixture");
    const stance = val("--stance");
    const seed = Number(val("--seed") ?? 1);
    const catalogue = (val("--catalogue") ?? "drafts") as ComposerCatalogue;
    if (!fixtureId || !stance || !Number.isInteger(seed) || !["drafts", "approved"].includes(catalogue) || !(COMPOSER_FIXTURES as readonly string[]).includes(fixtureId)) {
      console.error(`${USAGE}\nfixtures: ${COMPOSER_FIXTURES.join(", ")}`);
      process.exit(1);
    }
    const r = composeHomepageDetailed({ fixtureId, stance, seed, catalogue });
    await withShots(want, (shots) => writeOne(r, out, shots));
    console.log(`${r.spec.slug}: ${r.used.presets.length} sections (${r.used.presets.map((p) => p.replace("composition/", "")).join(", ")}); ${r.used.palette}, ${r.used.pairing}${r.used.drawing ? `, ${r.used.drawing}` : ""}${r.used.wordmark ? `, ${r.used.wordmark}` : ""}`);
    console.log(`written to ${path.relative(REPO_ROOT, out)}/site/${r.spec.slug}/index.html`);
  }
}
