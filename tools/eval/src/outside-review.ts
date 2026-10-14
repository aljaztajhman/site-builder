/**
 * Outside design reviewers (owner's decision 2026-10-14): vision models from other labs (config `outsideReview`:
 * Gemini 4 Argon and GPT-6.1 through OpenRouter) score a page's four screenshots with the judge's own rubric and
 * output schema (judge.ts), so their scores can sit beside the owner's Okus ratings and the Anthropic judge's.
 * Eval only; nothing here touches generation or the live app. Pure where it can be: request building, answer
 * parsing, scoring, cost and the budget guard take a transport (outside-transport.ts), so tests never need a network.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AppConfig, OutsideReviewConfig } from "@sb/config";
import { fitImageForModel, sliceScreenshot } from "@sb/engine";
import { toModelJsonSchema } from "@sb/spec";
import { JudgeOutputNotesFirst, judgeSystem, mean } from "./judge.ts";
import { ItemsFile } from "./okus-round.ts";
import { pairwiseAgreement, spearman, type Agreement } from "./okus-calibrate.ts";
import { ReviewHttpError, type ChatBody, type ChatMessage, type ChatPart, type ChatResult, type OutsideTransport } from "./outside-transport.ts";

export type Reviewer = OutsideReviewConfig["reviewers"][number];
/**
 * The judge's answer plus the filter's question (the reviewers screen pages before the owner or the design consultants
 * see them): the defects that would stop the page from going to the client as it is. Empty when nothing would.
 */
export const ReviewAnswer = JudgeOutputNotesFirst.extend({ blockers: z.array(z.string().max(200)).max(5) });
export type ReviewOutput = z.infer<typeof ReviewAnswer>;

// ---------------------------------------------------------------------------------------------------------------
// Pages

export interface PageFiles {
  phoneFirst: string;
  phoneFull: string;
  deskFirst: string;
  deskFull: string;
}
export interface ReviewItem {
  id: string;
  /** Given to the reviewer as the only context; never the model or the design direction. */
  businessType: string;
  files: PageFiles;
}

export type Part = { kind: "text"; text: string } | { kind: "image"; bytes: Uint8Array };

const read = (file: string) => new Uint8Array(readFileSync(file));

/**
 * The page's pictures in the judge's order and slicing (judgeHomepage): phone first screen, whole phone page in
 * slices of 1560 px (at most 4), desktop first screen, whole desktop page in slices of 900 px (at most 4).
 */
export async function preparePage(item: ReviewItem): Promise<Part[]> {
  const phoneFull = await sliceScreenshot(await fitImageForModel(read(item.files.phoneFull)), 1560, 4);
  const deskFull = await sliceScreenshot(await fitImageForModel(read(item.files.deskFull)), 900, 4);
  const img = (bytes: Uint8Array): Part => ({ kind: "image", bytes });
  return [
    { kind: "text", text: `Business type: ${item.businessType}.` },
    { kind: "text", text: "Phone first screen (360×800) as a visitor sees it:" },
    img(read(item.files.phoneFirst)),
    { kind: "text", text: `Whole phone page, top to bottom in ${phoneFull.tiles.length} slices${phoneFull.truncated ? " (the page continues below)" : ""}:` },
    ...phoneFull.tiles.map(img),
    { kind: "text", text: "Desktop first screen (1280×800) as a visitor sees it:" },
    img(read(item.files.deskFirst)),
    { kind: "text", text: `Whole desktop page, top to bottom in ${deskFull.tiles.length} slices${deskFull.truncated ? " (the page continues below)" : ""}:` },
    ...deskFull.tiles.map(img),
    { kind: "text", text: "Score this homepage." },
  ];
}

const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;
const dataUrl = (b: Uint8Array) => `data:${isJpeg(b) ? "image/jpeg" : "image/png"};base64,${Buffer.from(b).toString("base64")}`;

// ---------------------------------------------------------------------------------------------------------------
// Request

const SCHEMA_NAME = "design_review";

/** What makes a defect a blocker: the page would not be handed to the client as it is. */
export const BLOCKERS = `

Blockers: the defects you would refuse to hand to the client as they are, one short sentence each naming where (phone or desktop, which section): a word broken or clipped, text over a picture where it can't be read, elements overlapping or cut off, a broken, empty or nonsensical picture, the same section, photo or contact block repeated, a layout that falls apart on one of the two screens. Leave the list empty when nothing would stop you. Taste and polish are not blockers; they go in the fixes.`;

