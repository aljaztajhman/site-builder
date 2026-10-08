/**
 * Homepage first (config pipeline.homepageFirst, HQ it-homepage-first). A full site's content is written in parts: the
 * homepage in one call (with the whole page list, so its nav and links are right), then every other page in its own
 * call, side by side, each with the homepage's JSON for its facts and voice. All parts use the same cached system
 * blocks (the section catalogue and the content system), and the page calls start after the homepage call has written
 * that cache, so they read it instead of each writing their own. The parts are merged into one content answer and
 * checked exactly as a one-call answer is (`evaluate`: code repairs, assembly, validation, fact check); a part whose
 * page has issues is retried with its own issues (paths rewritten to its own answer), at most `retries` times per part.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { SiteSpec } from "@sb/spec";
import { extractJson, type ModelResponse } from "./llm/client.ts";
import { wholeRetryInstruction, type Evaluated } from "./content-patch.ts";

/** What the caller hears once the homepage is written: its calls and the issues it still had on its own. */
export interface HomepageReady {
  attempts: number;
  issues: string[];
}

export interface HomepageFirstDeps<P> {
  /** One content call with the given messages (the system blocks are the caller's). */
  call(messages: Anthropic.MessageParam[]): Promise<ModelResponse>;
  /** Checks one whole content answer ({chrome, pages}); generateContent's evaluate. */
  evaluate(data: unknown): Evaluated;
  /** Retries per part after its first call. */
  retries: number;
  homeMessage: string;
  /** The message for one inner page, given the homepage as written ({chrome, page}). */
  pageMessage(page: P, home: unknown): string;
  /** The inner pages in site order, with the id each must have. */
  pages: { page: P; id: string }[];
  /** Every planned page id: the homepage's links to them are checked once the pages exist. */
  plannedIds: string[];
  onHomepage?: (h: HomepageReady) => void | Promise<void>;
}

export interface HomepageFirstResult {
  spec: SiteSpec;
  /** Model calls in all parts. */
  attempts: number;
  specIssues: string[];
  specRepairs: string[];
  /** One line per part: its page id, calls and issues left. */
  notes: string[];
}

interface Part {
  id: string;
  /** Where its page sits in the merged answer (0: the homepage). */
  index: number;
  messages: Anthropic.MessageParam[];
  attempts: number;
  /** The last answer's text (sent back with a retry). */
  text?: string;
  /** The last usable page (and, for the homepage, the chrome). */
  page?: Record<string, unknown>;
  chrome?: unknown;
  issues: string[];
}

type JsonObject = Record<string, unknown>;
const isObject = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);

/** Issue lines ("/pages/2/sections/0/props/title: …") of the merged answer by the part that wrote them; the rest go to the homepage. */
function byPart(issues: string[], parts: Part[]): Map<Part, string[]> {
  const out = new Map<Part, string[]>(parts.map((p) => [p, []]));
  for (const line of issues) {
    const m = /^\/pages\/(\d+)(?=[/:])/.exec(line);
    const part = (m && parts.find((p) => p.index === Number(m[1]))) || parts[0]!;
    out.get(part)!.push(part.index && m ? line.replace(/^\/pages\/\d+/, "/pages/0") : line);
  }
  return out;
}

/** The homepage's own issues, without its links to planned pages that are written after it. */
function homeIssues(issues: string[], planned: string[]): string[] {
  return issues.filter((line) => {
    const m = /: unknown page (p_[a-z0-9_-]+)$/.exec(line);
    return !(m && planned.includes(m[1]!));
  });
}

