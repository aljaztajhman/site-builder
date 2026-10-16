/**
 * pnpm structure-proof --set review50|fresh10 [--out <dir>] [--assign <json>] [--only <id,..>] [--concurrency 2] [--fresh-dir <dir>]
 *
 * Design 5 Wave P (docs/plans/wave-p-harness.md): the proof that the eight first-screen structures, each with its own
 * chrome (header family, header tone, phone action), make a set of sites look like different sites. Free: no model, no
 * picture and no reviewer call. Each page of a proof set (Review 50's 50 pages, the fresh 10) gets a hand-assigned
 * structure (`composition/hero/<structure>-1`, filled from the page's own hero copy) and its own chrome, is rendered
 * with the engine's checkSite, and the run writes what `pnpm variety` and `pnpm outside-review --set` read.
 *
 * The pure parts (structureFits, assignStructures, assignChrome, chromeKey, proofPageOf, applyStructure) are tested in
 * tools/eval/test/structure-proof.test.ts; the CLI at the bottom does the rendering.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { loadConfig, repoRoot, type AppConfig } from "@sb/config";
import { checkSite, launchCheckBrowser, repairStudioPage, studioPageIssues, type CheckBrowser } from "@sb/engine";
import { compositionPreset } from "@sb/inventory";
import { createFsStorage } from "@sb/platform";
import { siteFiles } from "@sb/render";
import {
  HEADER_FAMILIES,
  PHONE_ACTIONS,
  STRUCTURES,
  fillPreset,
  migrateSpec,
  presetSection,
  presetSources,
  skeletonOfChrome,
  validateSite,
  type HeaderFamily,
  type PhoneActions,
  type SiteSpec,
  type Structure,
  type Tone,
} from "@sb/spec";
import { DEFAULT_SPECS_DIR, plannedSpecs, pageIds, rebuildMedia, shotFileNames, type MediaCache } from "./review50-render.ts";
import { planSheet, type SheetKind } from "./set-review.ts";
import { knownFixtures, replayedFixture } from "./studio-fixtures.ts";

// ---------------------------------------------------------------------------------------------------------------
// The pure parts

export interface ProofPage {
  id: string;
  business: string;
  trade: string;
  town: string;
  /** Pictures the client gave (asset `origin` absent or "client"). */
  clientPhotos: number;
  /** Generated pictures (`origin: "generated"`). */
  aiPictures: number;
}

/** The structures that are built on a photograph. */
export const PHOTO_LED: readonly Structure[] = ["band", "mosaic", "split", "magazine"];
const PHOTOS_NEEDED: Partial<Record<Structure, number>> = { band: 1, split: 1, magazine: 1, mosaic: 3 };

/** The pictures a photo-led structure may use (owner D2: AI pictures count only for a business with no client photo). */
const photosOf = (p: ProofPage) => (p.clientPhotos > 0 ? p.clientPhotos : p.aiPictures);

/** Whether the page has the photos the structure needs; poster, field, ledger and strata fit any business. */
export function structureFits(s: Structure, p: ProofPage): boolean {
  return photosOf(p) >= (PHOTOS_NEEDED[s] ?? 0);
}

/** A trade with at most this many pages gets a different structure on each. */
const TRADE_SPREAD_MAX = 8;

/**
 * A structure for each page. Deterministic. Per structure at most floor(0.25 · n) pages. Hard: what fits; the pages of
 * a business differ; the pages of a trade differ when the trade has few pages. Soft: pages of a town differ. The most
 * constrained pages (fewest fitting structures) go first and take the least-used structure that breaks no hard rule,
 * ties broken by STRUCTURES rotated per page index. When no structure satisfies every hard rule, the trade rule, then
 * the business rule, then the cap give way, in that order (what fits never does).
 */
