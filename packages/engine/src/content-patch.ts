/**
 * Content retries as RFC 6902 patches (config costCuts.contentRetryAsPatch, docs/plans/cost-cuts.md item 7). A content
 * answer that still fails validation after the code repairs is fixed by a short patch from the model (≈ 300 output
 * tokens) instead of the whole JSON again (3–5k). The patch is applied here, in code, to the answer as the site uses
 * it; generateContent validates the result and falls back to the whole-JSON retry when it doesn't apply or still fails.
 */
import type Anthropic from "@anthropic-ai/sdk";
import jsonpatch, { type Operation } from "fast-json-patch";
import { z } from "zod";
import type { SiteSpec } from "@sb/spec";
import { extractJson, type ModelResponse } from "./llm/client.ts";
import { EditOutput } from "./prompts.ts";

/** The whole-JSON retry's instruction, as generateContent words it with the switch off. */
export function wholeRetryInstruction(issues: string[]): string {
  return `The output failed validation. Fix every issue and return the complete corrected JSON (not a diff):\n${issues.map((i) => `- ${i}`).join("\n")}`;
}

/** The patch-retry instruction: the issues, and the answer format (the same op shape as the critique and edits). */
export function contentPatchInstruction(issues: string[]): string {
  return `The output failed validation. Fix every issue below with an RFC 6902 JSON Patch against the JSON object above (your answer as the site uses it; the paths in the issues point into it). Change nothing else; never add a fact that isn't in the brief: use a placeholder or remove the item.
${issues.map((i) => `- ${i}`).join("\n")}
Answer with JSON only, no prose around it:
{"patches": [{"op": "replace", "path": "/pages/0/sections/1/props/title", "value": "..."}]}`;
}

/**
 * What a patch is applied to: the parsed answer after the code repairs, with the model's pages as assembleSpec placed
 * them (homepage first, sections it drops left out), so the issues' spec paths (/pages/i/sections/j/…, /chrome/…) point
 * at the same places. An answer that didn't build a spec (its schema failed) is patched as it is: its issue paths are its own.
 */
export function patchBase(data: unknown, spec: SiteSpec | undefined): unknown {
  if (!spec || !data || typeof data !== "object" || !("chrome" in data)) return structuredClone(data);
  const pages = spec.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  return structuredClone({ chrome: (data as { chrome: unknown }).chrome, pages });
}

const PatchAnswer = z.union([EditOutput.shape.patches, z.object({ patches: EditOutput.shape.patches })]);

/** A patch-retry answer: the operations, a whole content object (the model answered with the JSON again), or why neither. */
export type PatchAnswer = { ops: Operation[] } | { whole: unknown } | { error: string };

export function readPatchAnswer(text: string): PatchAnswer {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    return { error: "the patch answer is not valid JSON" };
  }
  // A whole answer instead of a patch (or a replayed recording of one): validated as a whole answer.
  if (data && typeof data === "object" && !Array.isArray(data) && "pages" in data) return { whole: data };
  const parsed = PatchAnswer.safeParse(data);
  if (!parsed.success) return { error: `the patch answer is not a JSON Patch: ${parsed.error.issues[0]?.message ?? "unknown shape"}` };
  const ops = (Array.isArray(parsed.data) ? parsed.data : parsed.data.patches) as Operation[];
  return ops.length ? { ops } : { error: "the patch is empty" };
}

/** Applies `ops` to a copy of `base`. Never mutates `base`. */
export function applyContentPatch(base: unknown, ops: Operation[]): { data: unknown } | { error: string } {
  const invalid = jsonpatch.validate(ops, base);
  if (invalid) return { error: `invalid patch: ${firstLine(invalid.message)} (${invalid.operation?.op} ${invalid.operation?.path})` };
  try {
    return { data: jsonpatch.applyPatch(structuredClone(base), ops, true, false).newDocument };
  } catch (e) {
    return { error: `patch failed: ${firstLine((e as Error).message)}` };
  }
}

/** fast-json-patch's messages go on to print the operation and the whole document. */
const firstLine = (message: string) => message.split("\n")[0]!.slice(0, 200);

/** One answer checked by generateContent: its issues, and the spec it built when its schema passed. */
export interface Evaluated {
  issues: string[];
  built?: { spec: SiteSpec; repairs: string[] };
}

