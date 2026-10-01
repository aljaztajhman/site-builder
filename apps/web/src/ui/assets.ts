import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONTS_DIR } from "@sb/render";

/**
 * The product UI's stylesheet, its two fonts (the same subset files generated sites use) and the
 * tab icon, plus the landing page's stylesheet and its example site (docs/design/example-home.html,
 * with two more fonts and three AI-generated example photos, labelled on the page). Served under /assets/ui/<hash>/… without a session, because the login and
 * landing pages need them, and cached for good since the hash changes with the content.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FONTS = ["bricolage-grotesque", "figtree", "fraunces", "source-sans-3"] as const;
const FILES = { "app.css": "text/css; charset=utf-8", "home.css": "text/css; charset=utf-8", "example-home.html": "text/html; charset=utf-8" } as const;
// Pekarna Kvas example photos (GPT Image 2.5 via fal.ai, prompts in tools/eval/fixtures/photo-prompts.json), 480 and 960 px.
const EXAMPLE_PHOTOS = ["01", "02", "03"].flatMap((n) => [480, 960].map((w) => `example/pekarna-${n}-${w}.webp`));
// Example sites rendered by our engine (pnpm examples:build): homepage, photos, the shared files they use.
const EXAMPLES_DIR = "examples";
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".woff2": "font/woff2", ".webp": "image/webp", ".avif": "image/avif" };
// The wordmark's accent square.
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2" fill="#156b4a"/></svg>`;

export interface UiFile {
  data: Uint8Array;
  type: string;
}

let cached: { hash: string; files: Map<string, UiFile> } | undefined;

export function uiAssets(): { hash: string; files: Map<string, UiFile> } {
  // In development the stylesheet is read on every request, so edits show on reload.
  if (cached && process.env.NODE_ENV === "production") return cached;
  const files = new Map<string, UiFile>();
  for (const [name, type] of Object.entries(FILES)) files.set(name, { data: readFileSync(path.join(here, name)), type });
  for (const p of EXAMPLE_PHOTOS) files.set(p, { data: readFileSync(path.join(here, p)), type: "image/webp" });
  for (const e of readdirSync(path.join(here, EXAMPLES_DIR), { recursive: true, withFileTypes: true })) {
    if (!e.isFile()) continue;
    const rel = path.relative(here, path.join(e.parentPath, e.name)).split(path.sep).join("/");
    const type = TYPES[path.extname(e.name)];
    if (type) files.set(rel, { data: readFileSync(path.join(here, rel)), type });
  }
  for (const f of FONTS) files.set(`fonts/${f}.woff2`, { data: readFileSync(path.join(FONTS_DIR, `${f}.woff2`)), type: "font/woff2" });
  files.set("icon.svg", { data: new TextEncoder().encode(ICON), type: "image/svg+xml" });
  const h = createHash("sha256");
  for (const [name, f] of files) h.update(name).update(f.data);
  cached = { hash: h.digest("hex").slice(0, 10), files };
  return cached;
}

export const uiUrl = (file: string): string => `/assets/ui/${uiAssets().hash}/${file}`;
