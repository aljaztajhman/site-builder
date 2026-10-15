import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@sb/config";
import { parseJudgeScores } from "../src/okus-calibrate.ts";
import { main } from "../src/outside-review-cli.ts";
import {
  blockersNeeded,
  buildRequest,
  buildSummary,
  callCost,
  estimateCall,
  formatReport,
  loadOkusItems,
  loadRunDirItems,
  parseAnswer,
  planReview,
  preparePage,
  runReview,
  scoresFor,
  selectItems,
  type ReviewItem,
} from "../src/outside-review.ts";
import { ClaudeReviewTransport, ReviewHttpError, RecordedTransport, makeTransport, requestHash, type ChatBody, type ChatResult, type OutsideTransport } from "../src/outside-transport.ts";

const config = loadConfig();
const [gemini, gpt] = config.outsideReview.reviewers;
if (!gemini || !gpt) throw new Error("config needs two outside reviewers");

const scores = (n: number) => ({ impression: n, hierarchy: n, imagery: n, spacing: n, clutter: n, distinctiveness: n });
const answer = (phone: number, desktop: number, fix = "Bigger photo", blockers: string[] = []) =>
  JSON.stringify({ phoneNote: "p", desktopNote: "d", phone: scores(phone), desktop: scores(desktop), fixes: [fix], blockers });
const result = (content: string, usage?: ChatResult["usage"]): ChatResult => ({ content, ...(usage ? { usage } : {}) });

let dir: string;
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#336699" } }).png().toBuffer();
const jpg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#996633" } }).jpeg().toBuffer();

async function writeItem(id: string, ext: "png" | "jpg" = "png"): Promise<ReviewItem> {
  const d = path.join(dir, id);
  mkdirSync(d, { recursive: true });
  const make = ext === "png" ? png : jpg;
  const files = {
    phoneFirst: path.join(d, `phone-first.${ext}`),
    phoneFull: path.join(d, `phone-full.${ext}`),
    deskFirst: path.join(d, `desk-first.${ext}`),
    deskFull: path.join(d, `desk-full.${ext}`),
  };
  writeFileSync(files.phoneFirst, await make(8, 40));
  writeFileSync(files.phoneFull, await make(8, 3200)); // 3 slices of 1560
  writeFileSync(files.deskFirst, await make(16, 40));
  writeFileSync(files.deskFull, await make(16, 800)); // 1 slice
  return { id, businessType: "bakery", files };
}

