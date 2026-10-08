import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { costEur, loadConfig } from "@sb/config";
import { BatchTransport, ModelClient, type BatchApi, type CallRecord, type ModelRequest, type ModelTransport } from "@sb/engine";
import { toModelJsonSchema, type SiteSpec } from "@sb/spec";
import { SLOVENE_JUDGE_SYSTEM, SloveneJudgeOutput, judgeSlovene, sloveneJudgeMessage, sloveneJudgeRequested, summariseSloveneJudge } from "../src/slovene-judge.ts";
import { lintSpec } from "../src/slovene-lint.ts";
import { sloveneLines, sloveneSummary } from "../src/slovene-report.ts";
import type { FixtureResult } from "../src/runner.ts";

/** The opt-in Slovene judge, with fake transports only: no model call is made here. */
const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const spec = JSON.parse(readFileSync(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
const corpus = (JSON.parse(readFileSync(path.join(here, "../fixtures/pekarna-kvas/brief.json"), "utf8")) as { description: string }).description;
/** The batch request body, from the transport's own API type (the SDK is the engine's dependency, not the eval's). */
type BatchBody = Parameters<BatchApi["create"]>[0];
const usage = { input_tokens: 6_000, output_tokens: 800, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

const answer: SloveneJudgeOutput = {
  grammar: [],
  register: [
    { path: "/pages/0/sections/0/props/primary/label", quote: "Pokliči za naročilo", fix: "Pokličite za naročilo" },
    { path: "/pages/0/sections/4/props/action/label", quote: "Pokliči", fix: "Pokličite" },
  ],
  english: [{ path: "/pages/0/sections/0/props/intro", quote: "fresh testo", fix: "sveže testo" }],
  note: "Naravna slovenščina, le gumbi tikajo.",
};

describe("Slovene judge (opt-in, fake transport)", () => {
  it("is off unless --judge-slovene is given, in every mode", () => {
    for (const args of [[], ["--offline"], ["--replay"], ["--record"], ["--record-missing"], ["--judge"], ["--prompt-fixes", "all"]]) expect(sloveneJudgeRequested(args), args.join(" ")).toBe(false);
    expect(sloveneJudgeRequested(["--replay", "--judge-slovene"])).toBe(true);
  });

  it("sends the site's visible text and the client's text on the judge's stage, with the schema, and counts the quoted errors", async () => {
    const seen: ModelRequest[] = [];
    const calls: CallRecord[] = [];
    const transport: ModelTransport = { send: async (req, stage) => (seen.push(req), { text: JSON.stringify(answer), stopReason: "end_turn", model: stage.model, usage }) };
    const client = new ModelClient({ config, transport, spentToday: async () => 0, onCall: async (r) => void calls.push(r) });
    const r = await judgeSlovene(client, spec, corpus);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.stage).toBe("judge");
    expect(seen[0]!.system).toEqual([SLOVENE_JUDGE_SYSTEM]);
    expect(seen[0]!.schema).toEqual(toModelJsonSchema(SloveneJudgeOutput));
    const msg = seen[0]!.messages[0]!.content as string;
    expect(msg).toBe(sloveneJudgeMessage(spec, corpus));
    expect(msg).toContain("/pages/0/sections/0/props/headline: Kruh z drožmi, ki vzhaja čez noč");
    expect(msg).toContain("Pekarna Kvas je naša mala družinska pekarna");
    expect(msg).not.toContain("p_home");
    expect(r.counts).toEqual({ grammar: 0, register: 2, english: 1 });
    // "fresh testo" is not on the site: an invented quote is counted apart.
    expect(r.unquoted).toBe(1);
    // Priced and logged like every call: tokens and € on the judge's model.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.stage).toBe("judge");
    expect(calls[0]!.costEur).toBeCloseTo(costEur(config, config.models.judge.model, usage), 9);
  });

  it("goes through the run's Message Batch like the vision judge, at the batch price", async () => {
    const created: BatchBody[] = [];
    const api = {
      create: async (body: BatchBody) => (created.push(body), { id: "batch_1", processing_status: "in_progress" }),
      retrieve: async (id: string) => ({ id, processing_status: "ended" }),
      results: async () =>
        (async function* () {
          for (const r of created.at(-1)!.requests)
            yield { custom_id: r.custom_id, result: { type: "succeeded", message: { id: "m", type: "message", role: "assistant", model: r.params.model, content: [{ type: "text", text: JSON.stringify(answer) }], stop_reason: "end_turn", usage } } };
        })(),
    } as unknown as BatchApi;
    const t = new BatchTransport(api, 1);
    let eur = 0;
    const client = new ModelClient({ config, transport: t, spentToday: async () => 0, onCall: async (r) => void (eur += r.costEur) });
    const work = judgeSlovene(client, spec, corpus);
    await t.drain([work]);
    expect((await work).counts.register).toBe(2);
    expect(created).toHaveLength(1);
    expect(created[0]!.requests[0]!.params.model).toBe(config.models.judge.model);
    expect(created[0]!.requests[0]!.params.output_config?.format?.type).toBe("json_schema");
    expect(eur).toBeCloseTo(costEur(config, config.models.judge.model, usage) * config.batchPriceFactor, 9);
  });

  it("rejects an answer outside the schema", () => {
    expect(() => SloveneJudgeOutput.parse({ ...answer, extra: 1 })).toThrow();
    expect(summariseSloveneJudge(spec, { ...answer, english: [] }).unquoted).toBe(0);
  });
});

describe("the report's Slovene section", () => {
  const result = (id: string, extra: Partial<FixtureResult> = {}) => ({ id, slovene: { generated: lintSpec(spec, corpus) }, ...extra }) as FixtureResult;

  it("lists the lint per site and per rule, report only", () => {
    const lines = sloveneLines([result("pekarna-kvas")]).join("\n");
    expect(lines).toContain("## Slovene copy");
    expect(lines).toContain("| pekarna-kvas | 47 | 2 | ti-form 2 | vi 3 / ti 2 (mixed) | — | — |");
    expect(lines).toContain("| ti-form: informal (ti) address; visitors are addressed with vi | 2 | 1 | 0 |");
    expect(lines).toContain("ti-form „Pokliči“ in „Pokliči za naročilo“");
    expect(lines).not.toContain("### Slovene judge");
    expect(sloveneSummary([result("pekarna-kvas")]).join("\n")).toContain("**2** findings on 1 of 1 sites (ti-form 2); 1 site mix vi and ti; 0 more echo the client's own text; em dashes 0 (count only)");
  });

  it("adds the judge's counts only when it ran", () => {
    const judged = result("pekarna-kvas", { sloveneJudge: summariseSloveneJudge(spec, answer), sloveneJudgeEur: 0.012 });
    const lines = sloveneLines([judged]).join("\n");
    expect(lines).toContain("### Slovene judge");
    expect(lines).toContain("| pekarna-kvas | 0 | 2 | 1 | 1 |");
    expect(sloveneSummary([judged]).join("\n")).toContain("Slovene judge (--judge-slovene): grammar 0, register 2, English 1 errors on 1 sites (1 quotes not found on the site; €0.012)");
    expect(sloveneLines([{ id: "x" } as FixtureResult])).toEqual([]);
  });
});
