import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@sb/config";
import { Brief, ModelClient, generateContent, type ModelRequest, type ModelResponse } from "@sb/engine";
import type { SiteSpec } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { syntheticRecordings } from "../src/synthetic.ts";

/** Content retries as RFC 6902 patches (config costCuts.contentRetryAsPatch), driven through fake transports. */

const here = path.dirname(fileURLToPath(import.meta.url));
const config = loadConfig();
const fixture = loadFixture("pekarna-kvas");
const golden = JSON.parse(await readFile(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
const recs = syntheticRecordings(fixture, golden);
const brief = Brief.parse(JSON.parse(recs.find((r) => r.stage === "brief")!.response.text));
const good = JSON.parse(recs.find((r) => r.stage === "content")!.response.text) as { chrome: unknown; pages: SiteSpec["pages"] };
const HEADLINE = "/pages/0/sections/0/props/headline";
const goodHeadline = (good.pages[0]!.sections[0]!.props as { headline: string }).headline;

/** The golden answer with a phone number the client never gave in the hero's headline: a fact violation. */
function withInventedPhone(): typeof good {
  const bad = structuredClone(good);
  (bad.pages[0]!.sections[0]!.props as { headline: string }).headline = "Pokličite 041 999 888";
  return bad;
}

const answer = (body: unknown, outputTokens = 100): ModelResponse => ({
  text: typeof body === "string" ? body : JSON.stringify(body),
  stopReason: "end_turn",
  model: config.models.content.model,
  usage: { input_tokens: 0, output_tokens: outputTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
});

/** A client whose transport answers the content calls in turn and keeps every request. */
function scripted(answers: ModelResponse[]) {
  const requests: ModelRequest[] = [];
  const client = new ModelClient({
    config,
    spentToday: async () => 0,
    onCall: async () => undefined,
    transport: {
      async send(req) {
        requests.push(structuredClone(req));
        const next = answers.shift();
        if (!next) throw new Error("no answer left");
        return next;
      },
    },
  });
  return { client, requests };
}

const run = (client: ModelClient, retryAsPatch: boolean, retries = 2) =>
  generateContent(client, {
    slug: "pekarna-kvas",
    brief,
    design: golden.design,
    assets: golden.assets,
    scope: "full",
    heroImageIds: [],
    structuredOutput: false,
    retries,
    corpus: fixture.brief.description,
    ...(retryAsPatch ? { retryAsPatch: true } : {}),
  });

const lastUser = (req: ModelRequest) => req.messages.at(-1)!.content as string;
const headlineOf = (spec: SiteSpec) => (spec.pages[0]!.sections[0]!.props as { headline: string }).headline;
const fix = { patches: [{ op: "replace", path: HEADLINE, value: goodHeadline }] };

describe("content retries with the switch off (as on main)", () => {
  it("resends the whole answer and asks for the complete corrected JSON", async () => {
    const first = answer(withInventedPhone());
    const { client, requests } = scripted([first, answer(good)]);
    const r = await run(client, false);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(2);
    expect(r.patchRetries).toBeUndefined();
    expect(requests).toHaveLength(2);
    // The retry is the first request plus the model's own text and the issues, worded as before the switch existed.
    expect(requests[1]!.messages.slice(0, 1)).toEqual(requests[0]!.messages);
    expect(requests[1]!.messages[1]).toEqual({ role: "assistant", content: first.text });
    expect(lastUser(requests[1]!)).toMatch(/^The output failed validation\. Fix every issue and return the complete corrected JSON \(not a diff\):\n- \/pages\/0\/sections\/0\/props\/headline: phone "041 999 888"/);
  });
});

describe("content retries as patches (costCuts.contentRetryAsPatch)", () => {
  it("asks for a patch, applies it in code and validates the result", async () => {
    const { client, requests } = scripted([answer(withInventedPhone(), 3400), answer(fix, 60)]);
    const r = await run(client, true);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(2);
    expect(headlineOf(r.spec)).toBe(goodHeadline);
    expect(r.patchRetries).toEqual(["attempt 2: patch of 1 operation(s) applied, 0 issue(s) left"]);
    const patchReq = requests[1]!;
    // Same first message and system blocks (the cached catalogue), then the answer once and the patch instruction.
    expect(patchReq.system).toEqual(requests[0]!.system);
    expect(patchReq.messages[0]).toEqual(requests[0]!.messages[0]);
    expect(patchReq.messages).toHaveLength(3);
    expect(patchReq.schema).toBeUndefined();
    expect(JSON.parse(patchReq.messages[1]!.content as string).pages[0].sections[0].props.headline).toBe("Pokličite 041 999 888");
    expect(lastUser(patchReq)).toContain("RFC 6902 JSON Patch");
    expect(lastUser(patchReq)).toContain(`- ${HEADLINE}: phone "041 999 888"`);
  });

  it("falls back to the whole-JSON retry when the patch doesn't apply", async () => {
    const bad = { patches: [{ op: "replace", path: "/pages/7/sections/0/props/headline", value: "x" }] };
    const { client, requests } = scripted([answer(withInventedPhone()), answer(bad), answer(good)]);
    const r = await run(client, true);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(3);
    expect(requests.map(lastUser).slice(1).map((t) => (t.includes("RFC 6902") ? "patch" : t.includes("complete corrected JSON") ? "whole" : "?"))).toEqual(["patch", "whole"]);
    expect(r.patchRetries).toHaveLength(1);
    expect(r.patchRetries![0]).toMatch(/^attempt 2: invalid patch: .*; the next retry asks for the whole JSON$/);
    // The fallback refers to the answer once, not to every earlier turn.
    expect(requests[2]!.messages).toHaveLength(3);
  });

  it("falls back to the whole JSON when the answer isn't a patch, and when an applied patch leaves issues", async () => {
    const stillBad = { patches: [{ op: "replace", path: HEADLINE, value: "Pokličite 041 777 666" }] };
    const { client, requests } = scripted([answer(withInventedPhone()), answer("Sorry, I can't."), answer(withInventedPhone()), answer(stillBad), answer(good)]);
    const r = await run(client, true, 4);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(5);
    expect(requests.map((q) => (q.messages.length === 1 ? "first" : lastUser(q).includes("RFC 6902") ? "patch" : "whole"))).toEqual(["first", "patch", "whole", "patch", "whole"]);
    expect(r.patchRetries).toEqual([
      "attempt 2: the patch answer is not valid JSON; the next retry asks for the whole JSON",
      "attempt 4: patch of 1 operation(s) applied, 1 issue(s) left",
    ]);
    // The whole-JSON retry after a patch that left issues starts from the patched answer and its issues.
    expect(lastUser(requests[4]!)).toContain('phone "041 777 666"');
  });

  it("takes a whole answer to a patch request as a whole answer (a replayed recording, or a model that ignores the format)", async () => {
    const { client } = scripted([answer(withInventedPhone()), answer(good)]);
    const r = await run(client, true);
    expect(r.issues).toEqual([]);
    expect(r.attempts).toBe(2);
    expect(r.patchRetries).toEqual(["attempt 2: answered with the whole JSON instead of a patch, 0 issue(s) left"]);
  });

  it("stops at the retry limit and keeps the last built spec with its issues", async () => {
    const bad = { patches: [{ op: "remove", path: "/nothing/here" }] };
    const { client, requests } = scripted([answer(withInventedPhone()), answer(bad), answer(withInventedPhone()), answer(good)]);
    const r = await run(client, true, 2);
    expect(requests).toHaveLength(3);
    expect(r.attempts).toBe(3);
    expect(r.issues.join(" ")).toMatch(/phone "041 999 888"/);
    expect(headlineOf(r.spec)).toBe("Pokličite 041 999 888");

    const none = scripted([answer(withInventedPhone()), answer(fix)]);
    const r0 = await run(none.client, true, 0);
    expect(none.requests).toHaveLength(1);
    expect(r0.issues).not.toEqual([]);
  });

  it("patches the answer as the site uses it: the homepage first, whatever order the model wrote", async () => {
    // A two-page answer with the homepage second: the issue's path (/pages/0/…) is the assembled site's.
    const about = { ...structuredClone(good.pages[0]!), id: "p_o-nas", kind: "standard" as const, slug: "o-nas", nav: { label: "O nas", show: true } };
    about.sections = about.sections.filter((s) => s.type === "about").map((s) => ({ ...s, id: "s_about_o_nas" }));
    const bad = withInventedPhone();
    const twoPages = { chrome: bad.chrome, pages: [about, bad.pages[0]!] };
    const { client, requests } = scripted([answer(twoPages), answer(fix)]);
    const r = await run(client, true);
    expect(r.issues).toEqual([]);
    expect(headlineOf(r.spec)).toBe(goodHeadline);
    expect(JSON.parse(requests[1]!.messages[1]!.content as string).pages.map((p: { kind: string }) => p.kind)).toEqual(["home", "standard"]);
  });
});