/** The judge's rubric (with the intended-faults paragraph) plus how to answer. In JSON mode the schema is spelled out. */
export function reviewSystem(reviewer: Reviewer): string {
  const how = `\n\nAnswer with one JSON object and nothing else, matching the schema: the two notes first, then the scores, then the fixes, then the blockers.`;
  const schema = reviewer.structured === "json_object" ? `\n\nJSON schema:\n${JSON.stringify(toModelJsonSchema(ReviewAnswer))}` : "";
  return `${judgeSystem(true)}${BLOCKERS}${how}${schema}`;
}

export function buildRequest(reviewer: Reviewer, parts: readonly Part[]): ChatBody {
  const content: ChatPart[] = parts.map((p) => (p.kind === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: dataUrl(p.bytes) } }));
  const messages: ChatMessage[] = [
    { role: "system", content: reviewSystem(reviewer) },
    { role: "user", content },
  ];
  return {
    model: reviewer.model,
    messages,
    max_tokens: reviewer.maxTokens,
    response_format:
      reviewer.structured === "json_schema"
        ? { type: "json_schema", json_schema: { name: SCHEMA_NAME, strict: true, schema: toModelJsonSchema(ReviewAnswer) } }
        : { type: "json_object" },
  };
}

/** Parses a reviewer's answer: JSON (a ```json fence is tolerated) in the review schema. Throws on anything else. */
export function parseAnswer(content: string): ReviewOutput {
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return ReviewAnswer.parse(JSON.parse(text));
}

// ---------------------------------------------------------------------------------------------------------------
// Cost

export interface CallEstimate {
  inputTokens: number;
  outputTokens: number;
  eur: number;
  /** The same call with the longest answer the reviewer may give (`maxTokens`; reasoning counts as answer tokens): what the budget guard reserves. */
  worstEur: number;
}

const priceOf = (config: AppConfig, model: string) => {
  const p = config.outsideReview.pricesUsdPerMTok[model];
  if (!p) throw new Error(`No outside-review price configured for ${model}`);
  return p;
};
const usdFor = (config: AppConfig, model: string, input: number, output: number) => {
  const p = priceOf(config, model);
  return (input * p.input + output * p.output) / 1_000_000;
};

const imagesIn = (body: ChatBody) => body.messages.reduce((n, m) => n + (typeof m.content === "string" ? 0 : m.content.filter((p) => p.type === "image_url").length), 0);
const charsIn = (body: ChatBody) =>
  body.messages.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : m.content.reduce((k, p) => k + (p.type === "text" ? p.text.length : 0), 0)), 0);

/** Under the Message Batches API's 256 MB request limit. */
const MAX_BATCH_BYTES = 200_000_000;

/** An Anthropic reviewer in Message Batches pays `batchPriceFactor` of the list price. */
const priceFactor = (config: AppConfig, reviewer: Reviewer) => (reviewer.provider === "anthropic" && reviewer.batch ? config.batchPriceFactor : 1);

/** What a call is expected to cost before it is sent: text at `charsPerToken`, each picture at `tokensPerImage`, the answer at `outputTokens`. */
export function estimateCall(config: AppConfig, reviewer: Reviewer, body: ChatBody): CallEstimate {
  const e = config.outsideReview.estimate;
  const inputTokens = Math.ceil(charsIn(body) / e.charsPerToken) + imagesIn(body) * e.tokensPerImage;
  const outputTokens = e.outputTokens;
  const f = priceFactor(config, reviewer) * config.eurPerUsd;
  return {
    inputTokens,
    outputTokens,
    eur: usdFor(config, reviewer.model, inputTokens, outputTokens) * f,
    worstEur: usdFor(config, reviewer.model, inputTokens, reviewer.maxTokens) * f,
  };
}

export interface CallCost {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  eur: number;
  /**
   * openrouter: the cost OpenRouter reported; config: its token counts at the configured prices; estimate: no usage came
   * back, or the call failed after it was sent (priced at the longest answer); replay: a recorded answer, nothing paid.
   */
  costSource: "openrouter" | "config" | "estimate" | "replay";
}

