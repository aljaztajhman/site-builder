import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ModelRequest, ModelTransport } from "@sb/engine";
import type { SiteSpec } from "@sb/spec";

// Shared by homepage-first.test.ts (content stage, fast) and homepage-first-pipeline.test.ts (the pipeline, slow).
const here = path.dirname(fileURLToPath(import.meta.url));
export const USAGE = { input_tokens: 2000, output_tokens: 900, cache_creation_input_tokens: 0, cache_read_input_tokens: 16000 };

export const goldenOf = async (id: string) => JSON.parse(await readFile(path.join(here, "../golden", `${id}.json`), "utf8")) as SiteSpec;
export const textOf = (req: ModelRequest) => req.messages[0]!.content as string;

/**
 * Answers content requests from the golden spec: the one-call request with every page, the homepage part with the
 * homepage, a page part ("… (page id p_x, …") with that page. `override(id, n)` replaces a part's n-th answer.
 */
export function goldenContent(golden: SiteSpec, override?: (id: string, n: number) => unknown) {
  const pages = golden.pages.filter((p) => p.kind === "home" || p.kind === "standard");
  const seen: { req: ModelRequest; at: number; done?: number }[] = [];
  const asked = new Map<string, number>();
  const transport: ModelTransport = {
    async send(req, stage) {
      const entry: { req: ModelRequest; at: number; done?: number } = { req, at: Date.now() };
      seen.push(entry);
      const first = textOf(req);
      const id = first.startsWith("Build the homepage of the full site") ? "home" : (/\(page id (p_[a-z0-9_-]+),/.exec(first)?.[1] ?? "site");
      const n = (asked.get(id) ?? 0) + 1;
      asked.set(id, n);
      await new Promise((r) => setTimeout(r, id === "home" ? 10 : 2));
      const body =
        override?.(id, n) ??
        (id === "site" ? { chrome: golden.chrome, pages } : id === "home" ? { chrome: golden.chrome, pages: pages.filter((p) => p.kind === "home") } : { pages: pages.filter((p) => p.id === id) });
      entry.done = Date.now();
      return { text: JSON.stringify(body), stopReason: "end_turn", model: stage.model, usage: USAGE };
    },
  };
  return { transport, seen, asked };
}