export function assignStructures(pages: readonly ProofPage[], o: { overrides?: Readonly<Record<string, Structure>> } = {}): Map<string, Structure> {
  const out = new Map<string, Structure>();
  const cap = Math.max(1, Math.floor(0.25 * pages.length));
  const used = new Map<Structure, number>();
  const bump = (s: Structure) => used.set(s, (used.get(s) ?? 0) + 1);
  const by = (key: (p: ProofPage) => string) => {
    const m = new Map<string, ProofPage[]>();
    for (const p of pages) m.set(key(p), [...(m.get(key(p)) ?? []), p]);
    return m;
  };
  const businesses = by((p) => p.business);
  const trades = by((p) => p.trade);
  const towns = by((p) => p.town);

  for (const p of pages) {
    const forced = o.overrides?.[p.id];
    if (forced) {
      out.set(p.id, forced);
      bump(forced);
    }
  }
  const taken = (group: ProofPage[] | undefined, p: ProofPage) => new Set((group ?? []).filter((q) => q.id !== p.id).flatMap((q) => (out.has(q.id) ? [out.get(q.id)!] : [])));

  const order = pages
    .map((p, i) => ({ p, i, fits: STRUCTURES.filter((s) => structureFits(s, p)).length }))
    .filter((x) => !out.has(x.p.id))
    .sort((a, b) => a.fits - b.fits || a.i - b.i);
  for (const { p, i } of order) {
    const sameBusiness = taken(businesses.get(p.business), p);
    const tradePages = trades.get(p.trade);
    const sameTrade = tradePages && tradePages.length <= TRADE_SPREAD_MAX ? taken(tradePages, p) : new Set<Structure>();
    const sameTown = p.town ? taken(towns.get(p.town), p) : new Set<Structure>();
    const fitting = STRUCTURES.filter((s) => structureFits(s, p));
    const rotation = (s: Structure) => (STRUCTURES.indexOf(s) - i + STRUCTURES.length * 4) % STRUCTURES.length;
    const rules: ((s: Structure) => boolean)[][] = [
      [(s) => (used.get(s) ?? 0) < cap, (s) => !sameBusiness.has(s), (s) => !sameTrade.has(s)],
      [(s) => (used.get(s) ?? 0) < cap, (s) => !sameBusiness.has(s)],
      [(s) => (used.get(s) ?? 0) < cap],
      [],
    ];
    let candidates: Structure[] = [];
    for (const level of rules) {
      candidates = fitting.filter((s) => level.every((r) => r(s)));
      if (candidates.length) break;
    }
    const score = (s: Structure) => (used.get(s) ?? 0) + (sameTown.has(s) ? 0.5 : 0);
    const best = [...candidates].sort((a, b) => score(a) - score(b) || rotation(a) - rotation(b))[0]!;
    out.set(p.id, best);
    bump(best);
  }
  return new Map(pages.map((p) => [p.id, out.get(p.id)!]));
}

export interface ProofChrome {
  header: HeaderFamily;
  tone: Tone;
  actions: PhoneActions;
}

/** `header|tone|actions`: what makes one page's chrome differ from another's. */
export const chromeKey = (c: ProofChrome): string => `${c.header}|${c.tone}|${c.actions}`;

const CHROME_HEADERS = HEADER_FAMILIES.filter((h) => h !== "overlay"); // overlay needs a signature photo hero
const CHROME_TONES: readonly Tone[] = ["default", "alt", "inverse", "band"];

/**
 * Every page its own chrome. The three axes are walked together with coprime lengths (7 headers, 3 actions, 4 tones), so
 * neighbours in list order differ on all three and the first 84 pages are all distinct (more repeat).
 */
export function assignChrome(pages: readonly ProofPage[]): Map<string, ProofChrome> {
  return new Map(
    pages.map((p, k) => [
      p.id,
      { header: CHROME_HEADERS[k % CHROME_HEADERS.length]!, tone: CHROME_TONES[k % CHROME_TONES.length]!, actions: PHONE_ACTIONS[k % PHONE_ACTIONS.length]! },
    ]),
  );
}

/** A page's facts from its spec. */
export function proofPageOf(id: string, spec: SiteSpec, o: { business: string; trade: string }): ProofPage {
  const generated = spec.assets.images.filter((i) => i.origin === "generated").length;
  const address = spec.business.address;
  return {
    id,
    business: o.business,
    trade: o.trade,
    town: address && "city" in address && address.city ? address.city : "",
    clientPhotos: spec.assets.images.length - generated,
    aiPictures: generated,
  };
}