let items: ReviewItem[];
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "outside-review-"));
  items = [await writeItem("item-a"), await writeItem("item-b", "jpg")];
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Answers from a list, one per call, recording every body. */
function scripted(...answers: (ChatResult | Error)[]): OutsideTransport & { calls: ChatBody[] } {
  const calls: ChatBody[] = [];
  return {
    paid: true,
    calls,
    async complete(body) {
      calls.push(body);
      const next = answers[calls.length - 1];
      if (!next) throw new Error("scripted transport ran out of answers");
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

describe("request", () => {
  it("sends the judge's system prompt and four screenshot groups as data URLs, in order", async () => {
    const parts = await preparePage(items[0]!);
    const body = buildRequest(gemini, parts);
    expect(body.model).toBe("google/gemini-4-argon");
    expect(body.max_tokens).toBe(gemini.maxTokens);
    expect(body.messages[0]).toMatchObject({ role: "system" });
    const system = body.messages[0]!.content as string;
    expect(system).toContain("strict senior web designer");
    expect(system).toContain("Intended, never a fault");
    expect(system).toContain("JSON");
    const user = body.messages[1]!;
    expect(user.role).toBe("user");
    const content = user.content as Exclude<typeof user.content, string>;
    const order = content.map((p) => (p.type === "text" ? (p.text.startsWith("Business type") ? "ctx" : p.text.split(" ")[0]) : "img"));
    // context, phone first screen, whole phone page (3 slices), desktop first screen, whole desktop page (1 slice), ask
    expect(order).toEqual(["ctx", "Phone", "img", "Whole", "img", "img", "img", "Desktop", "img", "Whole", "img", "Score"]);
    const urls = content.flatMap((p) => (p.type === "image_url" ? [p.image_url.url] : []));
    expect(urls).toHaveLength(6);
    for (const u of urls) expect(u).toMatch(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
  });

  it("never says which model made the page, and gives the trade only", async () => {
    const body = buildRequest(gemini, await preparePage(items[0]!));
    const text = JSON.stringify(body.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.filter((p) => p.type === "text"))));
    expect(text).not.toMatch(/claude|anthropic|opus|sonnet|haiku/i);
    expect(text).toContain("Business type: bakery");
  });

  it("labels a JPEG as image/jpeg and a PNG as image/png", async () => {
    const urlsOf = async (item: ReviewItem) =>
      (buildRequest(gemini, await preparePage(item)).messages[1]!.content as { type: string; image_url?: { url: string } }[]).flatMap((p) => (p.image_url ? [p.image_url.url] : []));
    const jpeg = await urlsOf(items[1]!);
    // Unsliced images keep their format; sliced ones are PNG.
    expect(jpeg[0]).toMatch(/^data:image\/jpeg/);
    expect(jpeg[1]).toMatch(/^data:image\/png/);
    expect((await urlsOf(items[0]!))[0]).toMatch(/^data:image\/png/);
  });

  it("asks for a strict JSON schema, or for JSON mode with the schema in the prompt, as the reviewer is configured", async () => {
    const parts = await preparePage(items[0]!);
    const strict = buildRequest({ ...gemini, structured: "json_schema" }, parts);
    expect(strict.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    const schema = (strict.response_format as unknown as { json_schema: { schema: { properties: Record<string, unknown> } } }).json_schema.schema;
    expect(Object.keys(schema.properties)).toEqual(["phoneNote", "desktopNote", "phone", "desktop", "fixes", "blockers"]); // notes first
    const loose = buildRequest({ ...gpt, structured: "json_object" }, parts);
    expect(loose.response_format).toEqual({ type: "json_object" });
    expect(loose.model).toBe("openai/gpt-6.1-sol");
    expect(loose.messages[0]!.content as string).toContain('"phoneNote"');
    expect(strict.messages[0]!.content as string).not.toContain('"phoneNote"');
  });

  it("hashes the model and messages only", async () => {
    const body = buildRequest(gemini, await preparePage(items[0]!));
    expect(requestHash(body)).toBe(requestHash({ ...body, max_tokens: 1, response_format: { type: "json_object" } } as ChatBody));
    expect(requestHash(body)).not.toBe(requestHash({ ...body, model: "x/y" }));
  });
});

describe("answers", () => {
  it("parses a fenced JSON answer and rejects a wrong shape", () => {
    expect(parseAnswer(`\`\`\`json\n${answer(4, 3)}\n\`\`\``).phone.impression).toBe(4);
    expect(() => parseAnswer("not json")).toThrow();
    expect(() => parseAnswer(JSON.stringify({ phone: scores(9) }))).toThrow();
    expect(() => parseAnswer(answer(6, 3))).toThrow();
    // The filter's question is part of every answer: an answer without blockers is invalid.
    const { blockers: _, ...noBlockers } = JSON.parse(answer(4, 3)) as Record<string, unknown>;
    expect(() => parseAnswer(JSON.stringify(noBlockers))).toThrow();
    expect(parseAnswer(answer(4, 3, "f", ["Phone: the headline breaks ZAMENJAM/O"])).blockers).toHaveLength(1);
  });

  it("asks for blockers, and says taste is not one", async () => {
    const system = buildRequest(gemini, await preparePage(items[0]!)).messages[0]!.content as string;
    expect(system).toMatch(/Blockers: the defects you would refuse to hand to the client/);
    expect(system).toMatch(/Taste and polish are not blockers/);
  });

  it("retries once on an invalid answer, then takes the valid one", async () => {
    const t = scripted(result("sorry, no"), result(answer(4, 2)));
    const run = await runReview({ config, reviewers: [gemini], items: [items[0]!], transport: t, maxEur: 1, onCost: () => {} });
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1]!.messages.length).toBeGreaterThan(t.calls[0]!.messages.length); // the retry names the problem
    expect(run.results.gemini!["item-a"]).toMatchObject({ status: "ok", score: 3 });
  });

  it("records the item as failed after a second invalid answer, and invents no score", async () => {
    const t = scripted(result(answer(9, 9)), result("{}"));
    const run = await runReview({ config, reviewers: [gemini], items: [items[0]!], transport: t, maxEur: 1, onCost: () => {} });
    expect(t.calls).toHaveLength(2);
    expect(run.results.gemini!["item-a"]).toMatchObject({ status: "failed" });
    expect(scoresFor(run, "gemini")).toEqual({});
  });

  it("records a transport error as a failed item and goes on", async () => {
    const t = scripted(new Error("HTTP 402"), result(answer(5, 5)));
    const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: 1, onCost: () => {} });
    expect(run.results.gemini!["item-a"]).toMatchObject({ status: "failed", reason: expect.stringContaining("402") });
    expect(run.results.gemini!["item-b"]).toMatchObject({ status: "ok", score: 5 });
  });
});

describe("scores", () => {
  it("is the mean of the phone and desktop means, and the scores file is readable by okus:calibrate", async () => {
    const t = scripted(result(answer(4, 2)), result(answer(5, 3)));
    const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: 1, onCost: () => {} });
    const s = scoresFor(run, "gemini");
    expect(s).toEqual({ "item-a": 3, "item-b": 4 });
    const parsed = parseJudgeScores(JSON.parse(JSON.stringify(s)));
    expect(parsed.get("item-b")).toBe(4);
  });
});

