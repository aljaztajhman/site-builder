import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "@sb/config";
import { main } from "../src/outside-review-cli.ts";
import { RecordedTransport, requestHash, type ChatBody, type ChatResult, type OutsideTransport } from "../src/outside-transport.ts";
import {
  SHEET_MAX_PIXELS,
  buildSet,
  buildSetRequest,
  buildSheets,
  formatSets,
  loadSetPages,
  parseSetAnswer,
  parseSetArg,
  planSets,
  planSheet,
  runSets,
  setParts,
  writeSetOutputs,
} from "../src/set-review.ts";

const config = loadConfig();
const reviewers = config.outsideReview.reviewers;
const [gemini, gpt] = reviewers;
if (!gemini || !gpt) throw new Error("config needs the outside reviewers");

let dir: string;
const png = (w: number, h: number, bg = "#336699") => sharp({ create: { width: w, height: h, channels: 3, background: bg } }).png().toBuffer();

/** A directory of n pages named `<id>-1280-first.png` / `<id>-360-first.png`. */
async function makeDir(name: string, n: number, style: "first" | "poc" = "first"): Promise<string> {
  const d = path.join(dir, name);
  mkdirSync(d, { recursive: true });
  for (let i = 0; i < n; i++) {
    const id = `page-${String(i + 1).padStart(2, "0")}`;
    const shade = (40 + ((i * 7) % 200)).toString(16).padStart(2, "0");
    writeFileSync(path.join(d, `${id}-${style === "first" ? "1280-first" : "desk"}.png`), await png(1280, 800, `#${shade}6699`));
    writeFileSync(path.join(d, `${id}-${style === "first" ? "360-first" : "phone"}.png`), await png(360, 800, `#99${shade}33`));
  }
  return d;
}
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "set-review-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const verdict = (overall: number, variety: number) =>
  JSON.stringify({
    sameness: "Every hero is a big photo left, text right.",
    recurringIssues: ["Thin grey body text"],
    overall,
    variety,
    best: [{ id: "page-01", why: "Distinct type" }],
    weakest: [{ id: "page-03", why: "Generic" }],
    oneChange: "Vary the hero composition.",
    summary: "A competent but uniform set.",
  });
const result = (content: string, usage?: ChatResult["usage"]): ChatResult => ({ content, ...(usage ? { usage } : {}) });
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

describe("pages of a set", () => {
  it("reads <id>-1280-first/<id>-360-first, the studio-poc names, an eval run's subdirectories and a manifest", async () => {
    expect(loadSetPages(await makeDir("first", 3)).map((p) => p.id)).toEqual(["page-01", "page-02", "page-03"]);
    expect(loadSetPages(await makeDir("poc", 2, "poc")).map((p) => p.id)).toEqual(["page-01", "page-02"]);

    const run = path.join(dir, "run");
    for (const id of ["zeta", "alfa"]) {
      mkdirSync(path.join(run, id), { recursive: true });
      writeFileSync(path.join(run, id, "home-1280-first.png"), await png(1280, 800));
      writeFileSync(path.join(run, id, "home-360-first.png"), await png(360, 800));
    }
    expect(loadSetPages(run).map((p) => p.id)).toEqual(["alfa", "zeta"]);

    const manifest = path.join(dir, "manifest.json");
    const poc = path.join(dir, "poc");
    writeFileSync(manifest, JSON.stringify([{ id: "custom", desk: "poc/page-01-desk.png", phone: "poc/page-01-phone.png" }]));
    expect(loadSetPages(manifest)).toEqual([{ id: "custom", desk: path.join(poc, "page-01-desk.png"), phone: path.join(poc, "page-01-phone.png") }]);
  });

  it("joins a comma-separated list, drops today's pages, and refuses repeats, missing screens and bad names", async () => {
    const a = await makeDir("list-a", 2);
    const b = path.join(dir, "list-b");
    mkdirSync(b, { recursive: true });
    writeFileSync(path.join(b, "other-desk.png"), await png(1280, 800));
    writeFileSync(path.join(b, "other-phone.png"), await png(360, 800));
    writeFileSync(path.join(b, "other-today-desk.png"), await png(1280, 800));
    writeFileSync(path.join(b, "other-today-phone.png"), await png(360, 800));
    expect(loadSetPages(`${a},${b}`).map((p) => p.id)).toEqual(["other", "page-01", "page-02"]);
    expect(() => loadSetPages(`${a},${a}`)).toThrow(/given twice: page-01, page-02/);
    expect(loadSetPages(`today:${b}`).map((p) => [p.id, path.basename(p.desk)])).toEqual([["other", "other-today-desk.png"]]);
    expect(() => loadSetPages(`today:${path.join(b, "other-desk.png")}`)).toThrow(/needs a directory/);

    const lone = path.join(dir, "lone");
    mkdirSync(lone, { recursive: true });
    writeFileSync(path.join(lone, "x-desk.png"), await png(1280, 800));
    expect(() => loadSetPages(lone)).toThrow(/x has no phone screenshot/);
    expect(() => loadSetPages(path.join(dir, "nope"))).toThrow(/not found/);

    expect(parseSetArg("fresh=a,b")).toEqual({ name: "fresh", source: "a,b" });
    expect(() => parseSetArg("no-equals")).toThrow(/--set needs/);
    expect(() => parseSetArg("=x")).toThrow(/--set needs/);
  });
});

