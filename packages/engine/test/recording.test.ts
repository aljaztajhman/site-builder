import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { RecordMissingTransport, RecordingTransport, loadRecordings, requestHash, type ModelRequest, type ModelResponse, type ModelTransport, type Recording } from "../src/index.ts";

/** `pnpm eval --record-missing` (it-eval-record-missing): unchanged requests replay, changed ones are paid and recorded, in place. */
const config = loadConfig();
const stage = (name: ModelRequest["stage"]) => config.models[name];
const req = (s: ModelRequest["stage"], text: string): ModelRequest => ({ stage: s, system: ["sys"], messages: [{ role: "user", content: text }] });
const answer = (text: string): ModelResponse => ({ text, stopReason: "end_turn", model: "m", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });

/** The "API": answers `live:<prompt>` and counts calls. */
function api(): ModelTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async send(r) {
      const text = r.messages[0]!.content as string;
      calls.push(`${r.stage}:${text}`);
      return answer(`live:${text}`);
    },
  };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "sb-record-missing-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A first run, fully recorded: brief, design, content, critique. */
async function recordFirstRun(): Promise<void> {
  const t = new RecordingTransport(api(), dir);
  for (const [s, text] of [["brief", "b"], ["design", "d"], ["content", "c"], ["critique", "k"]] as const) await t.send(req(s, text), stage(s));
}

describe("RecordMissingTransport", () => {
  it("replays a call whose request hash matches the recording, without calling the API", async () => {
    await recordFirstRun();
    const live = api();
    const t = new RecordMissingTransport(live, dir);
    const r = await t.send(req("brief", "b"), stage("brief"));
    expect(r.text).toBe("live:b");
    expect(live.calls).toEqual([]);
    expect(t.stats).toEqual({ replayed: 1, recorded: 0 });
  });

  it("calls the API for a changed request and records it; the stages after it miss too and are recorded", async () => {
    await recordFirstRun();
    const live = api();
    const t = new RecordMissingTransport(live, dir);
    await t.send(req("brief", "b"), stage("brief"));
    await t.send(req("design", "d"), stage("design"));
    // The content prompt changed, so the critique (it reads the new content) changes too.
    expect((await t.send(req("content", "c2"), stage("content"))).text).toBe("live:c2");
    expect((await t.send(req("critique", "k2"), stage("critique"))).text).toBe("live:k2");
    t.finish();
    expect(live.calls).toEqual(["content:c2", "critique:k2"]);
    expect(t.stats).toEqual({ replayed: 2, recorded: 2 });
    const recs = loadRecordings(dir);
    expect(recs.map((r) => [r.seq, r.stage, r.response.text])).toEqual([
      [0, "brief", "live:b"],
      [1, "design", "live:d"],
      [2, "content", "live:c2"],
      [3, "critique", "live:k2"],
    ]);
    expect(recs[2]!.hash).toBe(requestHash(req("content", "c2"), stage("content").model));
    expect(recs.every((r) => r.origin === "recorded")).toBe(true);
  });

  it("rewrites the fixture's files in place: no wipe up front, leftovers of a longer run removed at the end, home/ kept", async () => {
    await recordFirstRun();
    // A longer earlier run left a second critique; the homepage replays live in home/.
    const extra: Recording = { seq: 4, stage: "critique", model: "m", hash: "old", origin: "recorded", response: answer("old") };
    writeFileSync(path.join(dir, "004-critique.json"), JSON.stringify(extra));
    mkdirSync(path.join(dir, "home"));
    writeFileSync(path.join(dir, "home", "000-classify.json"), "{}");

    const t = new RecordMissingTransport(api(), dir);
    await t.send(req("brief", "b"), stage("brief"));
    // Mid-run nothing was deleted yet: a run that stops here keeps every earlier answer on disk.
    expect(readdirSync(dir).sort()).toEqual(["000-brief.json", "001-design.json", "002-content.json", "003-critique.json", "004-critique.json", "home"]);
    await t.send(req("design", "d"), stage("design"));
    await t.send(req("content", "c"), stage("content"));
    await t.send(req("critique", "k"), stage("critique"));
    t.finish();
    expect(readdirSync(dir).sort()).toEqual(["000-brief.json", "001-design.json", "002-content.json", "003-critique.json", "home"]);
    expect(readdirSync(path.join(dir, "home"))).toEqual(["000-classify.json"]);
    // The replayed files are the same answers, renumbered in this run's call order.
    expect((JSON.parse(readFileSync(path.join(dir, "002-content.json"), "utf8")) as Recording).response.text).toBe("live:c");
  });

  it("numbers calls in the order they are asked when stages run side by side, and records into an empty folder", async () => {
    const live = api();
    const t = new RecordMissingTransport(live, path.join(dir, "new"));
    await Promise.all([t.send(req("brief", "b"), stage("brief")), t.send(req("altText", "a"), stage("altText"))]);
    t.finish();
    expect(loadRecordings(path.join(dir, "new")).map((r) => `${r.seq}-${r.stage}`)).toEqual(["0-brief", "1-altText"]);
    expect(t.stats).toEqual({ replayed: 0, recorded: 2 });
  });

  it("a synthetic recording never matches: it is paid and replaced by a real one", async () => {
    const synthetic: Recording = { seq: 0, stage: "brief", model: "synthetic", hash: "synthetic", origin: "synthetic", response: answer("synthetic") };
    writeFileSync(path.join(dir, "000-brief.json"), JSON.stringify(synthetic));
    const live = api();
    const t = new RecordMissingTransport(live, dir);
    expect((await t.send(req("brief", "b"), stage("brief"))).text).toBe("live:b");
    t.finish();
    expect(loadRecordings(dir).map((r) => r.origin)).toEqual(["recorded"]);
  });
});