describe("cost", () => {
  const body = (model = gemini.model): ChatBody => ({ model, messages: [{ role: "user", content: "x" }], max_tokens: 10 });

  it("takes OpenRouter's own cost when it reports one", () => {
    const c = callCost(config, gemini, result("", { prompt_tokens: 10_000, completion_tokens: 500, cost: 0.05 }), body());
    expect(c).toMatchObject({ costSource: "openrouter", usd: 0.05, inputTokens: 10_000, outputTokens: 500 });
    expect(c.eur).toBeCloseTo(0.05 * config.eurPerUsd, 10);
  });

  it("falls back to the configured prices, and says so", () => {
    const c = callCost(config, gemini, result("", { prompt_tokens: 10_000, completion_tokens: 500 }), body());
    expect(c.costSource).toBe("config");
    const price = (m: string) => config.outsideReview.pricesUsdPerMTok[m]!;
    expect(c.usd).toBeCloseTo((10_000 * price(gemini.model).input + 500 * price(gemini.model).output) / 1e6, 10);
    const g = callCost(config, gpt, result("", { prompt_tokens: 10_000, completion_tokens: 500 }), body(gpt.model));
    expect(g.usd).toBeCloseTo((10_000 * price(gpt.model).input + 500 * price(gpt.model).output) / 1e6, 10);
  });

  it("estimates a call from its text and images when the answer reports no usage", async () => {
    const b = buildRequest(gemini, await preparePage(items[0]!));
    const e = estimateCall(config, gemini, b);
    expect(e.inputTokens).toBeGreaterThanOrEqual(6 * config.outsideReview.estimate.tokensPerImage);
    expect(callCost(config, gemini, result(""), b)).toMatchObject({ costSource: "estimate" });
  });

  it("logs one line per call with the fields the plan names", async () => {
    const lines: Record<string, unknown>[] = [];
    const t = scripted(result(answer(3, 3), { prompt_tokens: 9000, completion_tokens: 400, cost: 0.03 }));
    await runReview({ config, reviewers: [gemini], items: [items[0]!], transport: t, maxEur: 1, onCost: (l) => lines.push(l as never) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ stage: "outside-review", reviewer: "gemini", model: gemini.model, itemId: "item-a", inputTokens: 9000, outputTokens: 400, usd: 0.03, costSource: "openrouter" });
    expect(typeof lines[0]!.at).toBe("string");
    expect(typeof lines[0]!.eur).toBe("number");
  });
});

describe("budget guard", () => {
  it("stops before a call that would take the run over --max-eur and lists what it skipped", async () => {
    const body = buildRequest(gemini, await preparePage(items[0]!));
    const est = estimateCall(config, gemini, body).worstEur;
    // Room for exactly one call at its worst case; the first call costs 90 % of the room, so the second does not fit.
    const t = scripted(result(answer(4, 4), { prompt_tokens: 1, completion_tokens: 1, cost: (est * 0.9) / config.eurPerUsd }), result(answer(4, 4)));
    const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: est * 1.2, onCost: () => {} });
    expect(t.calls).toHaveLength(1);
    expect(run.results.gemini!["item-a"]).toMatchObject({ status: "ok" });
    expect(run.results.gemini!["item-b"]).toMatchObject({ status: "skipped" });
    expect(run.stoppedByBudget).toBe(true);
    expect(run.spentEur).toBeLessThanOrEqual(est * 1.2);
  });

  it("reserves the longest answer: a call that uses all of maxTokens still keeps the run within --max-eur", async () => {
    const body = buildRequest(gemini, await preparePage(items[0]!));
    const e = estimateCall(config, gemini, body);
    expect(e.worstEur).toBeGreaterThan(e.eur);
    const maxEur = e.worstEur * 1.5;
    // Every answer uses the whole answer budget at the configured prices; only one such call fits in 1.5× its worst case.
    const full = () => result(answer(4, 4), { prompt_tokens: e.inputTokens, completion_tokens: gemini.maxTokens });
    const t = scripted(full(), full());
    const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur, onCost: () => {} });
    expect(t.calls).toHaveLength(1);
    expect(run.spentEur).toBeLessThanOrEqual(maxEur);
  });

  it("books a paid call that fails after it was sent at its worst case, and the guard counts it", async () => {
    const lines: Record<string, unknown>[] = [];
    const body = buildRequest(gemini, await preparePage(items[0]!));
    const worst = estimateCall(config, gemini, body).worstEur;
    const t = scripted(new Error("timeout"), result(answer(4, 4)));
    const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: worst * 1.5, onCost: (l) => lines.push(l as never) });
    expect(run.results.gemini!["item-a"]).toMatchObject({ status: "failed" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ itemId: "item-a", costSource: "estimate", outputTokens: gemini.maxTokens });
    expect(run.spentEur).toBeCloseTo(worst, 10);
    // The failed call used most of the room, so the next page is not sent.
    expect(t.calls).toHaveLength(1);
    expect(run.results.gemini!["item-b"]).toMatchObject({ status: "skipped" });
  });

  it("books nothing for a call OpenRouter refused before the model ran (4xx), but a 408 or 5xx at its worst case", async () => {
    const body = buildRequest(gemini, await preparePage(items[0]!));
    const worst = estimateCall(config, gemini, body).worstEur;
    for (const status of [400, 402, 429]) {
      const lines: Record<string, unknown>[] = [];
      const t = scripted(new ReviewHttpError(status, `HTTP ${status}`), result(answer(4, 4), { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 }));
      const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: worst * 1.5, onCost: (l) => lines.push(l as never) });
      expect(run.results.gemini!["item-a"]).toMatchObject({ status: "failed", reason: expect.stringContaining(String(status)) });
      // Only the second page's answer is booked, so the refused call left room for it.
      expect(lines.map((l) => l.itemId)).toEqual(["item-b"]);
      expect(run.spentEur).toBeCloseTo(0.001 * config.eurPerUsd, 10);
      expect(run.results.gemini!["item-b"]).toMatchObject({ status: "ok" });
    }
    for (const status of [408, 500, 503]) {
      const lines: Record<string, unknown>[] = [];
      const t = scripted(new ReviewHttpError(status, `HTTP ${status}`), result(answer(4, 4)));
      const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: worst * 1.5, onCost: (l) => lines.push(l as never) });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({ itemId: "item-a", costSource: "estimate" });
      expect(run.spentEur).toBeCloseTo(worst, 10);
    }
  });

  it("books replayed answers at € 0", async () => {
    const lines: Record<string, unknown>[] = [];
    const t = { ...scripted(result(answer(4, 4), { prompt_tokens: 9000, completion_tokens: 400, cost: 0.03 })), paid: false };
    const run = await runReview({ config, reviewers: [gemini], items: [items[0]!], transport: t, maxEur: 1, onCost: (l) => lines.push(l as never) });
    expect(run.spentEur).toBe(0);
    expect(lines[0]).toMatchObject({ eur: 0, usd: 0, costSource: "replay" });
  });

  it("makes no call at all when the first does not fit", async () => {
    const t = scripted(result(answer(4, 4)));
    const run = await runReview({ config, reviewers: [gemini, gpt], items, transport: t, maxEur: 0.0001, onCost: () => {} });
    expect(t.calls).toHaveLength(0);
    expect(run.results.gpt!["item-b"]).toMatchObject({ status: "skipped" });
  });
});