export interface PatchLoopDeps {
  /**
   * One content call: the first user message (the caller's), then `tail`. "patch" calls go without the content
   * schema (their answer is a patch); "whole" calls are the content call as with the switch off.
   */
  call(tail: Anthropic.MessageParam[], kind: "whole" | "patch"): Promise<ModelResponse>;
  /** Repairs `data` in place, assembles and validates it; throws on a shape assembly can't take. */
  evaluate(data: unknown): Evaluated;
  /** Paid retries after the first answer (config limits.contentRetries). */
  retries: number;
}

export interface PatchLoopResult {
  /** The last spec any answer built, with that answer's issues and repairs. */
  spec?: SiteSpec;
  specIssues: string[];
  specRepairs: string[];
  attempts: number;
  lastIssues: string[];
  /** One line per patch retry: what it did (for the job's log). */
  notes: string[];
}

/**
 * The content attempts with patch retries. After a whole answer with issues, the next attempt asks for a patch against
 * that answer (as patchBase places it); after a patch that doesn't parse, doesn't apply or leaves issues, the next one
 * asks for the whole JSON again. Every attempt is one paid call, `retries` + 1 in all. A retry sends the first message,
 * the latest answer once (not every earlier one) and its issues.
 */
export async function patchRetryLoop(deps: PatchLoopDeps): Promise<PatchLoopResult> {
  const out: PatchLoopResult = { specIssues: [], specRepairs: [], attempts: 0, lastIssues: [], notes: [] };
  /** What the next retry refers to: the latest answer (as patchBase places it, or its raw text) and its issues. */
  let prev: { text: string; issues: string[]; base?: unknown } | undefined;
  let next: "whole" | "patch" = "whole";
  /** Checks one answer; keeps the spec it built. Undefined when it doesn't assemble. */
  const take = (data: unknown): Evaluated | undefined => {
    try {
      const r = deps.evaluate(data);
      if (r.built) {
        out.spec = r.built.spec;
        out.specIssues = r.issues;
        out.specRepairs = r.built.repairs;
      }
      return r;
    } catch {
      return undefined;
    }
  };
  /** The answer the next retry refers to. */
  const refer = (data: unknown, r: Evaluated) => {
    const base = patchBase(data, r.built?.spec);
    prev = { text: JSON.stringify(base), issues: r.issues, base };
    out.lastIssues = r.issues;
  };
  for (;;) {
    out.attempts++;
    const kind = next;
    const tail: Anthropic.MessageParam[] = prev
      ? [
          { role: "assistant", content: prev.text },
          { role: "user", content: kind === "patch" ? contentPatchInstruction(prev.issues) : wholeRetryInstruction(prev.issues) },
        ]
      : [];
    const res = await deps.call(tail, kind);
    let patchFailed = false;
    if (kind === "patch") {
      const answer = readPatchAnswer(res.text);
      const applied = "ops" in answer ? applyContentPatch(prev!.base, answer.ops) : undefined;
      const data = applied ? ("data" in applied ? applied.data : undefined) : "whole" in answer ? answer.whole : undefined;
      const r = data === undefined ? undefined : take(data);
      if (r) {
        refer(data, r);
        // A patch that leaves issues: the next retry asks for the whole JSON. A whole answer counts as one.
        patchFailed = "ops" in answer && r.issues.length > 0;
        const what = "ops" in answer ? `patch of ${answer.ops.length} operation(s) applied` : "answered with the whole JSON instead of a patch";
        out.notes.push(`attempt ${out.attempts}: ${what}, ${r.issues.length} issue(s) left`);
      } else {
        patchFailed = true;
        const why = "error" in answer ? answer.error : applied && "error" in applied ? applied.error : "the answer doesn't assemble";
        out.notes.push(`attempt ${out.attempts}: ${why}; the next retry asks for the whole JSON`);
      }
    } else {
      let data: unknown;
      try {
        data = JSON.parse(extractJson(res.text));
      } catch {
        data = undefined;
      }
      const r = data === undefined ? undefined : take(data);
      if (r) refer(data, r);
      else {
        out.lastIssues = ["Output is not valid JSON."];
        prev = { text: res.text, issues: out.lastIssues };
      }
    }
    if (out.lastIssues.length === 0 && out.spec) return out;
    if (out.attempts > deps.retries) return out;
    next = !patchFailed && prev?.base !== undefined ? "patch" : "whole";
  }
}
