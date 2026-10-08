import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import type { SiteSpec } from "@sb/spec";
import { homepageFirst, type Evaluated, type HomepageFirstDeps, type HomepageReady, type ModelResponse } from "../src/index.ts";

type Page = { id: string; kind: string; title: string };
const answer = (text: unknown): ModelResponse => ({ text: JSON.stringify(text), stopReason: "end_turn", model: "m", usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } });
const lastText = (messages: Anthropic.MessageParam[]) => messages.at(-1)!.content as string;
const firstText = (messages: Anthropic.MessageParam[]) => messages[0]!.content as string;

/**
 * A fake model: the homepage message is "HOME", a page message "PAGE <id>"; `pages` says what each part answers on its
 * n-th call. `issues` (by call number of the merged check) are what the fake evaluate reports.
 */
function setup(opts: {
  pages?: Record<string, (n: number, messages: Anthropic.MessageParam[]) => unknown>;
  evaluate?: (data: { chrome: unknown; pages: Page[] }, n: number) => string[];
  retries?: number;
  ids?: string[];
}) {
  const ids = opts.ids ?? ["p_storitve", "p_kontakt"];
  const log: string[] = [];
  const calls = new Map<string, number>();
  let checks = 0;
  const deps: HomepageFirstDeps<string> = {
    async call(messages) {
      const first = firstText(messages);
      const id = first === "HOME" ? "home" : first.split(" ")[1]!;
      const n = (calls.get(id) ?? 0) + 1;
      calls.set(id, n);
      log.push(`start ${id}#${n}`);
      await new Promise((r) => setTimeout(r, id === "home" ? 5 : id === "p_kontakt" ? 15 : 1));
      log.push(`end ${id}#${n}`);
      const custom = opts.pages?.[id];
      if (custom) {
        const out = custom(n, messages);
        if (out instanceof Error) throw out;
        return typeof out === "string" ? { ...answer(""), text: out } : answer(out);
      }
      return id === "home" ? answer({ chrome: { header: "h" }, pages: [{ id: "p_home", kind: "home", title: `home ${n}` }] }) : answer({ pages: [{ id, kind: "standard", title: `${id} ${n}` }] });
    },
    evaluate(data): Evaluated {
      const d = data as { chrome: unknown; pages: Page[] };
      const issues = opts.evaluate ? opts.evaluate(d, ++checks) : [];
      return { issues, built: { spec: { pages: d.pages } as unknown as SiteSpec, repairs: [] } };
    },
    retries: opts.retries ?? 2,
    homeMessage: "HOME",
    pageMessage: (id, home) => `PAGE ${id} ${JSON.stringify(home)}`,
    pages: ids.map((id) => ({ page: id, id })),
    plannedIds: ["p_home", ...ids],
    onHomepage: () => void log.push("homepage ready"),
  };
  return { deps, log, calls };
}