describe("dry run", () => {
  it("builds every request and prices the run without a network call or a key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const plan = await planReview({ config, reviewers: [gemini, gpt], items });
    expect(plan.calls).toBe(4);
    expect(plan.images).toBe(6 * 4);
    expect(plan.eur).toBeGreaterThan(0);
    expect(plan.byReviewer.gemini!.calls).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("the CLI's --dry-run prints the estimate, calls nothing and needs no key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const roundDir = path.join(dir, "run-dir");
    for (const id of ["one", "two"]) {
      mkdirSync(path.join(roundDir, id), { recursive: true });
      writeFileSync(path.join(roundDir, id, "home-360.png"), await png(8, 3200));
      writeFileSync(path.join(roundDir, id, "home-360-first.png"), await png(8, 40));
      writeFileSync(path.join(roundDir, id, "home-1280.png"), await png(16, 800));
      writeFileSync(path.join(roundDir, id, "home-1280-first.png"), await png(16, 40));
    }
    const out: string[] = [];
    const code = await main(["--run-dir", roundDir, "--dry-run"], {}, (l) => out.push(l));
    expect(code).toBe(0);
    expect(out.join("\n")).toMatch(/6 calls/); // 2 pages × 3 reviewers
    expect(out.join("\n")).toMatch(/€/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("key", () => {
  it("a live run without OPENROUTER_API_KEY fails with a clear message; replay and dry runs do not need one", async () => {
    expect(() => makeTransport({ baseUrl: config.outsideReview.baseUrl, env: {} })).toThrow(/OPENROUTER_API_KEY is not set/);
    expect(() => makeTransport({ baseUrl: config.outsideReview.baseUrl, env: {}, replay: dir })).not.toThrow();
    const out: string[] = [];
    const code = await main(["--run-dir", path.join(dir, "run-dir"), "--max-eur", "1"], {}, (l) => out.push(l));
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/OPENROUTER_API_KEY is not set/);
  });

  it("a live run needs --max-eur", async () => {
    const out: string[] = [];
    const code = await main(["--run-dir", path.join(dir, "run-dir")], { OPENROUTER_API_KEY: "sk-test" }, (l) => out.push(l));
    expect(code).toBe(2);
    expect(out.join("\n")).toMatch(/--max-eur/);
    expect(out.join("\n")).not.toContain("sk-test");
  });
});

describe("claude reviewer", () => {
  const claude = config.outsideReview.reviewers.find((r) => r.id === "claude")!;
  type Sent = { req: { system: string[]; messages: { role: string; content: unknown }[]; schema?: unknown; cache?: boolean }; stage: { model: string; maxTokens: number; effort?: string } };
  const engine = (answers: (string | Error)[]) => {
    const sent: Sent[] = [];
    return {
      sent,
      async send(req: Sent["req"], stage: Sent["stage"]) {
        sent.push({ req, stage });
        const a = answers[sent.length - 1];
        if (a === undefined) throw new Error("fake engine ran out of answers");
        if (a instanceof Error) throw a;
        return { text: a, stopReason: "end_turn", model: stage.model, usage: { input_tokens: 9000, output_tokens: 1200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, batch: true };
      },
    };
  };

  it("sends the same review as Anthropic's request: one system block, base64 images, the schema, the reviewer's effort", async () => {
    const e = engine([answer(4, 4)]);
    const t = new ClaudeReviewTransport(claude, e as never);
    const body = buildRequest(claude, await preparePage(items[0]!));
    const res = await t.complete(body);
    const { req, stage } = e.sent[0]!;
    expect(stage).toEqual({ model: "claude-fable-5-1", maxTokens: claude.maxTokens, effort: "medium" });
    expect(req.system).toEqual([body.messages[0]!.content]);
    expect(req.cache).toBe(false);
    const content = req.messages[0]!.content as { type: string; source?: { type: string; media_type: string; data: string } }[];
    expect(content.filter((b) => b.type === "image").length).toBe(body.messages[1]!.content.length - content.filter((b) => b.type === "text").length);
    expect(content.find((b) => b.type === "image")!.source).toMatchObject({ type: "base64", media_type: "image/png" });
    expect(req.schema).toEqual((body.response_format as { json_schema: { schema: unknown } }).json_schema.schema);
    expect(res).toMatchObject({ usage: { prompt_tokens: 9000, completion_tokens: 1200 }, batch: true });
  });

  it("turns an API error status into a ReviewHttpError, so a refused call is not booked", async () => {
    const t = new ClaudeReviewTransport(claude, engine([Object.assign(new Error("credit balance too low"), { status: 400 })]) as never);
    const err = await t.complete(buildRequest(claude, await preparePage(items[0]!))).catch((x: unknown) => x);
    expect(err).toBeInstanceOf(ReviewHttpError);
    expect((err as ReviewHttpError).refusedBeforeRun).toBe(true);
  });

  it("in a batch, an error status after the batch was created is booked at its worst case, not taken as refused", async () => {
    const batchingEngine = { ...engine([Object.assign(new Error("rate limited while polling"), { status: 429 })]), drain: async () => {} };
    const t = new ClaudeReviewTransport(claude, batchingEngine as never);
    const err = await t.complete(buildRequest(claude, await preparePage(items[0]!))).catch((x: unknown) => x);
    expect(err).not.toBeInstanceOf(ReviewHttpError);
    const body = buildRequest(claude, await preparePage(items[0]!));
    const worst = estimateCall(config, claude, body).worstEur;
    const failing: OutsideTransport = { paid: true, complete: () => t.complete(body), drain: async (w) => void (await Promise.allSettled(w)) };
    const lines: Record<string, unknown>[] = [];
    const run = await runReview({ config, reviewers: [claude], items: [items[0]!], transport: failing, maxEur: 5, onCost: (l) => lines.push(l as never) });
    expect(run.results.claude!["item-a"]).toMatchObject({ status: "failed" });
    expect(lines).toHaveLength(1);
    expect(run.spentEur).toBeCloseTo(worst, 10);
  });

  it("needs ANTHROPIC_API_KEY for a live run", () => {
    expect(() => makeTransport({ baseUrl: "https://x", env: {}, reviewer: claude })).toThrow(/ANTHROPIC_API_KEY/);
  });

  /** A batching transport: `complete` queues, `drain` answers the queue (and any retries it queues) as one batch. */
  const batching = (answerFor: () => ChatResult) => {
    let queue: (() => void)[] = [];
    const t: OutsideTransport & { batches: number; calls: number } = {
      paid: true,
      batches: 0,
      calls: 0,
      complete() {
        t.calls++;
        return new Promise((resolve) => queue.push(() => resolve(answerFor())));
      },
      async drain(work) {
        let done = false;
        const all = Promise.allSettled(work).then(() => void (done = true));
        while (!done) {
          await new Promise((r) => setTimeout(r, 5));
          if (!queue.length) continue;
          t.batches++;
          const q = queue;
          queue = [];
          for (const f of q) f();
          await Promise.race([all, new Promise((r) => setTimeout(r, 5))]);
        }
      },
    };
    return t;
  };

  it("sends a batching reviewer's pages in waves that fit the money left at their worst case, priced at batchPriceFactor", async () => {
    const worst = estimateCall(config, claude, buildRequest(claude, await preparePage(items[0]!))).worstEur;
    // Each answer costs little, so after the first wave (one page fits) the second page fits too.
    const t = batching(() => result(answer(4, 4), { prompt_tokens: 1000, completion_tokens: 100 }));
    const lines: Record<string, unknown>[] = [];
    const run = await runReview({ config, reviewers: [claude], items, transport: t, maxEur: worst * 1.5, onCost: (l) => lines.push(l as never) });
    expect(t.batches).toBe(2);
    expect(run.results.claude).toMatchObject({ "item-a": { status: "ok" }, "item-b": { status: "ok" } });
    const price = config.outsideReview.pricesUsdPerMTok["claude-fable-5-1"]!;
    expect(lines[0]).toMatchObject({ costSource: "config" });
    expect(lines[0]!.usd).toBeCloseTo(((1000 * price.input + 100 * price.output) / 1e6) * config.batchPriceFactor, 10);
    expect(run.spentEur).toBeLessThanOrEqual(worst * 1.5);
  });

  it("sends a whole wave at once when the money allows, and skips what never fits", async () => {
    const t = batching(() => result(answer(4, 4), { prompt_tokens: 1000, completion_tokens: 100 }));
    const run = await runReview({ config, reviewers: [claude], items, transport: t, maxEur: 50, onCost: () => {} });
    expect(t.batches).toBe(1);
    expect(t.calls).toBe(2);
    expect(run.results.claude!["item-b"]).toMatchObject({ status: "ok" });
    const none = batching(() => result(answer(4, 4)));
    const poor = await runReview({ config, reviewers: [claude], items, transport: none, maxEur: 0.0001, onCost: () => {} });
    expect(none.calls).toBe(0);
    expect(poor.results.claude).toEqual({ "item-a": { status: "skipped" }, "item-b": { status: "skipped" } });
  });

  it("an invalid answer whose retry doesn't fit the wave fails only that page; the next wave still goes", async () => {
    const worst = estimateCall(config, claude, buildRequest(claude, await preparePage(items[0]!))).worstEur;
    let n = 0;
    // Answers one queued request per round, so page b's call is still reserved when page a's invalid answer is
    // retried: the retry doesn't fit right then.
    const queue: (() => void)[] = [];
    const t: OutsideTransport = {
      paid: true,
      complete: () => new Promise((resolve) => queue.push(() => resolve(n++ === 0 ? result("not json", { prompt_tokens: 1000, completion_tokens: 100 }) : result(answer(4, 4), { prompt_tokens: 1000, completion_tokens: 100 })))),
      async drain(work) {
        let done = false;
        const all = Promise.allSettled(work).then(() => void (done = true));
        while (!done) {
          await new Promise((r) => setTimeout(r, 5));
          queue.shift()?.();
          await Promise.race([all, new Promise((r) => setTimeout(r, 5))]);
        }
      },
    };
    const three = [items[0]!, { ...items[0]!, id: "item-b" }, { ...items[0]!, id: "item-c" }]; // the same page, the same worst case
    const run = await runReview({ config, reviewers: [claude], items: three, transport: t, maxEur: worst * 2 + 0.001, onCost: () => {} });
    expect(run.results.claude!["item-a"]).toMatchObject({ status: "failed", reason: expect.stringMatching(/before the retry/) });
    expect(run.results.claude!["item-b"]).toMatchObject({ status: "ok" });
    expect(run.results.claude!["item-c"]).toMatchObject({ status: "ok" });
    expect(run.stoppedByBudget).toBe(false);
  });

  it("asks a transport factory once per reviewer, so a batch's queue and its drain are the same object", async () => {
    let made = 0;
    const factory = () => {
      made++;
      return batching(() => result(answer(4, 4), { prompt_tokens: 1000, completion_tokens: 100 }));
    };
    const run = await runReview({ config, reviewers: [claude], items, transport: factory, maxEur: 50, onCost: () => {} });
    expect(made).toBe(1);
    expect(scoresFor(run, "claude")).toEqual({ "item-a": 4, "item-b": 4 });
  });

  it("runs OpenRouter and batching reviewers in one run, each through its own transport", async () => {
    const direct = scripted(result(answer(3, 3)), result(answer(3, 3)));
    const batch = batching(() => result(answer(5, 5), { prompt_tokens: 1000, completion_tokens: 100 }));
    const run = await runReview({ config, reviewers: [gemini, claude], items, transport: (r) => (r.id === "claude" ? batch : direct), maxEur: 50, onCost: () => {} });
    expect(direct.calls).toHaveLength(2);
    expect(direct.calls.every((b) => b.model === gemini.model)).toBe(true);
    expect(scoresFor(run, "gemini")).toEqual({ "item-a": 3, "item-b": 3 });
    expect(scoresFor(run, "claude")).toEqual({ "item-a": 5, "item-b": 5 });
  });
});

describe("recordings", () => {
  it("record-missing reuses a recorded answer at € 0 and asks (and records) only the new ones", async () => {
    const rec = path.join(dir, "rec-missing");
    const first = buildRequest(gemini, await preparePage(items[0]!));
    await new RecordedTransport(rec, "record", scripted(result(answer(4, 4), { prompt_tokens: 5, completion_tokens: 6, cost: 0.01 }))).complete(first);
    const live = scripted(result(answer(2, 2), { prompt_tokens: 5, completion_tokens: 6, cost: 0.02 }));
    const t = new RecordedTransport(rec, "record-missing", live);
    const lines: Record<string, unknown>[] = [];
    const run = await runReview({ config, reviewers: [gemini], items, transport: t, maxEur: 1, onCost: (l) => lines.push(l as never) });
    expect(live.calls).toHaveLength(1); // only item-b was asked
    expect(lines.map((l) => [l.itemId, l.costSource])).toEqual([
      ["item-a", "replay"],
      ["item-b", "openrouter"],
    ]);
    expect(run.spentEur).toBeCloseTo(0.02 * config.eurPerUsd, 10);
    expect(scoresFor(run, "gemini")).toEqual({ "item-a": 4, "item-b": 2 });
  });

  it("records an answer under the request hash and replays it without the inner transport", async () => {
    const rec = path.join(dir, "rec");
    const body = buildRequest(gemini, await preparePage(items[0]!));
    const live = scripted(result(answer(4, 4), { prompt_tokens: 5, completion_tokens: 6, cost: 0.01 }));
    const got = await new RecordedTransport(rec, "record", live).complete(body);
    const again = await new RecordedTransport(rec, "replay").complete(body);
    expect(again).toEqual(got);
    expect(live.calls).toHaveLength(1);
    await expect(new RecordedTransport(rec, "replay").complete({ ...body, model: "x/y" })).rejects.toThrow(/No recording/);
  });
});

describe("page sources", () => {
  it("reads a run dir's subdirectories that hold the four home screenshots, sorted by id", async () => {
    const found = await loadRunDirItems(path.join(dir, "run-dir"));
    expect(found.map((i) => i.id)).toEqual(["one", "two"]);
  });

  it("tells the reviewer the fixture's trade, reads a regenerated site as its own page, and drops pages older than --since", async () => {
    const evalDir = path.join(dir, "eval-tree");
    mkdirSync(path.join(evalDir, "twins", "salon-x"), { recursive: true });
    writeFileSync(path.join(evalDir, "twins", "salon-x", "brief.json"), JSON.stringify({ id: "salon-x", businessType: "hairdresser", trade: "frizer" }));
    const runDir = path.join(dir, "runs-regen");
    const d = path.join(runDir, "salon-x");
    mkdirSync(d, { recursive: true });
    const shot = await png(8, 40);
    for (const f of ["home-360-first", "home-360", "home-1280-first", "home-1280"]) writeFileSync(path.join(d, `${f}.png`), shot);
    // Only the first screens of the regenerated site: not a page yet.
    for (const f of ["regenerated-360-first", "regenerated-1280-first"]) writeFileSync(path.join(d, `${f}.png`), shot);
    expect(loadRunDirItems(runDir, { evalDir }).map((i) => i.id)).toEqual(["salon-x"]);
    for (const f of ["regenerated-360", "regenerated-1280"]) writeFileSync(path.join(d, `${f}.png`), shot);
    const found = loadRunDirItems(runDir, { evalDir });
    expect(found.map((i) => [i.id, i.businessType])).toEqual([
      ["salon-x", "hairdresser, frizer"],
      ["salon-x-regenerated", "hairdresser, frizer"],
    ]);
    expect(found[1]!.files.deskFull).toBe(path.join(d, "regenerated-1280.png"));
    expect(loadRunDirItems(path.join(dir, "run-dir"), { evalDir })[0]!.businessType).toBe("not given");
    expect(() => loadRunDirItems(runDir, { evalDir, since: new Date(Date.now() + 60_000) })).toThrow(/written since/);
  });

  it("takes the first n by id, or the named ids, and refuses an unknown id", () => {
    const many = ["c", "a", "b"].map((id) => ({ id, businessType: "x", files: items[0]!.files }));
    expect(selectItems(many, { count: 2 }).map((i) => i.id)).toEqual(["a", "b"]);
    expect(selectItems(many, { only: ["c", "a"] }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(() => selectItems(many, { only: ["zzz"] })).toThrow(/zzz/);
  });

  it("reads an Okus round and says how to render the images when they are missing", () => {
    const round = path.join(dir, "round");
    mkdirSync(path.join(round, "img"), { recursive: true });
    const images = (id: string) => ({ desk: `img/${id}-d.jpg`, deskFull: `img/${id}-df.jpg`, phone: `img/${id}-p.jpg`, phoneFull: `img/${id}-pf.jpg` });
    writeFileSync(path.join(round, "items.json"), JSON.stringify({ round: 9, items: [{ id: "x-one", kind: "golden", label: "L", trade: "bakery", fixture: null, source: "s", images: images("x-one") }] }));
    expect(() => loadOkusItems(round)).toThrow(/pnpm okus:items --round 9/);
    for (const f of Object.values(images("x-one"))) writeFileSync(path.join(round, f), "");
    expect(loadOkusItems(round)).toMatchObject([{ id: "x-one", businessType: "bakery" }]);
  });
});

describe("report", () => {
  it("compares each reviewer with the owner and with each other, lists failures, and never fills them in", async () => {
    const t = scripted(
      result(answer(5, 5, "gemini fix a")), // a / gemini
      result(answer(4, 4, "gpt fix a")), // a / gpt
      result(answer(2, 2, "gemini fix b")),
      result(answer(3, 3)),
      result("bad"),
      result("bad"), // c / gemini fails twice
      result(answer(1, 1)),
    );
    const three = [items[0]!, items[1]!, { ...items[0]!, id: "item-c" }];
    const run = await runReview({ config, reviewers: [gemini, gpt], items: three, transport: t, maxEur: 5, onCost: () => {} });
    const owner = new Map([
      ["item-a", 5],
      ["item-b", 2],
      ["item-c", 1],
    ]);
    const summary = buildSummary({ config, reviewers: [gemini, gpt], run, owner, items: three });
    expect(summary.reviewers.gemini!.failed).toEqual(["item-c"]);
    expect(summary.reviewers.gemini!.vsOwner!.pairwise.agreement).toBe(1);
    expect(summary.reviewers.gpt!.vsOwner!.spearman).toBeCloseTo(1, 6);
    expect(summary.reviewerPairs[0]).toMatchObject({ a: "gemini", b: "gpt" });
    const md = formatReport(summary);
    expect(md).toContain("gemini fix a");
    expect(md).toContain("item-c");
    expect(md).toMatch(/failed/i);
    expect(md).toMatch(/all items count/i);
  });

  it("filters: a page passes only when every reviewer answered and none named a blocker", async () => {
    const t = scripted(
      result(answer(4, 4)), // a / gemini: clean
      result(answer(4, 4)), // a / gpt: clean
      result(answer(4, 4)), // b / gemini: clean
      result(answer(3, 3, "f", ["Desktop: the hero photo is cut off"])), // b / gpt: a blocker
      result(answer(4, 4)), // c / gemini: clean
      result("bad"),
      result("bad"), // c / gpt fails twice
    );
    const three = [items[0]!, items[1]!, { ...items[0]!, id: "item-c" }];
    const run = await runReview({ config, reviewers: [gemini, gpt], items: three, transport: t, maxEur: 5, onCost: () => {} });
    const summary = buildSummary({ config, reviewers: [gemini, gpt], run, items: three });
    expect(summary.filter).toEqual({ passed: ["item-a"], held: ["item-b"], unreviewed: ["item-c"] });
    expect(summary.rows[1]!.blockers).toEqual({ gemini: [], gpt: ["Desktop: the hero photo is cut off"] });
    const md = formatReport(summary);
    expect(md).toContain("1 of 3 pages pass");
    expect(md).toContain("Desktop: the hero photo is cut off");
  });

  it("two-of-three filter: held when at least two reviewers name a blocker; one alone is only in the any-reviewer count", async () => {
    const third = { ...gpt, id: "third" };
    const t = scripted(
      result(answer(4, 4)), result(answer(4, 4)), result(answer(4, 4)), // a: clean
      blocker2("one"), result(answer(4, 4)), result(answer(4, 4)), // b: one reviewer names a blocker
      blocker2("one"), blocker2("two"), result(answer(4, 4)), // c: two name one
    );
    const three = [items[0]!, items[1]!, { ...items[0]!, id: "item-c" }];
    const run = await runReview({ config, reviewers: [gemini, gpt, third], items: three, transport: t, maxEur: 5, onCost: () => {} });
    const summary = buildSummary({ config, reviewers: [gemini, gpt, third], run, items: three });
    expect(summary.filter).toEqual({ passed: ["item-a"], held: ["item-b", "item-c"], unreviewed: [] });
    expect(summary.agreedFilter).toEqual({ rule: "two-of-three", needed: 2, passed: ["item-a", "item-b"], held: ["item-c"], unreviewed: [] });
    const md = formatReport(summary);
    expect(md).toContain("1 of 3 pages pass all reviewers");
    expect(md).toContain("are held by any reviewer");
    expect(md).toMatch(/Held by the filter \(at least 2 of 3 reviewers name a blocker\): 1 of 3/);
  });

  it("two-of-three filter with two reviewers needs both; a failed reviewer leaves the page open only when it could still be held", async () => {
    expect(blockersNeeded(3)).toBe(2);
    expect(blockersNeeded(2)).toBe(2);
    expect(blockersNeeded(1)).toBe(1);
    const t = scripted(
      blocker2("x"), blocker2("y"), // a: both name one -> held
      blocker2("x"), result(answer(4, 4)), // b: one of two -> passes the filter
      result("bad"), result("bad"), blocker2("y"), // c: gemini fails, gpt names one -> open
    );
    const three = [items[0]!, items[1]!, { ...items[0]!, id: "item-c" }];
    const run = await runReview({ config, reviewers: [gemini, gpt], items: three, transport: t, maxEur: 5, onCost: () => {} });
    const summary = buildSummary({ config, reviewers: [gemini, gpt], run, items: three });
    expect(summary.agreedFilter).toMatchObject({ needed: 2, held: ["item-a"], passed: ["item-b"], unreviewed: ["item-c"] });
  });
});

const blocker2 = (n: string) => result(answer(3, 3, "f", [n]));

describe("config", () => {
  it("loads the three reviewers, each with a price; Claude runs on Anthropic's API in batches", () => {
    expect(config.outsideReview.reviewers.map((r) => r.id)).toEqual(["gemini", "gpt", "claude"]);
    expect(config.outsideReview.reviewers[2]).toMatchObject({ provider: "anthropic", model: "claude-fable-5-1", batch: true });
    for (const r of config.outsideReview.reviewers) expect(config.outsideReview.pricesUsdPerMTok[r.model]).toBeDefined();
    expect(config.pricesUsdPerMTok[gemini.model]).toBeUndefined();
  });
});