export interface AppliedStructure {
  ok: boolean;
  spec: SiteSpec;
  issues: string[];
  log: string[];
}

/** The first section's own words: its headline and its intro (a page header's title). */
function heroCopy(spec: SiteSpec): { headline?: string; lead?: string } {
  const home = spec.pages.find((p) => p.kind === "home") ?? spec.pages[0];
  const props = (home?.sections[0]?.props ?? {}) as { headline?: unknown; title?: unknown; intro?: unknown };
  const headline = [props.headline, props.title].find((v): v is string => typeof v === "string" && v.trim() !== "");
  return { ...(headline ? { headline } : {}), ...(typeof props.intro === "string" && props.intro.trim() ? { lead: props.intro } : {}) };
}

/**
 * The homepage's first section replaced by `composition/hero/<s>-1` filled from the page's own hero copy, with the
 * chrome set. Works on a copy. A business with no client photo fills from its generated pictures as if they were
 * photos (owner D2); the spec's assets keep `origin: "generated"`, so the AI label still renders. `ok: false` when the
 * preset is missing, the fill fails or the result does not validate; the reason is in `issues`.
 */
export function applyStructure(input: SiteSpec, s: Structure, chrome: ProofChrome): AppliedStructure {
  const spec = structuredClone(input);
  const fail = (...issues: string[]): AppliedStructure => ({ ok: false, spec: input, issues, log: [] });
  const preset = compositionPreset(`composition/hero/${s}-1`);
  if (!preset) return fail(`no preset composition/hero/${s}-1`);
  const home = spec.pages.find((p) => p.kind === "home");
  const old = home?.sections[0];
  if (!home || !old) return fail("the page has no homepage section to replace");

  const base = presetSources(spec, undefined, heroCopy(spec));
  const hasClientPhoto = spec.assets.images.some((i) => (i.origin ?? "client") === "client");
  const sources = hasClientPhoto ? base : { ...base, images: spec.assets.images.map((i) => ({ id: i.id, origin: "client" as const })) };
  const filled = fillPreset(preset, sources);
  if (!filled.ok) return fail(`fill ${filled.reason}: ${[...filled.missing, ...filled.issues].join("; ") || "nothing missing named"}`);

  home.sections[0] = { ...presetSection(preset, filled.props, old.id) } as unknown as typeof old;
  spec.design.skeleton = { ...(spec.design.skeleton ?? skeletonOfChrome(spec.chrome)), header: chrome.header, actions: chrome.actions };
  spec.chrome.header.tone = chrome.tone;

  const log = repairStudioPage(spec);
  const issues = studioPageIssues(spec).map((i) => `${i.rule}: ${i.line}`);
  const valid = validateSite(spec);
  if (!valid.ok) return { ok: false, spec: input, issues: [`invalid: ${valid.issues.slice(0, 4).map((i) => `${i.path} ${i.message}`).join("; ")}`, ...issues], log };
  return { ok: true, spec, issues, log };
}

// ---------------------------------------------------------------------------------------------------------------
// The proof sets

export type ProofSet = "review50" | "fresh10";

interface SourcePage {
  id: string;
  business: string;
  trade: string;
  spec: SiteSpec;
  /** The media files of the spec, rebuilt on demand (the pictures are not kept in memory between pages). */
  media: () => Promise<Map<string, Uint8Array>>;
}

const EVAL_DIR = path.join(repoRoot, "tools/eval");

/** The trade from the eval fixture's brief by business id, else the slug's first word. */
export function tradeOf(business: string, evalDir = EVAL_DIR): string {
  for (const g of ["fixtures", "twins", "hard", "fresh"]) {
    const file = path.join(evalDir, g, business, "brief.json");
    if (!existsSync(file)) continue;
    const b = JSON.parse(readFileSync(file, "utf8")) as { trade?: string; businessType?: string };
    const trade = b.trade ?? b.businessType;
    if (trade) return trade;
  }
  return business.split("-")[0]!;
}