export async function homepageFirst<P>(deps: HomepageFirstDeps<P>): Promise<HomepageFirstResult> {
  let calls = 0;
  const home: Part = { id: "homepage", index: 0, messages: [{ role: "user", content: deps.homeMessage }], attempts: 0, issues: [] };

  /** One call for `part` (a retry with `issues` when it has answered before); keeps the answer's page when its shape is usable. */
  const ask = async (part: Part, issues?: string[]): Promise<string[]> => {
    if (issues && part.text !== undefined) part.messages.push({ role: "assistant", content: part.text }, { role: "user", content: wholeRetryInstruction(issues) });
    part.attempts++;
    calls++;
    const res = await deps.call(part.messages);
    part.text = res.text;
    let data: unknown;
    try {
      data = JSON.parse(extractJson(res.text));
    } catch {
      return ["Output is not valid JSON."];
    }
    return part === home ? takeHome(part, data) : takePage(part, data);
  };
  const takeHome = (part: Part, data: unknown): string[] => {
    const page = isObject(data) && Array.isArray(data.pages) ? (data.pages as unknown[]).find((p) => isObject(p) && p.kind === "home") : undefined;
    if (!isObject(data) || !isObject(data.chrome) || !isObject(page)) return ['/: the answer must be {"chrome": …, "pages": [<the home page, kind "home">]}'];
    part.chrome = data.chrome;
    part.page = page;
    return [];
  };
  const takePage = (part: Part, data: unknown): string[] => {
    const pages = isObject(data) && Array.isArray(data.pages) ? (data.pages as unknown[]).filter(isObject) : [];
    const page = pages.find((p) => p.id === part.id) ?? pages[0];
    if (!page) return [`/: the answer must be {"pages": [<the page ${part.id}>]}`];
    if (page.id !== part.id || page.kind !== "standard") return [`/pages/0: the page must have id "${part.id}" and kind "standard"`];
    part.page = page;
    return [];
  };
  /** Asks until the answer has a usable shape or the part's retries are used up; the last usable page stays otherwise. */
  const askShaped = async (part: Part, issues?: string[]): Promise<void> => {
    let shape = await ask(part, issues);
    while (shape.length && part.attempts <= deps.retries) shape = await ask(part, shape);
    if (shape.length) part.issues = shape;
  };
  /** Runs every part's calls to the end before passing on a failure, so no paid call is left running behind it. */
  const all = async (work: Promise<void>[]): Promise<void> => {
    const settled = await Promise.allSettled(work);
    const failed = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
  };
  const check = (data: unknown): Evaluated => {
    try {
      return deps.evaluate(data);
    } catch {
      return { issues: ["Output is not valid JSON."] };
    }
  };
  const failed = (parts: Part[]) => new Error(`Content generation failed after ${calls} attempts: ${parts.map((p) => `${p.id}: ${p.issues.slice(0, 3).join("; ")}`).join(" | ")}`);

  // 1. The homepage, checked on its own (its links to the pages still to be written aside), retried until it passes.
  await askShaped(home);
  if (!home.page) throw failed([home]);
  for (;;) {
    // On a copy: the code repairs are made (and logged) once, on the merged answer.
    home.issues = homeIssues(check(structuredClone({ chrome: home.chrome, pages: [home.page] })).issues, deps.plannedIds);
    if (!home.issues.length || home.attempts > deps.retries) break;
    await askShaped(home, home.issues);
  }
  await deps.onHomepage?.({ attempts: home.attempts, issues: home.issues });

  // 2. Every other page side by side, each with the homepage as written.
  const homeJson = { chrome: home.chrome, page: home.page };
  const pages: Part[] = deps.pages.map((p, i) => ({ id: p.id, index: i + 1, messages: [{ role: "user", content: deps.pageMessage(p.page, homeJson) }], attempts: 0, issues: [] }));
  await all(pages.map((p) => askShaped(p)));
  const unusable = pages.filter((p) => !p.page);
  if (unusable.length) throw failed(unusable);

  // 3. Merge and check as one answer; the parts with issues retry side by side, each with its own issues.
  const parts = [home, ...pages];
  let built: Evaluated["built"];
  let specIssues: string[] = [];
  for (;;) {
    const r = check({ chrome: home.chrome, pages: parts.map((p) => p.page) });
    if (r.built) {
      built = r.built;
      specIssues = r.issues;
    }
    const mine = byPart(r.issues, parts);
    for (const p of parts) p.issues = mine.get(p)!;
    if (!r.issues.length) break;
    const retry = parts.filter((p) => p.issues.length && p.attempts <= deps.retries);
    if (!retry.length) break;
    await all(retry.map((p) => askShaped(p, p.issues)));
  }
  if (!built) throw failed(parts.filter((p) => p.issues.length));
  const notes = parts.map((p) => `${p.id}: ${p.attempts} call(s)${p.issues.length ? `, ${p.issues.length} issue(s) left` : ""}`);
  return { spec: built.spec, attempts: calls, specIssues, specRepairs: built.repairs, notes };
}