describe("contact sheets", () => {
  it("plans 10 pages as one desktop grid of 4 columns and one phone grid of 6, each within the pixel cap", () => {
    const desk = planSheet(10, "desk");
    expect(desk.cols).toBe(4);
    expect(desk.tileW).toBe(480);
    expect(desk.sheets).toHaveLength(1);
    expect(desk.width * desk.heights[0]!).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
    const phone = planSheet(10, "phone");
    expect(phone.cols).toBe(6);
    expect(phone.tileW).toBe(200);
    expect(phone.sheets).toHaveLength(1);
    expect(phone.width * phone.heights[0]!).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
  });

  it("shrinks the tiles for more pages, then adds sheets; every sheet stays within the cap and every page is on one", () => {
    for (const n of [1, 3, 20, 30, 50, 120]) {
      for (const kind of ["desk", "phone"] as const) {
        const p = planSheet(n, kind);
        expect(p.sheets.flat(), `${n} ${kind}`).toEqual(Array.from({ length: n }, (_, i) => i));
        p.heights.forEach((h) => expect(p.width * h, `${n} ${kind}`).toBeLessThanOrEqual(SHEET_MAX_PIXELS));
        expect(p.tileW).toBeGreaterThanOrEqual(kind === "desk" ? 299 : 139);
      }
    }
    expect(planSheet(50, "desk").sheets.length).toBeGreaterThan(1);
    expect(planSheet(20, "desk").tileW).toBeLessThan(480);
    expect(planSheet(3, "desk").cols).toBe(3);
  });

  it("builds JPEG sheets with every page's tile, the size the plan said, and the ids in reading order", async () => {
    const pages = loadSetPages(await makeDir("sheets", 7));
    const [desk] = await buildSheets(pages, "desk");
    const [phone] = await buildSheets(pages, "phone");
    for (const [sheet, kind] of [[desk!, "desk"], [phone!, "phone"]] as const) {
      const meta = await sharp(sheet.jpeg).metadata();
      expect(meta.format).toBe("jpeg");
      expect(meta.width! * meta.height!).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
      expect(meta.width).toBe(sheet.width);
      expect(meta.height).toBe(sheet.height);
      expect(sheet.ids).toEqual(pages.map((p) => p.id));
      expect(sheet.kind).toBe(kind);
    }
    // 7 pages: 2 rows of 4 on the desktop sheet, 2 rows of 6 on the phone sheet.
    const dp = planSheet(7, "desk");
    expect(desk!.height).toBe(dp.heights[0]);
    expect(Math.ceil(7 / dp.cols)).toBe(2);
    // A label strip under the first tile: dark text pixels on white (the page tiles are blue, the strip is not).
    const raw = await sharp(desk!.jpeg).raw().toBuffer({ resolveWithObject: true });
    const row = 8 + dp.tileH + Math.floor(dp.labelH / 2);
    let dark = 0;
    for (let x = 8; x < 8 + dp.tileW; x++) {
      const i = (row * raw.info.width + x) * raw.info.channels;
      if (raw.data[i]! < 90 && raw.data[i + 1]! < 90) dark++;
    }
    expect(dark).toBeGreaterThan(0);
  });

  it("splits 50 pages over several sheets under the cap, no page twice", async () => {
    const pages = loadSetPages(await makeDir("fifty", 50));
    const sheets = await buildSheets(pages, "desk");
    expect(sheets.length).toBeGreaterThan(1);
    expect(sheets.flatMap((s) => s.ids)).toEqual(pages.map((p) => p.id));
    for (const s of sheets) expect(s.width * s.height).toBeLessThanOrEqual(SHEET_MAX_PIXELS);
  }, 60_000);
});