async function loadReview50(config: AppConfig): Promise<SourcePage[]> {
  const pages: SourcePage[] = [];
  for (const business of pageIds(DEFAULT_SPECS_DIR)) {
    const storage = createFsStorage(path.join(DEFAULT_SPECS_DIR, business, "storage"));
    const cache: MediaCache = new Map();
    for (const { specFile, prefix } of plannedSpecs(DEFAULT_SPECS_DIR, business)) {
      const id = `${business}-${prefix === "home" ? "gen" : "regen"}`;
      const spec = migrateSpec(JSON.parse(readFileSync(specFile, "utf8"))) as SiteSpec;
      pages.push({ id, business, trade: tradeOf(business), spec, media: () => rebuildMedia(spec, storage, config, cache) });
    }
  }
  return pages;
}

async function loadFresh10(config: AppConfig, browser: CheckBrowser, freshDir: string, print: (l: string) => void): Promise<SourcePage[]> {
  const pages: SourcePage[] = [];
  for (const id of knownFixtures().fresh) {
    const fx = await replayedFixture(id, "fresh", config, browser, false);
    // The saved base (pnpm studio:poc --fresh --bases-only) when it is the same site as the replay; else the replay's.
    const saved = path.join(freshDir, `${id}.today.spec.json`);
    let spec = fx.spec;
    if (existsSync(saved)) {
      const s = migrateSpec(JSON.parse(readFileSync(saved, "utf8"))) as SiteSpec;
      const sig = (x: SiteSpec) => x.assets.images.map((i) => `${i.id}:${i.src}`).join(",");
      if (sig(s) === sig(fx.spec)) spec = s;
      else print(`${id}: the saved base in ${freshDir} has other pictures than the replay; using the replay`);
    }
    pages.push({ id, business: id, trade: tradeOf(id), spec, media: () => fx.media(spec, new Map()) });
  }
  return pages;
}

// ---------------------------------------------------------------------------------------------------------------
// Contact sheets (first screens, with the structure and the chrome key under each tile)

async function writeSheets(rows: { id: string; structure: string; chrome: string; desk: string; phone: string }[], kind: SheetKind, dir: string): Promise<string[]> {
  const plan = planSheet(rows.length, kind, 2_150_000);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fit = (t: string, w: number, size: number) => {
    const max = Math.max(6, Math.floor(w / (size * 0.58)));
    return esc(t.length > max ? `${t.slice(0, max - 1)}…` : t);
  };
  const label = (r: (typeof rows)[number], w: number, h: number) => {
    const size = Math.max(9, Math.round((h / 2) * 0.62));
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>` +
        `<text x="3" y="${Math.round(h * 0.4)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="bold" fill="#111">${fit(r.id, w, size)}</text>` +
        `<text x="3" y="${Math.round(h * 0.86)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="#333">${fit(`${r.structure} · ${r.chrome}`, w, size)}</text></svg>`,
    );
  };
  const gap = 8;
  const labelH = plan.labelH * 2;
  const rowH = plan.tileH + labelH + gap;
  const files: string[] = [];
  for (const [si, indexes] of plan.sheets.entries()) {
    const height = Math.ceil(indexes.length / plan.cols) * rowH + gap;
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [k, i] of indexes.entries()) {
      const r = rows[i]!;
      const left = gap + (k % plan.cols) * (plan.tileW + gap);
      const top = gap + Math.floor(k / plan.cols) * rowH;
      const tile = await sharp(readFileSync(kind === "desk" ? r.desk : r.phone)).removeAlpha().resize(plan.tileW, plan.tileH, { fit: "cover", position: "top" }).toBuffer();
      layers.push({ input: tile, left, top }, { input: label(r, plan.tileW, labelH), left, top: top + plan.tileH });
    }
    const jpeg = await sharp({ create: { width: plan.width, height, channels: 3, background: "#e4e4e4" } }).composite(layers).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (plan.width * height > 2_500_000) throw new Error(`sheet ${kind} ${si + 1} is ${plan.width * height} pixels, over 2.5 MP`);
    const file = path.join(dir, `sheet-${kind}${si === 0 ? "" : `-${si + 1}`}.jpg`);
    writeFileSync(file, jpeg);
    files.push(file);
  }
  return files;
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

