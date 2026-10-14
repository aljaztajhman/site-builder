import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@sb/config";
import { parseJudgeScores } from "../src/okus-calibrate.ts";
import { main } from "../src/outside-review-cli.ts";
import {
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
import { RecordedTransport, makeTransport, requestHash, type ChatBody, type ChatResult, type OutsideTransport } from "../src/outside-transport.ts";

const config = loadConfig();
const [gemini, gpt] = config.outsideReview.reviewers;
if (!gemini || !gpt) throw new Error("config needs two outside reviewers");

const scores = (n: number) => ({ impression: n, hierarchy: n, imagery: n, spacing: n, clutter: n, distinctiveness: n });
const answer = (phone: number, desktop: number, fix = "Bigger photo") =>
  JSON.stringify({ phoneNote: "p", desktopNote: "d", phone: scores(phone), desktop: scores(desktop), fixes: [fix] });
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
    expect(body.model).toBe("google/gemini-3.1-pro-preview");
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
    expect(Object.keys(schema.properties)).toEqual(["phoneNote", "desktopNote", "phone", "desktop", "fixes"]); // notes first
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
    expect(c.usd).toBeCloseTo((10_000 * 2 + 500 * 12) / 1e6, 10);
    const g = callCost(config, gpt, result("", { prompt_tokens: 10_000, completion_tokens: 500 }), body(gpt.model));
    expect(g.usd).toBeCloseTo((10_000 * 2 + 500 * 10) / 1e6, 10);
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
    expect(out.join("\n")).toMatch(/4 calls/);
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

describe("recordings", () => {
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
});

describe("config", () => {
  it("loads two reviewers, each with a price, apart from the Anthropic prices", () => {
    expect(config.outsideReview.reviewers.map((r) => r.id)).toEqual(["gemini", "gpt"]);
    for (const r of config.outsideReview.reviewers) expect(config.outsideReview.pricesUsdPerMTok[r.model]).toBeDefined();
    expect(config.pricesUsdPerMTok[gemini.model]).toBeUndefined();
  });
});
