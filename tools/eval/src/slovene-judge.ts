/**
 * Opt-in Slovene judge for the eval (HQ it-slovene-copy): a model reads the site's visible text and lists its
 * grammar, register and English-word errors, each with the exact quote. Eval only, never part of generation, and
 * never on by default: `pnpm eval … --judge-slovene` (a real model call per site, priced and logged like the vision
 * judge and sent in the same Message Batch). The free, deterministic counterpart is slovene-lint.ts.
 *
 * It runs on the judge's model stage (config models.judge). The counts are the lengths of the lists; quotes not found
 * word for word in the site's text are counted apart (`unquoted`), so an invented error can't pass as a real one.
 */
import { z } from "zod";
import type { ModelClient } from "@sb/engine";
import { toModelJsonSchema, type SiteSpec } from "@sb/spec";
import { visibleStrings } from "./slovene-lint.ts";

const SloveneError = z.strictObject({
  /** The line's path, as given in the message. */
  path: z.string().max(120),
  /** The wrong text exactly as it is on the site, as short as still identifies it. */
  quote: z.string().max(200),
  /** The corrected Slovene. */
  fix: z.string().max(200),
});
export const SloveneJudgeOutput = z.strictObject({
  grammar: z.array(SloveneError).max(40),
  register: z.array(SloveneError).max(40),
  english: z.array(SloveneError).max(40),
  /** One sentence on how natural the Slovene reads overall. */
  note: z.string().max(300),
});
export type SloveneJudgeOutput = z.infer<typeof SloveneJudgeOutput>;
export type SloveneErrorKind = "grammar" | "register" | "english";
export const SLOVENE_ERROR_KINDS: SloveneErrorKind[] = ["grammar", "register", "english"];

export const SLOVENE_JUDGE_SYSTEM = `You are a native Slovene copy editor. You get the visible text of a website generated for a Slovenian small business, one line per text field ("path: text"), and the owner's own description of the business. List the real errors in the site's text, in three kinds:
- grammar: wrong case, number or gender agreement, wrong verb forms (including mixes such as "sem dodali"), wrong s/z or k/h, misspellings, word order no Slovene speaker would use.
- register: anything that breaks formal address in the plural: ti forms ("pokliči", "tvoj", "boš"), the dual for "we and you" ("skupaj poiščeva"; with vi it is "skupaj poiščemo"), switching between first person singular and plural for the business within the site, the business described in the third person outside a team or name line.
- english: English words, phrases or calques where Slovene has a word ("click & collect" → "prevzem v trgovini", "online" → "na spletu", "na dnevni bazi" → "vsak dan").
Not errors: the business's, people's, products' and brands' names as the owner wrote them; style you would merely write differently; typography (checked in code); facts; text in square brackets (placeholders the owner fills in).
For each error give the line's path, the exact text from that line (word for word, as short as still identifies the error) and the corrected Slovene. Report an error once per line. An empty list when a kind has no errors. Note: one sentence on how natural the Slovene reads overall.`;

export interface SloveneJudgeResult {
  output: SloveneJudgeOutput;
  /** Errors per kind, and how many of them quote text that isn't on the site. */
  counts: Record<SloveneErrorKind, number>;
  unquoted: number;
}

/** The user message: the site's visible text, one line per field, and the client's own text. */
export function sloveneJudgeMessage(spec: SiteSpec, corpus: string): string {
  const lines = visibleStrings(spec).map((v) => `${v.path}: ${v.text.replace(/\s+/g, " ")}`);
  return `The owner's description:\n${corpus.trim()}\n\nThe site's text (${lines.length} lines):\n${lines.join("\n")}\n\nList the errors.`;
}

/** Counts per kind; quotes that aren't word for word in the site's text are counted in `unquoted`. */
export function summariseSloveneJudge(spec: SiteSpec, output: SloveneJudgeOutput): SloveneJudgeResult {
  const text = visibleStrings(spec)
    .map((v) => v.text.replace(/\s+/g, " "))
    .join("\n");
  const all = SLOVENE_ERROR_KINDS.flatMap((k) => output[k]);
  return {
    output,
    counts: { grammar: output.grammar.length, register: output.register.length, english: output.english.length },
    unquoted: all.filter((e) => !text.includes(e.quote.replace(/\s+/g, " ").trim())).length,
  };
}

/** Lists the site's Slovene errors (a real model call through `client`; the eval passes the run's batch transport). */
export async function judgeSlovene(client: ModelClient, spec: SiteSpec, corpus: string): Promise<SloveneJudgeResult> {
  const { data } = await client.callJson(
    {
      stage: "judge",
      system: [SLOVENE_JUDGE_SYSTEM],
      messages: [{ role: "user", content: sloveneJudgeMessage(spec, corpus) }],
      schema: toModelJsonSchema(SloveneJudgeOutput),
    },
    (d) => SloveneJudgeOutput.parse(d),
  );
  return summariseSloveneJudge(spec, data);
}

/** `--judge-slovene` turns it on; nothing else does (not live, not --judge). */
export const sloveneJudgeRequested = (args: readonly string[]): boolean => args.includes("--judge-slovene");
