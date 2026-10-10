/**
 * The Okus rating page (tools/okus/index.html) as claude.ai would serve it, for tests and local looks. The page is
 * written as artifact content (no doctype, html, head or body: the platform wraps it at publish), so locally it gets
 * the same skeleton before it is served, beside the round files.
 */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { OKUS_DIR } from "./okus-round.ts";

/** The publish skeleton: charset and viewport metas and the small reset the platform adds. */
export function artifactDocument(content: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
    `<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>` +
    `</head><body>${content}</body></html>`
  );
}

/** Writes `<dir>/index.html` (the wrapped page) and copies the rounds from `okusDir` unless `copyRounds` is false. */
export async function stageOkus(dir: string, opts: { okusDir?: string; copyRounds?: boolean } = {}): Promise<void> {
  const okusDir = opts.okusDir ?? OKUS_DIR;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), artifactDocument(await readFile(path.join(OKUS_DIR, "index.html"), "utf8")));
  if (opts.copyRounds !== false) await cp(path.join(okusDir, "rounds"), path.join(dir, "rounds"), { recursive: true });
}
