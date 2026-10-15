/**
 * The whole-set round of the outside reviewers (owner's request 2026-10-15: the pages look the same). Instead of one
 * page at a time, each reviewer (config `outsideReview`) sees ALL the first screens of a set at once, as two contact
 * sheets (desktop 1280 px, phone 360 px), and judges the set: overall quality, variety, what repeats, the best and the
 * weakest pages, the one change that would lift the set most. One call per reviewer per set, through the per-page
 * round's own transports (OpenRouter, Anthropic batches, recordings), pricing and --max-eur stop (outside-review.ts).
 * Eval only; nothing here touches generation or the live app.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { AppConfig } from "@sb/config";
import { toModelJsonSchema } from "@sb/spec";
import { callCost, estimateCall, type CallEstimate, type CostLine, type Reviewer } from "./outside-review.ts";
import { ReviewHttpError, type ChatBody, type ChatMessage, type ChatPart, type ChatResult, type OutsideTransport } from "./outside-transport.ts";

// ---------------------------------------------------------------------------------------------------------------
// Pages of a set

/** One page of a set: its id and its two first screens (1280 px and 360 px wide). */
export interface SetPage {
  id: string;
  desk: string;
  phone: string;
}

const IMG = "(?:png|jpe?g|webp)";
const DESK_RE = new RegExp(`^(.+)-(?:1280-first|desk)\\.${IMG}$`, "i");
const PHONE_RE = new RegExp(`^(.+)-(?:360-first|phone)\\.${IMG}$`, "i");

/**
 * A directory's pages: `<id>-1280-first.png` + `<id>-360-first.png` or the studio-poc names `<id>-desk.png` +
 * `<id>-phone.png` in the directory itself, and `home-1280-first.png` + `home-360-first.png` in each subdirectory
 * (an eval run: the page is named after the subdirectory). `<id>-today` pages (studio-poc keeps today's site beside
 * the studio's) are left out, as they are a set of their own; `today: true` reads only those, under the id without
 * the suffix (a source written `today:<dir>`).
 */
export function scanSetDir(dir: string, o: { today?: boolean } = {}): SetPage[] {
  const found = new Map<string, Partial<SetPage>>();
  const add = (id: string, key: "desk" | "phone", file: string) => {
    const isToday = id.endsWith("-today");
    if (isToday !== !!o.today) return;
    const key2 = isToday ? id.slice(0, -"-today".length) : id;
    if (found.get(key2)?.[key]) throw new Error(`${dir}: page ${key2} appears twice (${found.get(key2)![key]}, ${file})`);
    found.set(key2, { ...found.get(key2), id: key2, [key]: file });
  };
  // In an eval run's subdirectory only the homepage and its regeneration are pages; `another-look-*` and other
  // screenshots there are not (they would land in the set under a shared id).
  const subId = (sub: string, prefix: string): string | null => (prefix === "home" ? sub : prefix === "regenerated" ? `${sub}-regenerated` : null);
  const scan = (d: string, subdir: string | null) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = DESK_RE.exec(e.name) ?? PHONE_RE.exec(e.name);
      if (!m) continue;
      const id = subdir ? subId(subdir, m[1]!) : m[1]!;
      if (id) add(id, DESK_RE.test(e.name) ? "desk" : "phone", path.join(d, e.name));
    }
  };
  scan(dir, null);
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) scan(path.join(dir, e.name), e.name);
  const incomplete = [...found.values()].filter((p) => !p.desk || !p.phone);
  if (incomplete.length) throw new Error(`${dir}: ${incomplete.map((p) => `${p.id} has no ${p.desk ? "phone" : "desktop"} screenshot`).join("; ")}`);
  return [...found.values()].map((p) => p as SetPage).sort((a, b) => a.id.localeCompare(b.id));
}

const ManifestEntry = z.strictObject({ id: z.string().min(1), desk: z.string().min(1), phone: z.string().min(1) });
const Manifest = z.union([z.array(ManifestEntry), z.strictObject({ pages: z.array(ManifestEntry) })]);