describe("answer", () => {
  it("parses the verdict (a fence is tolerated) and rejects a wrong shape, a score out of range and extra keys", () => {
    expect(parseSetAnswer(verdict(3, 2))).toMatchObject({ overall: 3, variety: 2, best: [{ id: "page-01" }] });
    expect(parseSetAnswer(`\`\`\`json\n${verdict(4, 4)}\n\`\`\``).overall).toBe(4);
    expect(() => parseSetAnswer(verdict(6, 2))).toThrow();
    expect(() => parseSetAnswer(verdict(3, 0))).toThrow();
    expect(() => parseSetAnswer("{}")).toThrow();
    expect(() => parseSetAnswer(JSON.stringify({ ...JSON.parse(verdict(3, 3)), extra: 1 }))).toThrow();
    expect(() => parseSetAnswer(JSON.stringify({ ...JSON.parse(verdict(3, 3)), best: [1, 2, 3, 4].map((i) => ({ id: `p${i}`, why: "x" })) }))).toThrow();
  });
});

describe("request", () => {
  it("is one user message with the page ids, the desktop sheet and the phone sheet, a strict schema, and no model name", async () => {
    const set = await buildSet("fresh", loadSetPages(await makeDir("req", 5)));
    const body = buildSetRequest(gemini, setParts(set.name, set.pages, set.desk, set.phone));
    expect(body.model).toBe(gemini.model);
    expect(body.messages).toHaveLength(2);
    const user = body.messages[1]!.content as { type: string; text?: string }[];
    expect(user.filter((p) => p.type === "image_url")).toHaveLength(2);
    expect(user[0]!.text).toContain("page-01, page-02, page-03, page-04, page-05");
    const text = JSON.stringify(body.messages);
    expect(text).toContain("senior design director");
    expect(text).toContain("judge the SET".replace("judge", "Judge"));
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true } });
    const json = buildSetRequest({ ...gemini, structured: "json_object" }, setParts(set.name, set.pages, set.desk, set.phone));
    expect(json.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(json.messages[0])).toContain("JSON schema");
    // The same set asked of the same model has the same hash.
    expect(requestHash(body)).toBe(requestHash(buildSetRequest(gemini, setParts(set.name, set.pages, set.desk, set.phone))));
  });
});