export function callCost(config: AppConfig, reviewer: Reviewer, res: ChatResult, body: ChatBody): CallCost {
  const u = res.usage;
  const known = u && typeof u.prompt_tokens === "number" && typeof u.completion_tokens === "number";
  const inputTokens = known ? u.prompt_tokens! : estimateCall(config, reviewer, body).inputTokens;
  const outputTokens = known ? u.completion_tokens! : reviewer.maxTokens;
  let usd: number;
  let costSource: CallCost["costSource"];
  if (u && typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0) {
    usd = u.cost;
    costSource = "openrouter";
  } else {
    usd = usdFor(config, reviewer.model, inputTokens, outputTokens) * priceFactor(config, reviewer);
    costSource = known ? "config" : "estimate";
  }
  return { inputTokens, outputTokens, usd, eur: usd * config.eurPerUsd, costSource };
}

export interface CostLine extends CallCost {
  at: string;
  stage: "outside-review";
  reviewer: string;
  model: string;
  itemId: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Dry run

export interface Plan {
  items: number;
  calls: number;
  images: number;
  eur: number;
  byReviewer: Record<string, { calls: number; eur: number }>;
}

/** Builds every request and prices the run. No transport, no key, no network. */
export async function planReview(o: { config: AppConfig; reviewers: readonly Reviewer[]; items: readonly ReviewItem[] }): Promise<Plan> {
  const plan: Plan = { items: o.items.length, calls: 0, images: 0, eur: 0, byReviewer: {} };
  for (const r of o.reviewers) plan.byReviewer[r.id] = { calls: 0, eur: 0 };
  for (const item of o.items) {
    const parts = await preparePage(item);
    for (const r of o.reviewers) {
      const body = buildRequest(r, parts);
      const e = estimateCall(o.config, r, body);
      plan.calls++;
      plan.images += imagesIn(body);
      plan.eur += e.eur;
      plan.byReviewer[r.id]!.calls++;
      plan.byReviewer[r.id]!.eur += e.eur;
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------
// Run

export type ItemOutcome =
  | { status: "ok"; output: ReviewOutput; phone: number; desktop: number; score: number }
  | { status: "failed"; reason: string }
  | { status: "skipped" };

export interface ReviewRun {
  /** reviewer id → item id → outcome. */
  results: Record<string, Record<string, ItemOutcome>>;
  spentEur: number;
  calls: number;
  stoppedByBudget: boolean;
}

/**
 * Asks every reviewer about every item: reviewers that answer one call at a time item by item (a budget stop leaves
 * whole items for them), then each batching reviewer in waves. Before each call it checks that what is spent, plus
 * what in-flight calls reserve, plus the call's worst case stays within `maxEur`; otherwise the run stops and the rest
 * is "skipped" (a reviewer stopped earlier than another leaves pages the filter calls "unreviewed"). An invalid
 * answer is asked for once more; a second one fails the item (never a made-up score). Each call is passed to `onCost`.
 */
export async function runReview(o: {
  config: AppConfig;
  reviewers: readonly Reviewer[];
  items: readonly ReviewItem[];
  /** One transport for every reviewer, or one per reviewer (OpenRouter and Anthropic in one run). */
  transport: OutsideTransport | ((r: Reviewer) => OutsideTransport);
  maxEur: number;
  onCost: (line: CostLine) => void;
  now?: () => Date;
  onProgress?: (msg: string) => void;
}): Promise<ReviewRun> {
  const now = o.now ?? (() => new Date());
  const run: ReviewRun = { results: {}, spentEur: 0, calls: 0, stoppedByBudget: false };
  for (const r of o.reviewers) run.results[r.id] = {};
  // One transport per reviewer for the whole run: a batching transport's queue and its drain must be the same object.
  const transports = new Map<string, OutsideTransport>();
  const transportOf = (r: Reviewer) => {
    let t = transports.get(r.id);
    if (!t) transports.set(r.id, (t = typeof o.transport === "function" ? o.transport(r) : o.transport));
    return t;
  };
  /** The worst case of the calls sent and not yet booked (a batch's pages wait together). */
  let reservedEur = 0;

  const book = (r: Reviewer, itemId: string, c: CallCost) => {
    run.spentEur += c.eur;
    run.calls++;
    o.onCost({ at: now().toISOString(), stage: "outside-review", reviewer: r.id, model: r.model, itemId, ...c });
  };

  /**
   * One call within the budget (reserving its longest possible answer until it is booked); null when it would not
   * fit. A paid call that throws after it was sent (timeout, 5xx, unreadable answer) is booked at that worst case, so
   * the guard never undercounts; one the provider refused before the model ran (a 4xx but 408) is not booked. An
   * answer reused from a recording is booked at € 0.
   */
  const ask = async (r: Reviewer, itemId: string, body: ChatBody, opts: { retry?: boolean } = {}): Promise<ChatResult | null> => {
    const t = transportOf(r);
    const est = estimateCall(o.config, r, body);
    if (run.stoppedByBudget || run.spentEur + reservedEur + est.worstEur > o.maxEur) {
      // A retry that doesn't fit fails its page only: in a batch wave the room is still held by the wave's other
      // calls and comes back when they are booked.
      if (!opts.retry) run.stoppedByBudget = true;
      return null;
    }
    reservedEur += est.worstEur;
    let res: ChatResult;
    try {
      res = await t.complete(body);
    } catch (e) {
      reservedEur -= est.worstEur;
      if (t.paid && !(e instanceof ReviewHttpError && e.refusedBeforeRun)) book(r, itemId, { inputTokens: est.inputTokens, outputTokens: r.maxTokens, usd: est.worstEur / o.config.eurPerUsd, eur: est.worstEur, costSource: "estimate" });
      throw e;
    }
    reservedEur -= est.worstEur;
    const c = t.paid && !res.replayed ? callCost(o.config, r, res, body) : { ...callCost(o.config, r, res, body), usd: 0, eur: 0, costSource: "replay" as const };
    book(r, itemId, c);
    return res;
  };

  /** One reviewer's answer for one page: asked once more after an invalid answer, never a made-up score. */
  const reviewOne = async (r: Reviewer, item: ReviewItem, parts: readonly Part[]) => {
    const out = run.results[r.id]!;
    if (run.stoppedByBudget) {
      out[item.id] = { status: "skipped" };
      return;
    }
    const body = buildRequest(r, parts);
    try {
      let res = await ask(r, item.id, body);
      if (!res) {
        out[item.id] = { status: "skipped" };
        return;
      }
      let parsed: ReviewOutput | undefined;
      let problem = "";
      for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
        try {
          parsed = parseAnswer(res.content);
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
          const again = await ask(r, item.id, retry, { retry: true });
          if (!again) {
            problem = `stopped by --max-eur before the retry (${problem})`;
            break;
          }
          res = again;
        }
      }
      if (parsed) {
        const phone = mean(parsed.phone);
        const desktop = mean(parsed.desktop);
        out[item.id] = { status: "ok", output: parsed, phone, desktop, score: (phone + desktop) / 2 };
      } else out[item.id] = { status: "failed", reason: `invalid answer: ${problem}` };
    } catch (e) {
      out[item.id] = { status: "failed", reason: e instanceof Error ? e.message : String(e) };
    }
    o.onProgress?.(`${item.id} / ${r.id}: ${out[item.id]!.status}`);
  };

  // Reviewers answering one call at a time: page by page, so a budget stop leaves whole pages.
  const direct = o.reviewers.filter((r) => !transportOf(r).drain);
  const batched = o.reviewers.filter((r) => transportOf(r).drain);
  const partsCache = new Map<string, Part[]>();
  const partsOf = async (item: ReviewItem) => partsCache.get(item.id) ?? partsCache.set(item.id, await preparePage(item)).get(item.id)!;
  for (const item of o.items) {
    if (run.stoppedByBudget) {
      for (const r of direct) run.results[r.id]![item.id] = { status: "skipped" };
      continue;
    }
    if (!direct.length) break;
    const parts = await partsOf(item);
    for (const r of direct) await reviewOne(r, item, parts);
  }

  // Batching reviewers: in waves, each as many pages as fit the money left at their worst case; a wave's real cost
  // (usually far below its worst case) frees the room for the next.
  for (const r of batched) {
    const t = transportOf(r);
    let pending = [...o.items];
    while (pending.length && !run.stoppedByBudget) {
      const room = o.maxEur - run.spentEur;
      const wave: { item: ReviewItem; parts: Part[] }[] = [];
      let worst = 0;
      let bytes = 0;
      for (const item of pending) {
        const parts = await partsOf(item);
        const body = buildRequest(r, parts);
        const w = estimateCall(o.config, r, body).worstEur;
        // The Message Batches API takes at most 256 MB per batch; a page is about 3 MB of base64 screenshots.
        const b = JSON.stringify(body).length;
        if (worst + w > room || (wave.length && bytes + b > MAX_BATCH_BYTES)) break;
        wave.push({ item, parts });
        worst += w;
        bytes += b;
      }
      if (!wave.length) {
        run.stoppedByBudget = true;
        break;
      }
      pending = pending.slice(wave.length);
      o.onProgress?.(`${r.id}: sending ${wave.length} page(s) as one batch (worst case €${worst.toFixed(2)}, €${room.toFixed(2)} left)`);
      await t.drain!(wave.map(({ item, parts }) => reviewOne(r, item, parts)));
      const ids = (t as { batches?: readonly string[] }).batches;
      if (ids?.length) o.onProgress?.(`${r.id}: batches so far ${ids.join(", ")}`);
    }
    for (const item of pending) run.results[r.id]![item.id] ??= { status: "skipped" };
  }
  return run;
}

/** `{ "<itemId>": score }` for one reviewer: the file `pnpm okus:calibrate --judge` reads. Failed and skipped items are absent. */
export function scoresFor(run: ReviewRun, reviewerId: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, o] of Object.entries(run.results[reviewerId] ?? {})) if (o.status === "ok") out[id] = o.score;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Page sources

/** Okus round directory (items.json plus its images). Throws, saying how to render them, when images are missing. */
export function loadOkusItems(roundPath: string): ReviewItem[] {
  const file = path.join(roundPath, "items.json");
  if (!existsSync(file)) throw new Error(`${file} not found. Build the round first: pnpm okus:items --round <n>`);
  const parsed = ItemsFile.parse(JSON.parse(readFileSync(file, "utf8")));
  const missing: string[] = [];
  const items = parsed.items.map((it): ReviewItem => {
    const resolve = (rel: string) => {
      if (/^https?:\/\//.test(rel)) throw new Error(`Item ${it.id} has URL images (${rel}); outside-review reads local files. Render them again with pnpm okus:items --round ${parsed.round}`);
      const abs = path.join(roundPath, rel);
      if (!existsSync(abs)) missing.push(rel);
      return abs;
    };
    return {
      id: it.id,
      businessType: it.trade,
      files: { phoneFirst: resolve(it.images.phone), phoneFull: resolve(it.images.phoneFull), deskFirst: resolve(it.images.desk), deskFull: resolve(it.images.deskFull) },
    };
  });
  if (missing.length) {
    throw new Error(
      `${missing.length} Okus images missing in ${roundPath} (e.g. ${missing[0]}). The images are not committed: render them for free with pnpm okus:items --round ${parsed.round} (needs Playwright's Chromium: pnpm --filter @sb/engine exec playwright install chromium; no model call).`,
    );
  }
  return items;
}

const RUN_FILES = { phoneFirst: "home-360-first.png", phoneFull: "home-360.png", deskFirst: "home-1280-first.png", deskFull: "home-1280.png" } as const;
/** `pnpm eval --regenerate`: the site after "Ustvari znova", reviewed as a page of its own (`<id>-regenerated`). */
const REGENERATED_FILES = { phoneFirst: "regenerated-360-first.png", phoneFull: "regenerated-360.png", deskFirst: "regenerated-1280-first.png", deskFull: "regenerated-1280.png" } as const;
const FIXTURE_GROUPS = ["fixtures", "twins", "hard"] as const;

/** The trade the reviewer is told, from the eval fixture's brief (fixtures, twins, hard); "not given" for any other dir. */
export function fixtureBusinessType(id: string, evalDir = path.resolve(import.meta.dirname, "..")): string {
  for (const g of FIXTURE_GROUPS) {
    const file = path.join(evalDir, g, id, "brief.json");
    if (!existsSync(file)) continue;
    const b = JSON.parse(readFileSync(file, "utf8")) as { businessType?: string; trade?: string };
    return [b.businessType, b.trade].filter(Boolean).join(", ") || "not given";
  }
  return "not given";
}

/**
 * An eval run directory (`pnpm eval` writes eval/runs/<fixture id>/): each subdirectory that holds the four home-*.png
 * screenshots is one page, and with the four regenerated-*.png a second one. The reviewer is told the fixture's trade.
 * `since` drops screenshots older than that (eval/runs keeps earlier runs' pages).
 */
export function loadRunDirItems(runDir: string, o: { since?: Date; evalDir?: string } = {}): ReviewItem[] {
  if (!existsSync(runDir)) throw new Error(`${runDir} not found`);
  const items: ReviewItem[] = [];
  for (const e of readdirSync(runDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const d = path.join(runDir, e.name);
    const businessType = fixtureBusinessType(e.name, o.evalDir);
    for (const [id, names] of [[e.name, RUN_FILES], [`${e.name}-regenerated`, REGENERATED_FILES]] as const) {
      const files = { phoneFirst: path.join(d, names.phoneFirst), phoneFull: path.join(d, names.phoneFull), deskFirst: path.join(d, names.deskFirst), deskFull: path.join(d, names.deskFull) };
      if (!Object.values(files).every((f) => existsSync(f))) continue;
      if (o.since && Object.values(files).some((f) => statSync(f).mtime < o.since!)) continue;
      items.push({ id, businessType, files });
    }
  }
  if (!items.length) throw new Error(`No page in ${runDir}: expected subdirectories holding ${Object.values(RUN_FILES).join(", ")}${o.since ? ` written since ${o.since.toISOString()}` : ""}`);
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

/** Sorted by id, so the same flags pick the same pages; `only` names ids, `count` takes the first n. */
export function selectItems(items: readonly ReviewItem[], o: { only?: readonly string[]; count?: number }): ReviewItem[] {
  let out = [...items].sort((a, b) => a.id.localeCompare(b.id));
  if (o.only?.length) {
    const unknown = o.only.filter((id) => !out.some((i) => i.id === id));
    if (unknown.length) throw new Error(`Unknown item id: ${unknown.join(", ")}`);
    out = out.filter((i) => o.only!.includes(i.id));
  }
  return o.count !== undefined ? out.slice(0, o.count) : out;
}

// ---------------------------------------------------------------------------------------------------------------
// Report

export interface Comparison {
  pairwise: Agreement;
  spearman: number | null;
  /** Items both sides scored. */
  n: number;
}

export interface Summary {
  items: string[];
  reviewers: Record<string, { model: string; scored: string[]; failed: string[]; skipped: string[]; vsOwner: Comparison | null }>;
  reviewerPairs: ({ a: string; b: string } & Comparison)[];
  spentEur: number;
  calls: number;
  stoppedByBudget: boolean;
  rows: { itemId: string; owner: number | null; scores: Record<string, number | null>; topFix: Record<string, string | null>; blockers: Record<string, string[] | null> }[];
  /** The filter: a page passes when every reviewer answered and none named a blocker; held when any named one. */
  filter: { passed: string[]; held: string[]; unreviewed: string[] };
}

function compare(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): Comparison {
  const common = [...a.keys()].filter((id) => b.has(id)).sort();
  return { pairwise: pairwiseAgreement(a, b), spearman: spearman(common.map((id) => a.get(id)!), common.map((id) => b.get(id)!)), n: common.length };
}

/** Compares each reviewer with the owner's ratings (when given) and with each other. All items count: no held-out split. */
export function buildSummary(o: { config: AppConfig; reviewers: readonly Reviewer[]; run: ReviewRun; owner?: ReadonlyMap<string, number> | undefined; items: readonly { id: string }[] }): Summary {
  const maps = new Map(o.reviewers.map((r) => [r.id, new Map(Object.entries(scoresFor(o.run, r.id)))]));
  const summary: Summary = {
    items: o.items.map((i) => i.id),
    reviewers: {},
    reviewerPairs: [],
    spentEur: o.run.spentEur,
    calls: o.run.calls,
    stoppedByBudget: o.run.stoppedByBudget,
    rows: [],
    filter: { passed: [], held: [], unreviewed: [] },
  };
  for (const r of o.reviewers) {
    const res = o.run.results[r.id] ?? {};
    const ids = (s: ItemOutcome["status"]) => o.items.map((i) => i.id).filter((id) => res[id]?.status === s);
    summary.reviewers[r.id] = { model: r.model, scored: ids("ok"), failed: ids("failed"), skipped: ids("skipped"), vsOwner: o.owner ? compare(o.owner, maps.get(r.id)!) : null };
  }
  for (let i = 0; i < o.reviewers.length; i++) {
    for (let j = i + 1; j < o.reviewers.length; j++) {
      const [a, b] = [o.reviewers[i]!.id, o.reviewers[j]!.id];
      summary.reviewerPairs.push({ a, b, ...compare(maps.get(a)!, maps.get(b)!) });
    }
  }
  for (const it of o.items) {
    const scores: Record<string, number | null> = {};
    const topFix: Record<string, string | null> = {};
    const blockers: Record<string, string[] | null> = {};
    for (const r of o.reviewers) {
      const out = o.run.results[r.id]?.[it.id];
      scores[r.id] = out?.status === "ok" ? out.score : null;
      topFix[r.id] = out?.status === "ok" ? (out.output.fixes[0] ?? null) : null;
      blockers[r.id] = out?.status === "ok" ? out.output.blockers : null;
    }
    summary.rows.push({ itemId: it.id, owner: o.owner?.get(it.id) ?? null, scores, topFix, blockers });
    const named = Object.values(blockers).some((b) => b !== null && b.length > 0);
    const all = Object.values(blockers).every((b) => b !== null);
    summary.filter[named ? "held" : all ? "passed" : "unreviewed"].push(it.id);
  }
  return summary;
}

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)} %`);
const rho = (x: number | null) => (x === null ? "n/a" : x.toFixed(2));
const num = (x: number | null) => (x === null ? "–" : String(Math.round(x * 100) / 100));
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s+/g, " ");

export function formatReport(s: Summary): string {
  const ids = Object.keys(s.reviewers);
  const L: string[] = ["# Outside design reviewers", ""];
  L.push(`${s.items.length} pages, ${s.calls} calls, €${s.spentEur.toFixed(4)} spent.${s.stoppedByBudget ? " Stopped at --max-eur: the pages listed as skipped were not reviewed." : ""}`, "");
  L.push("All items count: agreement is measured on every page that has both scores, with no held-out split (nothing is tuned on these scores).", "");
  if (ids.some((id) => s.reviewers[id]!.vsOwner)) {
    L.push("## Against the owner's Okus ratings", "", "| Reviewer | Model | Pages scored | Pairwise agreement | Spearman ρ |", "|---|---|---|---|---|");
    for (const id of ids) {
      const r = s.reviewers[id]!;
      const c = r.vsOwner;
      L.push(`| ${id} | ${r.model} | ${c?.n ?? 0} | ${c ? `${pct(c.pairwise.agreement)} (${c.pairwise.pairs} pairs)` : "n/a"} | ${c ? rho(c.spearman) : "n/a"} |`);
    }
    L.push("");
  }
  if (s.reviewerPairs.length) {
    L.push("## Reviewers against each other", "", "| Pair | Pages | Pairwise agreement | Spearman ρ |", "|---|---|---|---|");
    for (const p of s.reviewerPairs) L.push(`| ${p.a} vs ${p.b} | ${p.n} | ${pct(p.pairwise.agreement)} (${p.pairwise.pairs} pairs) | ${rho(p.spearman)} |`);
    L.push("");
  }
  L.push(
    "## Filter",
    "",
    `${s.filter.passed.length} of ${s.items.length} pages pass (every reviewer answered, none named a blocker), ${s.filter.held.length} held${s.filter.unreviewed.length ? `, ${s.filter.unreviewed.length} not reviewed by every reviewer` : ""}.`,
    "",
  );
  const held = s.rows.filter((r) => s.filter.held.includes(r.itemId));
  if (held.length) {
    L.push(`| Page | ${ids.map((id) => `${id}: blockers`).join(" | ")} |`, `|---|${ids.map(() => "---|").join("")}`);
    for (const r of held) L.push(`| ${r.itemId} | ${ids.map((id) => cell((r.blockers[id] ?? []).join(" · "))).join(" | ")} |`);
    L.push("");
  }
  L.push("## Scores and top fix per page", "", `| Page | Owner | ${ids.map((id) => `${id} | ${id}: top fix`).join(" | ")} |`, `|---|---|${ids.map(() => "---|---|").join("")}`);
  for (const r of s.rows) L.push(`| ${r.itemId} | ${num(r.owner)} | ${ids.map((id) => `${num(r.scores[id] ?? null)} | ${cell(r.topFix[id] ?? "")}`).join(" | ")} |`);
  L.push("");
  for (const id of ids) {
    const r = s.reviewers[id]!;
    if (r.failed.length) L.push(`Failed (${id}, no score given): ${r.failed.join(", ")}`, "");
    if (r.skipped.length) L.push(`Skipped (${id}, budget): ${r.skipped.join(", ")}`, "");
  }
  return `${L.join("\n")}\n`;
}