/** A manifest JSON: `[{id, desk, phone}, …]` (or `{pages: [...]}`), paths relative to the manifest. */
export function readManifest(file: string): SetPage[] {
  const parsed = Manifest.parse(JSON.parse(readFileSync(file, "utf8")));
  const entries = Array.isArray(parsed) ? parsed : parsed.pages;
  return entries.map((e) => {
    const desk = path.resolve(path.dirname(file), e.desk);
    const phone = path.resolve(path.dirname(file), e.phone);
    for (const f of [desk, phone]) if (!existsSync(f)) throw new Error(`${file}: ${e.id}: ${f} not found`);
    return { id: e.id, desk, phone };
  });
}

/** What `--set <name>=<source>` names: a source is a directory, a manifest JSON, or a comma-separated list of those. */
export function parseSetArg(arg: string): { name: string; source: string } {
  const eq = arg.indexOf("=");
  const name = eq > 0 ? arg.slice(0, eq).trim() : "";
  const source = eq > 0 ? arg.slice(eq + 1).trim() : "";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || !source) throw new Error(`--set needs <name>=<directory, manifest.json or a comma-separated list>, got "${arg}"`);
  return { name, source };
}

/** The pages of one source list; a page id given twice is an error (a set is one page per id). */
export function loadSetPages(source: string, cwd = process.cwd()): SetPage[] {
  const pages: SetPage[] = [];
  for (const raw of source.split(",").map((s) => s.trim()).filter(Boolean)) {
    const today = /^today:/i.test(raw);
    const p = path.resolve(cwd, today ? raw.slice("today:".length) : raw);
    if (!existsSync(p)) throw new Error(`${p} not found`);
    if (today && !statSync(p).isDirectory()) throw new Error(`today:<dir> needs a directory, got ${p}`);
    pages.push(...(statSync(p).isDirectory() ? scanSetDir(p, { today }) : readManifest(p)));
  }
  const dup = pages.map((p) => p.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (dup.length) throw new Error(`page(s) given twice: ${[...new Set(dup)].join(", ")}`);
  if (!pages.length) throw new Error(`No page in ${source}: expected <id>-1280-first.png + <id>-360-first.png, <id>-desk.png + <id>-phone.png, <id>/home-1280-first.png + home-360-first.png, or a manifest JSON`);
  return pages.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Contact sheets

export type SheetKind = "desk" | "phone";

/** Pixels one sheet may hold, so vision models read the tiles (they resize larger pictures to about this). */
export const SHEET_MAX_PIXELS = 2_500_000;

const LAYOUT = {
  // tileW/tileH: a 1280×800 first screen at 480 px; a 360×800 one at 200 px. minScale: the smallest the tiles may shrink before a second sheet is started.
  desk: { cols: 4, tileW: 480, aspect: 800 / 1280, labelH: 26, minScale: 0.625 },
  phone: { cols: 6, tileW: 200, aspect: 800 / 360, labelH: 22, minScale: 0.7 },
} as const;
const GAP = 8;

export interface SheetPlan {
  cols: number;
  tileW: number;
  tileH: number;
  labelH: number;
  /** Tile indexes of each sheet, in order. */
  sheets: number[][];
  /** Sheet width and the height of each sheet. */
  width: number;
  heights: number[];
}

/**
 * The layout for `n` pages: the default tile size, shrunk (never below minScale) until the whole set fits one sheet of
 * at most `maxPixels`; past that, more sheets of as many rows as fit.
 */
export function planSheet(n: number, kind: SheetKind, maxPixels = SHEET_MAX_PIXELS): SheetPlan {
  const L = LAYOUT[kind];
  const cols = Math.max(1, Math.min(L.cols, n));
  const at = (scale: number) => {
    const tileW = Math.max(40, Math.round(L.tileW * scale));
    const tileH = Math.round(tileW * L.aspect);
    const labelH = Math.max(14, Math.round(L.labelH * scale));
    const width = cols * (tileW + GAP) + GAP;
    const rowH = tileH + labelH + GAP;
    return { tileW, tileH, labelH, width, rowH };
  };
  let g = at(1);
  const heightOf = (rows: number) => rows * g.rowH + GAP;
  for (let scale = 1; scale >= L.minScale - 1e-9; scale -= 0.025) {
    g = at(scale);
    if (g.width * heightOf(Math.ceil(n / cols)) <= maxPixels) return finish(n, cols, g, Math.ceil(n / cols));
  }
  g = at(L.minScale);
  const rowsPerSheet = Math.max(1, Math.floor((maxPixels / g.width - GAP) / g.rowH));
  return finish(n, cols, g, rowsPerSheet);

  function finish(count: number, columns: number, geo: ReturnType<typeof at>, rowsPer: number): SheetPlan {
    const perSheet = rowsPer * columns;
    const sheets: number[][] = [];
    for (let i = 0; i < count; i += perSheet) sheets.push(Array.from({ length: Math.min(perSheet, count - i) }, (_, k) => i + k));
    return {
      cols: columns,
      tileW: geo.tileW,
      tileH: geo.tileH,
      labelH: geo.labelH,
      sheets,
      width: geo.width,
      heights: sheets.map((s) => Math.ceil(s.length / columns) * geo.rowH + GAP),
    };
  }
}

export interface Sheet {
  kind: SheetKind;
  jpeg: Uint8Array;
  width: number;
  height: number;
  /** The ids on this sheet, in reading order (left to right, top to bottom). */
  ids: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The id under a tile: the page id, cut to fit. */
function labelSvg(id: string, w: number, h: number): Buffer {
  const size = Math.max(10, Math.round(h * 0.62));
  const maxChars = Math.max(6, Math.floor(w / (size * 0.58)));
  const text = id.length > maxChars ? `${id.slice(0, maxChars - 1)}…` : id;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffffff"/><text x="3" y="${Math.round(h * 0.76)}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="bold" fill="#111111">${esc(text)}</text></svg>`);
}

/** The contact sheet(s) of one kind for the pages, in the pages' order: JPEG, each at most `maxPixels`, a label under each tile. */
export async function buildSheets(pages: readonly SetPage[], kind: SheetKind, maxPixels = SHEET_MAX_PIXELS): Promise<Sheet[]> {
  const plan = planSheet(pages.length, kind, maxPixels);
  const sheets: Sheet[] = [];
  for (const [si, indexes] of plan.sheets.entries()) {
    const height = plan.heights[si]!;
    const layers: { input: Buffer; left: number; top: number }[] = [];
    for (const [k, i] of indexes.entries()) {
      const page = pages[i]!;
      const left = GAP + (k % plan.cols) * (plan.tileW + GAP);
      const top = GAP + Math.floor(k / plan.cols) * (plan.tileH + plan.labelH + GAP);
      const tile = await sharp(readFileSync(kind === "desk" ? page.desk : page.phone))
        .removeAlpha()
        .resize(plan.tileW, plan.tileH, { fit: "cover", position: "top" })
        .toBuffer();
      layers.push({ input: tile, left, top }, { input: labelSvg(page.id, plan.tileW, plan.labelH), left, top: top + plan.tileH });
    }
    const jpeg = await sharp({ create: { width: plan.width, height, channels: 3, background: "#e4e4e4" } })
      .composite(layers)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    sheets.push({ kind, jpeg: new Uint8Array(jpeg), width: plan.width, height, ids: indexes.map((i) => pages[i]!.id) });
  }
  return sheets;
}

// ---------------------------------------------------------------------------------------------------------------
// Request and answer

const Score = z.number().int().min(1).max(5);
const Pick = z.strictObject({ id: z.string().max(100), why: z.string().max(240) });
/** The set verdict a reviewer returns. */
export const SetAnswer = z.strictObject({
  sameness: z.string().max(700),
  recurringIssues: z.array(z.string().max(240)).max(8),
  overall: Score,
  variety: Score,
  best: z.array(Pick).max(3),
  weakest: z.array(Pick).max(3),
  oneChange: z.string().max(400),
  summary: z.string().max(900),
});
export type SetAnswer = z.infer<typeof SetAnswer>;

const SCHEMA_NAME = "set_review";

export const SET_SYSTEM = `You are a strict senior design director reviewing the whole output of a design studio that makes websites for small Slovenian businesses (hairdressers, restaurants, car repair, dentists, bakeries, craftspeople, shops and others). You are not shown one page: you are shown ALL the homepages of one batch at once, as contact sheets of their first screens, one picture grid for desktop (1280 px wide) and one for phones (360 px wide). Each tile is labelled with its page id. Judge the SET as a studio's portfolio, from what you see only.

- overall (1 to 5): the quality of the set as a body of work. 3 is an ordinary template shop; 5 is a studio a business owner would be proud to hire. Be strict.
- variety (1 to 5): how different the pages are from each other. 5 = each looks designed for its own business, someone could not mistake two of them for one template; 1 = one template with the colours and words changed.
- sameness: what repeats across the pages, concretely: layouts and hero compositions, type (fonts, weights, sizes), colour (palettes, the same accents), imagery (style, crops, subjects), motifs and ornaments, section rhythm. Name the repeats, not "some similarity".
- recurringIssues: defects or weaknesses that appear on several pages (cropping, contrast, empty areas, clutter, weak hierarchy, generic stock feel), one short sentence each, most damaging first.
- best: the three pages that are strongest (fewer if the set has fewer pages), each with the reason in one sentence. weakest: the three weakest, each with the reason. Use the page ids from the labels.
- oneChange: the single change to the studio's output (not to one page) that would lift the set most.
- summary: at most 120 words, plain, for the studio's owner.

Don't judge the copy's facts or the Slovene text; judge what the screens show. Answer with one JSON object and nothing else, matching the schema.`;

/** The system prompt; in JSON mode the schema is spelled out. */
export function setSystem(reviewer: Reviewer): string {
  const schema = reviewer.structured === "json_object" ? `\n\nJSON schema:\n${JSON.stringify(toModelJsonSchema(SetAnswer))}` : "";
  return `${SET_SYSTEM}${schema}`;
}

export type SetPart = { kind: "text"; text: string } | { kind: "image"; bytes: Uint8Array };

/** The user message: the page ids, then the desktop sheet(s), then the phone sheet(s). */
export function setParts(name: string, pages: readonly SetPage[], desk: readonly Sheet[], phone: readonly Sheet[]): SetPart[] {
  const img = (bytes: Uint8Array): SetPart => ({ kind: "image", bytes });
  const sheetText = (label: string, sheets: readonly Sheet[]): SetPart[] =>
    sheets.flatMap((s, i) => [{ kind: "text" as const, text: `${label}${sheets.length > 1 ? ` (sheet ${i + 1} of ${sheets.length}: ${s.ids.join(", ")})` : ""}:` }, img(s.jpeg)]);
  return [
    { kind: "text", text: `Set "${name}": ${pages.length} homepages (${pages.map((p) => p.id).join(", ")}).` },
    ...sheetText("Desktop first screens (1280 px wide), each labelled with its page id", desk),
    ...sheetText("Phone first screens (360 px wide), each labelled with its page id", phone),
    { kind: "text", text: "Review this set." },
  ];
}

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const dataUrl = (b: Uint8Array) => `data:${isJpeg(b) ? "image/jpeg" : "image/png"};base64,${Buffer.from(b).toString("base64")}`;

export function buildSetRequest(reviewer: Reviewer, parts: readonly SetPart[]): ChatBody {
  const content: ChatPart[] = parts.map((p) => (p.kind === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: dataUrl(p.bytes) } }));
  const messages: ChatMessage[] = [
    { role: "system", content: setSystem(reviewer) },
    { role: "user", content },
  ];
  return {
    model: reviewer.model,
    messages,
    max_tokens: reviewer.maxTokens,
    response_format:
      reviewer.structured === "json_schema"
        ? { type: "json_schema", json_schema: { name: SCHEMA_NAME, strict: true, schema: toModelJsonSchema(SetAnswer) } }
        : { type: "json_object" },
  };
}

/** Parses a reviewer's set verdict (a ```json fence is tolerated). Throws on anything else. */
export function parseSetAnswer(content: string): SetAnswer {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return SetAnswer.parse(clipProse(JSON.parse(text)));
}

/** Prose limits of the answer: a reviewer that writes past one (Fable's sameness on 50 pages) is cut there with "…", not thrown away. */
const PROSE_MAX: Record<string, number> = { sameness: 700, oneChange: 400, summary: 900, why: 240 };
function clipProse(v: unknown, key = ""): unknown {
  if (typeof v === "string") {
    const max = key === "recurringIssues" ? 240 : PROSE_MAX[key];
    return max && v.length > max ? `${v.slice(0, max - 1).trimEnd()}…` : v;
  }
  if (Array.isArray(v)) return v.map((x) => clipProse(x, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clipProse(x, k)]));
  return v;
}

// ---------------------------------------------------------------------------------------------------------------
// Sets, plan and run

/** A set ready to review: its pages and its sheets. */
export interface BuiltSet {
  name: string;
  pages: SetPage[];
  desk: Sheet[];
  phone: Sheet[];
}

export async function buildSet(name: string, pages: SetPage[], maxPixels = SHEET_MAX_PIXELS): Promise<BuiltSet> {
  return { name, pages, desk: await buildSheets(pages, "desk", maxPixels), phone: await buildSheets(pages, "phone", maxPixels) };
}

const requestOf = (r: Reviewer, s: BuiltSet): ChatBody => buildSetRequest(r, setParts(s.name, s.pages, s.desk, s.phone));

export interface SetPlan {
  sets: number;
  calls: number;
  images: number;
  eur: number;
  byReviewer: Record<string, { calls: number; eur: number }>;
  bySet: Record<string, { pages: number; images: number; eur: number }>;
}

/** Builds every request and prices the run. No transport, no key, no network. */
export function planSets(o: { config: AppConfig; reviewers: readonly Reviewer[]; sets: readonly BuiltSet[] }): SetPlan {
  const plan: SetPlan = { sets: o.sets.length, calls: 0, images: 0, eur: 0, byReviewer: {}, bySet: {} };
  for (const r of o.reviewers) plan.byReviewer[r.id] = { calls: 0, eur: 0 };
  for (const s of o.sets) {
    plan.bySet[s.name] = { pages: s.pages.length, images: s.desk.length + s.phone.length, eur: 0 };
    for (const r of o.reviewers) {
      const e: CallEstimate = estimateCall(o.config, r, requestOf(r, s));
      plan.calls++;
      plan.images += s.desk.length + s.phone.length;
      plan.eur += e.eur;
      plan.byReviewer[r.id]!.calls++;
      plan.byReviewer[r.id]!.eur += e.eur;
      plan.bySet[s.name]!.eur += e.eur;
    }
  }
  return plan;
}

export type SetOutcome = { status: "ok"; answer: SetAnswer } | { status: "failed"; reason: string } | { status: "skipped" };

export interface SetRun {
  /** reviewer id → set name → outcome. */
  results: Record<string, Record<string, SetOutcome>>;
  spentEur: number;
  calls: number;
  stoppedByBudget: boolean;
}

/**
 * Asks every reviewer about every set: one call per reviewer per set, with the per-page round's budget rule (what is
 * spent, plus what in-flight calls reserve at their longest answer, plus this call's worst case, stays within `maxEur`;
 * otherwise the rest is "skipped"), its booking (a recorded answer at € 0, a failed paid call at its worst case) and its
 * transports. An invalid answer is asked for once more; a second one fails the set (never a made-up verdict). A batching
 * reviewer's sets go together in one batch.
 */
export async function runSets(o: {
  config: AppConfig;
  reviewers: readonly Reviewer[];
  sets: readonly BuiltSet[];
  transport: OutsideTransport | ((r: Reviewer) => OutsideTransport);
  maxEur: number;
  onCost: (line: CostLine) => void;
  now?: () => Date;
  onProgress?: (msg: string) => void;
}): Promise<SetRun> {
  const now = o.now ?? (() => new Date());
  const run: SetRun = { results: {}, spentEur: 0, calls: 0, stoppedByBudget: false };
  for (const r of o.reviewers) run.results[r.id] = {};
  const transports = new Map<string, OutsideTransport>();
  const transportOf = (r: Reviewer) => {
    let t = transports.get(r.id);
    if (!t) transports.set(r.id, (t = typeof o.transport === "function" ? o.transport(r) : o.transport));
    return t;
  };
  let reservedEur = 0;

  const ask = async (r: Reviewer, setName: string, body: ChatBody, opts: { retry?: boolean } = {}): Promise<ChatResult | null> => {
    const t = transportOf(r);
    const est = estimateCall(o.config, r, body);
    if (run.stoppedByBudget || run.spentEur + reservedEur + est.worstEur > o.maxEur) {
      if (!opts.retry) run.stoppedByBudget = true;
      return null;
    }
    const book = (c: Omit<CostLine, "at" | "stage" | "reviewer" | "model" | "itemId">) => {
      run.spentEur += c.eur;
      run.calls++;
      o.onCost({ at: now().toISOString(), stage: "outside-review", reviewer: r.id, model: r.model, itemId: `set:${setName}`, ...c });
    };
    reservedEur += est.worstEur;
    let res: ChatResult;
    try {
      res = await t.complete(body);
    } catch (e) {
      reservedEur -= est.worstEur;
      if (t.paid && !(e instanceof ReviewHttpError && e.refusedBeforeRun)) book({ inputTokens: est.inputTokens, outputTokens: r.maxTokens, usd: est.worstEur / o.config.eurPerUsd, eur: est.worstEur, costSource: "estimate" });
      throw e;
    }
    reservedEur -= est.worstEur;
    const c = callCost(o.config, r, res, body);
    book(t.paid && !res.replayed ? c : { ...c, usd: 0, eur: 0, costSource: "replay" });
    return res;
  };

  const reviewSet = async (r: Reviewer, s: BuiltSet) => {
    const out = run.results[r.id]!;
    if (run.stoppedByBudget) {
      out[s.name] = { status: "skipped" };
      return;
    }
    const body = requestOf(r, s);
    try {
      let res = await ask(r, s.name, body);
      if (!res) {
        out[s.name] = { status: "skipped" };
        return;
      }
      let parsed: SetAnswer | undefined;
      let problem = "";
      for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
        try {
          parsed = parseSetAnswer(res.content);
        } catch (e) {
          problem = (e instanceof Error ? e.message : String(e)).slice(0, 300);
          if (attempt === 2) break;
          const retry: ChatBody = {
            ...body,
            messages: [
              ...body.messages,
              { role: "assistant", content: res.content || "(empty)" },
              { role: "user", content: `That answer was not valid (${problem}). Answer again with only the JSON object in the schema.` },
            ],
          };
          const again = await ask(r, s.name, retry, { retry: true });
          if (!again) {
            problem = `stopped by --max-eur before the retry (${problem})`;
            break;
          }
          res = again;
        }
      }
      out[s.name] = parsed ? { status: "ok", answer: parsed } : { status: "failed", reason: `invalid answer: ${problem}` };
    } catch (e) {
      out[s.name] = { status: "failed", reason: e instanceof Error ? e.message : String(e) };
    }
    o.onProgress?.(`set ${s.name} / ${r.id}: ${out[s.name]!.status}`);
  };

  for (const r of o.reviewers) {
    const t = transportOf(r);
    if (t.drain) await t.drain(o.sets.map((s) => reviewSet(r, s)));
    else for (const s of o.sets) await reviewSet(r, s);
    for (const s of o.sets) run.results[r.id]![s.name] ??= { status: "skipped" };
  }
  return run;
}

// ---------------------------------------------------------------------------------------------------------------
// Output

/** Writes `<out>/sets/<set>/{desk-N.jpg, phone-N.jpg, <reviewer>.json}` and `<out>/sets.md`; returns the markdown. */
export function writeSetOutputs(o: { out: string; reviewers: readonly Reviewer[]; sets: readonly BuiltSet[]; run: SetRun }): string {
  for (const s of o.sets) {
    const dir = path.join(o.out, "sets", s.name);
    mkdirSync(dir, { recursive: true });
    for (const sheet of [...s.desk, ...s.phone]) {
      const n = (sheet.kind === "desk" ? s.desk : s.phone).indexOf(sheet) + 1;
      writeFileSync(path.join(dir, `${sheet.kind}-${n}.jpg`), sheet.jpeg);
    }
    for (const r of o.reviewers) {
      const outcome = o.run.results[r.id]?.[s.name] ?? { status: "skipped" as const };
      writeFileSync(path.join(dir, `${r.id}.json`), `${JSON.stringify({ set: s.name, reviewer: r.id, model: r.model, pages: s.pages.map((p) => p.id), ...outcome }, null, 2)}\n`);
    }
  }
  const md = formatSets(o);
  writeFileSync(path.join(o.out, "sets.md"), md);
  return md;
}

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

export function formatSets(o: { reviewers: readonly Reviewer[]; sets: readonly BuiltSet[]; run: SetRun }): string {
  const ids = o.reviewers.map((r) => r.id);
  const L: string[] = ["# Whole-set review", "", `${o.sets.length} set(s), ${o.run.calls} calls, €${o.run.spentEur.toFixed(4)} spent.${o.run.stoppedByBudget ? " Stopped at --max-eur: sets listed as skipped were not reviewed." : ""}`, ""];
  const got = (r: string, s: string) => {
    const x = o.run.results[r]?.[s];
    return x?.status === "ok" ? x.answer : null;
  };
  const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : "–");
  L.push("| Set | Pages | " + ids.map((id) => `${id}: overall / variety`).join(" | ") + " | Mean overall | Mean variety |", `|---|---|${ids.map(() => "---|").join("")}---|---|`);
  for (const s of o.sets) {
    const answers = ids.map((id) => got(id, s.name));
    const ok = answers.filter((a): a is SetAnswer => a !== null);
    L.push(`| ${s.name} | ${s.pages.length} | ${answers.map((a) => (a ? `${a.overall} / ${a.variety}` : "–")).join(" | ")} | ${mean(ok.map((a) => a.overall))} | ${mean(ok.map((a) => a.variety))} |`);
  }
  L.push("");
  for (const s of o.sets) {
    L.push(`## ${s.name}`, "", `${s.pages.length} pages: ${s.pages.map((p) => p.id).join(", ")}.`, "");
    for (const r of o.reviewers) {
      const x = o.run.results[r.id]?.[s.name];
      L.push(`### ${r.id} (${r.model})`, "");
      if (x?.status !== "ok") {
        L.push(x?.status === "failed" ? `Failed: ${x.reason}` : "Skipped (budget).", "");
        continue;
      }
      const a = x.answer;
      L.push(
        `Overall **${a.overall}**, variety **${a.variety}**. ${cell(a.summary)}`,
        "",
        `- Sameness: ${cell(a.sameness)}`,
        `- Recurring issues: ${a.recurringIssues.length ? a.recurringIssues.map(cell).join(" · ") : "none named"}`,
        `- Best: ${a.best.map((b) => `${b.id} (${cell(b.why)})`).join("; ") || "–"}`,
        `- Weakest: ${a.weakest.map((b) => `${b.id} (${cell(b.why)})`).join("; ") || "–"}`,
        `- One change: ${cell(a.oneChange)}`,
        "",
      );
    }
  }
  return `${L.join("\n")}\n`;
}