const USAGE = "Usage: pnpm structure-proof --set review50|fresh10 [--out <dir>] [--assign <json>] [--only <id,..>] [--concurrency 2] [--fresh-dir <dir>]";

interface Assignment {
  structure: Structure;
  header: HeaderFamily;
  tone: Tone;
  actions: PhoneActions;
}

export async function main(argv: string[], print: (line: string) => void = console.log): Promise<number> {
  let v;
  try {
    v = parseArgs({ args: argv, options: { set: { type: "string" }, out: { type: "string" }, assign: { type: "string" }, only: { type: "string" }, concurrency: { type: "string" }, "fresh-dir": { type: "string" } } }).values;
  } catch (e) {
    print(`${e instanceof Error ? e.message : String(e)}\n${USAGE}`);
    return 2;
  }
  if (v.set !== "review50" && v.set !== "fresh10") {
    print(`--set needs review50 or fresh10.\n${USAGE}`);
    return 2;
  }
  const set: ProofSet = v.set;
  const concurrency = v.concurrency === undefined ? 2 : Number(v.concurrency);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    print(`--concurrency needs a whole number above 0, got "${v.concurrency}".\n${USAGE}`);
    return 2;
  }
  const out = path.resolve(v.out ?? path.join(repoRoot, "eval/runs/structure-proof", set));
  const only = v.only?.split(",").map((s) => s.trim()).filter(Boolean);
  let given: Record<string, Partial<Assignment>> = {};
  if (v.assign) {
    try {
      given = JSON.parse(readFileSync(path.resolve(v.assign), "utf8")) as typeof given;
    } catch (e) {
      print(`--assign: ${(e as Error).message}\n${USAGE}`);
      return 2;
    }
  }

  const config = loadConfig();
  const browser = await launchCheckBrowser();
  try {
    const sources = set === "review50" ? await loadReview50(config) : await loadFresh10(config, browser, path.resolve(v["fresh-dir"] ?? path.join(repoRoot, "eval/runs/studio-poc")), print);
    const unknown = (only ?? []).filter((id) => !sources.some((s) => s.id === id));
    if (unknown.length) {
      print(`Unknown page id: ${unknown.join(", ")}`);
      return 2;
    }
    const proofPages = sources.map((s) => proofPageOf(s.id, s.spec, { business: s.business, trade: s.trade }));
    // The assignment covers the whole set, so --only renders the same pages the full run would.
    const overrides = Object.fromEntries(Object.entries(given).flatMap(([id, a]) => (a.structure ? [[id, a.structure] as const] : [])));
    const structures = assignStructures(proofPages, { overrides });
    const generated = assignChrome(proofPages);
    const chromes = new Map<string, ProofChrome>();
    for (const [id, c] of generated) {
      const g = given[id] ?? {};
      chromes.set(id, { header: g.header ?? c.header, tone: g.tone ?? c.tone, actions: g.actions ?? c.actions });
    }

    const cap = Math.max(1, Math.floor(0.25 * proofPages.length));
    const useCount = (s: Structure) => [...structures.values()].filter((x) => x === s).length;
    const issues: Record<string, { fallbacks: string[]; pageRules: string[]; log: string[] }> = {};
    const built = new Map<string, SiteSpec>();
    const failed: string[] = [];
    const wanted = sources.filter((s) => !only?.length || only.includes(s.id));
    for (const src of wanted) {
      const page = proofPages.find((p) => p.id === src.id)!;
      const entry: (typeof issues)[string] = (issues[src.id] = { fallbacks: [], pageRules: [], log: [] });
      const tried = new Set<Structure>();
      let s = structures.get(src.id)!;
      for (;;) {
        tried.add(s);
        const r = applyStructure(src.spec, s, chromes.get(src.id)!);
        if (r.ok) {
          structures.set(src.id, s);
          built.set(src.id, r.spec);
          entry.pageRules = r.issues;
          entry.log = r.log;
          break;
        }
        entry.fallbacks.push(`${s}: ${r.issues.join(" | ")}`);
        const rotation = (x: Structure) => (STRUCTURES.indexOf(x) - STRUCTURES.indexOf(s) + STRUCTURES.length) % STRUCTURES.length;
        const next = STRUCTURES.filter((x) => !tried.has(x) && structureFits(x, page) && useCount(x) < cap).sort((a, b) => useCount(a) - useCount(b) || rotation(a) - rotation(b))[0];
        if (!next) {
          failed.push(src.id);
          print(`${src.id}: FAILED, no structure fits and fills (${entry.fallbacks.join(" || ")})`);
          break;
        }
        structures.set(src.id, next);
        s = next;
      }
    }

    mkdirSync(out, { recursive: true });
    const assignment: Record<string, Assignment> = {};
    for (const src of wanted) if (built.has(src.id)) assignment[src.id] = { structure: structures.get(src.id)!, ...chromes.get(src.id)! };
    writeFileSync(path.join(out, "assign.json"), `${JSON.stringify(assignment, null, 2)}\n`);

    const t0 = Date.now();
    const queue = wanted.filter((s) => built.has(s.id));
    const trade = new Map(sources.map((s) => [s.id, s.trade]));
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (let src = queue.shift(); src !== undefined; src = queue.shift()) {
          const spec = built.get(src.id)!;
          try {
            const media = await src.media();
            const files = siteFiles(spec, media, { imageWidths: config.images.widths });
            const report = await checkSite(spec, files, { config, corpus: "", lighthouse: false, browser, pages: ["index.html"] });
            const names = shotFileNames(src.id);
            for (const k of Object.keys(names) as (keyof typeof names)[]) {
              const shot = report.screenshots[k];
              if (!shot.length) throw new Error(`no ${k} screenshot (the homepage did not render)`);
              writeFileSync(path.join(out, names[k]), shot);
            }
            writeFileSync(path.join(out, `${src.id}.spec.json`), `${JSON.stringify(spec, null, 2)}\n`);
            print(`${src.id}: ${structures.get(src.id)} ${chromeKey(chromes.get(src.id)!)}${issues[src.id]!.pageRules.length ? `, ${issues[src.id]!.pageRules.length} page-rule issue(s)` : ""}`);
          } catch (e) {
            failed.push(src.id);
            print(`${src.id}: FAILED ${(e as Error).message}`);
          }
        }
      }),
    );

    const done = wanted.filter((s) => built.has(s.id) && !failed.includes(s.id));
    const manifest = done.map((s) => ({
      id: s.id,
      spec: `${s.id}.spec.json`,
      desk: `${s.id}-1280-first.png`,
      phone: `${s.id}-360-first.png`,
      trade: trade.get(s.id)!,
      structure: structures.get(s.id)!,
    }));
    writeFileSync(path.join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    // `pnpm outside-review --set` reads only {id, desk, phone}.
    writeFileSync(path.join(out, "review-manifest.json"), `${JSON.stringify(manifest.map(({ id, desk, phone }) => ({ id, desk, phone })), null, 2)}\n`);
    writeFileSync(path.join(out, "issues.json"), `${JSON.stringify(issues, null, 2)}\n`);
    const rows = done.map((s) => ({ id: s.id, structure: structures.get(s.id)!, chrome: chromeKey(chromes.get(s.id)!), desk: path.join(out, `${s.id}-1280-first.png`), phone: path.join(out, `${s.id}-360-first.png`) }));
    const sheets = rows.length ? [...(await writeSheets(rows, "desk", out)), ...(await writeSheets(rows, "phone", out))] : [];

    const counts = Object.fromEntries(STRUCTURES.map((s) => [s, done.filter((d) => structures.get(d.id) === s).length]));
    const keys = new Set(done.map((d) => chromeKey(chromes.get(d.id)!)));
    const fallbacks = done.filter((d) => issues[d.id]!.fallbacks.length).length;
    const ruleIssues = done.reduce((n, d) => n + issues[d.id]!.pageRules.length, 0);
    print(`${done.length} of ${wanted.length} pages -> ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s. No model call.`);
    print(`structures: ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    print(`distinct chrome keys: ${keys.size} of ${done.length}; fill fallbacks: ${fallbacks}; page-rule issues: ${ruleIssues} on ${done.filter((d) => issues[d.id]!.pageRules.length).length} pages`);
    for (const f of sheets) print(`sheet: ${f}`);
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