describe("price", () => {
  it("estimates one call per reviewer per set from the sheets, without a transport", async () => {
    const small = await buildSet("small", loadSetPages(await makeDir("price-small", 10)));
    const big = await buildSet("big", loadSetPages(await makeDir("price-big", 50)));
    const plan = planSets({ config, reviewers, sets: [small, big] });
    expect(plan.calls).toBe(2 * reviewers.length);
    expect(plan.images).toBe(reviewers.length * (small.desk.length + small.phone.length + big.desk.length + big.phone.length));
    expect(plan.eur).toBeGreaterThan(0);
    expect(Object.keys(plan.byReviewer)).toEqual(reviewers.map((r) => r.id));
    expect(plan.bySet.big!.eur).toBeGreaterThan(plan.bySet.small!.eur);
    expect(plan.eur).toBeCloseTo(plan.bySet.small!.eur + plan.bySet.big!.eur, 8);
  }, 60_000);

  it("the CLI's --dry-run prices the sets, calls nothing and needs no key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const a = await makeDir("cli-a", 4);
    const b = await makeDir("cli-b", 6, "poc");
    const out: string[] = [];
    const code = await main(["--set", `a=${a}`, "--set", `b=${b}`, "--dry-run"], {}, (l) => out.push(l));
    expect(code).toBe(0);
    expect(out.join("\n")).toMatch(/Dry run: 2 sets \(a: 4 pages, 2 sheets, €[\d.]+; b: 6 pages, 2 sheets/);
    expect(out.join("\n")).toMatch(new RegExp(`${2 * reviewers.length} calls`));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("refuses --set with a per-page source, a bad --set, and a live run without --max-eur", async () => {
    const a = await makeDir("cli-c", 2);
    const out: string[] = [];
    expect(await main(["--set", `a=${a}`, "--run-dir", a, "--dry-run"], {}, (l) => out.push(l))).toBe(2);
    expect(await main(["--set", "nonsense", "--dry-run"], {}, (l) => out.push(l))).toBe(1);
    expect(await main(["--set", `a=${a}`], {}, (l) => out.push(l))).toBe(2);
    expect(out.join("\n")).toMatch(/--max-eur/);
  });
});

describe("run", () => {
  it("asks each reviewer once per set, books the cost, and writes the verdicts, the sheets and sets.md", async () => {
    const sets = [await buildSet("one", loadSetPages(await makeDir("run-1", 4))), await buildSet("two", loadSetPages(await makeDir("run-2", 3)))];
    const transport = scripted(
      result(verdict(3, 2), { prompt_tokens: 6000, completion_tokens: 400, cost: 0.02 }),
      result(verdict(4, 3), { prompt_tokens: 6000, completion_tokens: 400, cost: 0.02 }),
    );
    const costs: { itemId: string; eur: number }[] = [];
    const run = await runSets({ config, reviewers: [gemini], sets, transport, maxEur: 5, onCost: (c) => costs.push({ itemId: c.itemId, eur: c.eur }) });
    expect(transport.calls).toHaveLength(2);
    expect(run.calls).toBe(2);
    expect(costs.map((c) => c.itemId)).toEqual(["set:one", "set:two"]);
    expect(run.spentEur).toBeGreaterThan(0);
    expect(run.results.gemini!.one).toMatchObject({ status: "ok", answer: { overall: 3 } });

    const out = path.join(dir, "run-out");
    const md = writeSetOutputs({ out, reviewers: [gemini], sets, run });
    expect(existsSync(path.join(out, "sets/one/gemini.json"))).toBe(true);
    expect(existsSync(path.join(out, "sets/one/desk-1.jpg"))).toBe(true);
    expect(existsSync(path.join(out, "sets/two/phone-1.jpg"))).toBe(true);
    expect(JSON.parse(readFileSync(path.join(out, "sets/two/gemini.json"), "utf8"))).toMatchObject({ set: "two", reviewer: "gemini", status: "ok", pages: ["page-01", "page-02", "page-03"], answer: { variety: 3 } });
    expect(readFileSync(path.join(out, "sets.md"), "utf8")).toBe(md);
    expect(md).toContain("| one | 4 | 3 / 2 |");
    expect(md).toContain("Vary the hero composition.");
  }, 60_000);

  it("asks again after an invalid answer, then fails the set with no made-up verdict", async () => {
    const sets = [await buildSet("s", loadSetPages(await makeDir("retry", 3)))];
    const good = scripted(result("not json"), result(verdict(4, 4)));
    const ok = await runSets({ config, reviewers: [gemini], sets, transport: good, maxEur: 5, onCost: () => undefined });
    expect(good.calls).toHaveLength(2);
    expect(good.calls[1]!.messages.at(-1)!.content).toMatch(/not valid/);
    expect(ok.results.gemini!.s!.status).toBe("ok");
    const bad = await runSets({ config, reviewers: [gemini], sets, transport: scripted(result("no"), result("still no")), maxEur: 5, onCost: () => undefined });
    expect(bad.results.gemini!.s).toMatchObject({ status: "failed" });
    const boom = await runSets({ config, reviewers: [gemini], sets, transport: scripted(new Error("boom")), maxEur: 5, onCost: () => undefined });
    expect(boom.results.gemini!.s).toEqual({ status: "failed", reason: "boom" });
    expect(formatSets({ reviewers: [gemini], sets, run: bad })).toContain("Failed: invalid answer");
  }, 60_000);

  it("stops before a call that would go over --max-eur and skips the rest", async () => {
    const sets = [await buildSet("a", loadSetPages(await makeDir("budget-a", 3))), await buildSet("b", loadSetPages(await makeDir("budget-b", 3)))];
    const transport = scripted(result(verdict(3, 3)));
    const run = await runSets({ config, reviewers: [gemini], sets, transport, maxEur: 0.0001, onCost: () => undefined });
    expect(transport.calls).toHaveLength(0);
    expect(run.stoppedByBudget).toBe(true);
    expect(run.results.gemini).toEqual({ a: { status: "skipped" }, b: { status: "skipped" } });
  }, 60_000);

  it("replays a recording for € 0 with no key: the recorded verdict comes back and is booked at nothing", async () => {
    const sets = [await buildSet("replayed", loadSetPages(await makeDir("replay", 3)))];
    const rec = path.join(dir, "recordings");
    const body = buildSetRequest(gpt, setParts(sets[0]!.name, sets[0]!.pages, sets[0]!.desk, sets[0]!.phone));
    mkdirSync(rec, { recursive: true });
    writeFileSync(path.join(rec, `${requestHash(body)}.json`), JSON.stringify({ content: verdict(2, 1), usage: { prompt_tokens: 5000, completion_tokens: 300, cost: 0.05 } }));
    const lines: number[] = [];
    const run = await runSets({ config, reviewers: [gpt], sets, transport: new RecordedTransport(rec, "replay"), maxEur: Number.POSITIVE_INFINITY, onCost: (c) => lines.push(c.eur) });
    expect(run.results.gpt!.replayed).toMatchObject({ status: "ok", answer: { overall: 2, variety: 1 } });
    expect(run.spentEur).toBe(0);
    expect(lines).toEqual([0]);
  }, 60_000);

  it("the CLI's --replay answers from the recordings and writes sets.md, with no key and no network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const a = await makeDir("cli-replay", 3);
    const set = await buildSet("only", loadSetPages(a));
    const rec = path.join(dir, "cli-recordings");
    mkdirSync(rec, { recursive: true });
    for (const r of reviewers) writeFileSync(path.join(rec, `${requestHash(buildSetRequest(r, setParts(set.name, set.pages, set.desk, set.phone)))}.json`), JSON.stringify({ content: verdict(3, 3) }));
    const out = path.join(dir, "cli-out");
    const lines: string[] = [];
    const code = await main(["--set", `only=${a}`, "--replay", rec, "--out", out], {}, (l) => lines.push(l));
    expect(code).toBe(0);
    expect(lines.join("\n")).toMatch(new RegExp(`${reviewers.length} calls, €0.0000 spent`));
    const md = readFileSync(path.join(out, "sets.md"), "utf8");
    expect(md).toContain("# Whole-set review");
    for (const r of reviewers) expect(existsSync(path.join(out, "sets/only", `${r.id}.json`))).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  }, 60_000);
});