describe("homepage first (pipeline.homepageFirst): the parts", () => {
  it("writes the homepage, then every other page side by side with the homepage in its message, and merges them in site order", async () => {
    const seen: string[] = [];
    const { deps, log } = setup({ pages: { p_kontakt: (_n, m) => (seen.push(firstText(m)), { pages: [{ id: "p_kontakt", kind: "standard", title: "kontakt" }] }) } });
    const r = await homepageFirst(deps);
    expect(r.attempts).toBe(3);
    expect(log.slice(0, 3)).toEqual(["start home#1", "end home#1", "homepage ready"]);
    // Both pages are asked before either answers.
    expect(log.slice(3, 5).sort()).toEqual(["start p_kontakt#1", "start p_storitve#1"]);
    expect(seen[0]).toContain('"chrome":{"header":"h"},"page":{"id":"p_home","kind":"home","title":"home 1"}');
    expect((r.spec as unknown as { pages: Page[] }).pages.map((p) => p.id)).toEqual(["p_home", "p_storitve", "p_kontakt"]);
    expect(r.specIssues).toEqual([]);
    expect(r.notes).toEqual(["homepage: 1 call(s)", "p_storitve: 1 call(s)", "p_kontakt: 1 call(s)"]);
  });

  it("retries only the part an issue belongs to, with the path in its own answer", async () => {
    let retryMessage = "";
    const { deps, calls } = setup({
      evaluate: (d) => (d.pages[2]?.title === "p_kontakt 1" ? ["/pages/2/sections/0/props/title: Too big: expected string to have <=70 characters"] : []),
      pages: { p_kontakt: (n, m) => (n === 2 && (retryMessage = lastText(m)), { pages: [{ id: "p_kontakt", kind: "standard", title: `p_kontakt ${n}` }] }) },
    });
    const r = await homepageFirst(deps);
    expect(Object.fromEntries(calls)).toEqual({ home: 1, p_storitve: 1, p_kontakt: 2 });
    expect(retryMessage).toContain("- /pages/0/sections/0/props/title: Too big");
    expect(r.specIssues).toEqual([]);
    expect(r.attempts).toBe(4);
    expect(r.notes).toContain("p_kontakt: 2 call(s)");
  });

  it("issues outside the pages (chrome, business) go to the homepage", async () => {
    const { deps, calls } = setup({ evaluate: (_d, n) => (n === 2 ? ["/chrome/header/cta: Invalid option"] : []) });
    await homepageFirst(deps);
    expect(Object.fromEntries(calls)).toEqual({ home: 2, p_storitve: 1, p_kontakt: 1 });
  });

  it("checks the homepage on its own first, except for its links to the pages still to be written", async () => {
    const { deps, calls } = setup({
      // The first check is the homepage alone: a planned page's link is fine, an unplanned one is not.
      evaluate: (d, n) => (d.pages.length === 1 ? ["/pages/0/sections/1/props/primary/target/page: unknown page p_storitve", ...(n === 1 ? ["/pages/0/sections/2/props/primary/target/page: unknown page p_galerija"] : [])] : []),
    });
    const r = await homepageFirst(deps);
    expect(Object.fromEntries(calls)).toEqual({ home: 2, p_storitve: 1, p_kontakt: 1 });
    expect(r.specIssues).toEqual([]);
  });

  it("keeps the merged spec with the issues left when a part's retries run out", async () => {
    const { deps, calls } = setup({ retries: 1, evaluate: (d) => d.pages.length === 1 ? [] : ["/pages/1/sections/0/props/price: price 25 € is not in the client's input — remove it or use a placeholder"] });
    const r = await homepageFirst(deps);
    expect(Object.fromEntries(calls)).toEqual({ home: 1, p_storitve: 2, p_kontakt: 1 });
    expect(r.specIssues).toHaveLength(1);
    expect(r.notes).toContain("p_storitve: 2 call(s), 1 issue(s) left");
  });

  it("asks a part again when its answer isn't a page, and fails naming it when it never is", async () => {
    const { deps, calls } = setup({ pages: { p_storitve: (n) => (n === 1 ? "no json here" : { pages: [{ id: "p_storitve", kind: "standard", title: "s" }] }) } });
    await homepageFirst(deps);
    expect(calls.get("p_storitve")).toBe(2);

    const broken = setup({ pages: { p_kontakt: () => ({ pages: [{ id: "p_drugo", kind: "standard", title: "x" }] }) } });
    await expect(homepageFirst(broken.deps)).rejects.toThrow(/p_kontakt: \/pages\/0: the page must have id "p_kontakt"/);
    expect(broken.calls.get("p_kontakt")).toBe(3);
  });

  it("a part whose call fails fails the step, after the other parts' calls have finished", async () => {
    const { deps, log } = setup({ pages: { p_storitve: () => new Error("API overloaded") } });
    await expect(homepageFirst(deps)).rejects.toThrow("API overloaded");
    expect(log).toContain("end p_kontakt#1");
    expect(log.at(-1)).toBe("end p_kontakt#1");
  });

  it("hands the homepage on its own, as last checked, to onHomepage before any page is asked (the editor shows it)", async () => {
    const heard: HomepageReady[] = [];
    const { deps, log } = setup({
      evaluate: (d, n) => (d.pages.length === 1 && n === 1 ? ["/pages/0/sections/0/props/title: Too big"] : []),
    });
    deps.onHomepage = (h) => {
      heard.push(h);
      log.push("homepage ready");
    };
    const r = await homepageFirst(deps);
    expect(heard).toHaveLength(1);
    // The retried homepage (its second answer), the same page JSON the merge then takes as page 0.
    expect(heard[0]).toEqual({ attempts: 2, issues: [], spec: { pages: [{ id: "p_home", kind: "home", title: "home 2" }] } });
    expect((r.spec as unknown as { pages: Page[] }).pages[0]).toEqual((heard[0]!.spec as unknown as { pages: Page[] }).pages[0]);
    expect(log.indexOf("homepage ready")).toBeLessThan(log.indexOf("start p_storitve#1"));
  });

  it("a homepage that never answers in shape fails before any page is asked", async () => {
    const { deps, calls } = setup({ pages: { home: () => ({ pages: [] }) } });
    await expect(homepageFirst(deps)).rejects.toThrow(/homepage: \/: the answer must be/);
    expect(Object.fromEntries(calls)).toEqual({ home: 3 });
  });
});
