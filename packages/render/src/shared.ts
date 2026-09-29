import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STYLE_FILES } from "@sb/components";
import { allFontFaces } from "@sb/spec";

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsDir = path.resolve(here, "../../components");
export const FONTS_DIR = path.resolve(here, "../assets/fonts");

export interface SharedBundle {
  /** Content hash; the bundle is served under `_shared/{hash}/`. */
  hash: string;
  /** Relative path inside the bundle -> file content. */
  files: Map<string, Uint8Array>;
}

/** Strips comments and collapses whitespace. Enough for a hand-written stylesheet. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    // Never remove the space before ":": ".tone-inverse :focus-visible" is a descendant selector.
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    // Inside declaration blocks (innermost braces) the space before ":" can go too.
    .replace(/\{([^{}]*)\}/g, (_, body: string) => `{${body.replace(/\s+:/g, ":")}}`)
    .replace(/;}/g, "}")
    .trim();
}

export function sharedStylesheet(): string {
  return STYLE_FILES.map((f) => readFileSync(path.join(componentsDir, "styles", f), "utf8")).join("\n");
}

let cached: SharedBundle | undefined;

/**
 * The one stylesheet, fonts and islands shared by every site. Deterministic: same sources, same hash.
 */
export function sharedBundle(): SharedBundle {
  if (cached) return cached;
  const files = new Map<string, Uint8Array>();
  files.set("site.css", Buffer.from(minifyCss(sharedStylesheet()), "utf8"));
  const islandsDir = path.join(componentsDir, "islands");
  for (const f of readdirSync(islandsDir).filter((n) => n.endsWith(".js")).sort()) {
    files.set(`js/${f}`, readFileSync(path.join(islandsDir, f)));
  }
  for (const face of allFontFaces()) {
    const p = path.join(FONTS_DIR, `${face.file}.woff2`);
    if (existsSync(p)) files.set(`fonts/${face.file}.woff2`, readFileSync(p));
  }
  const h = createHash("sha256");
  for (const [k, v] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    h.update(k);
    h.update(v);
  }
  cached = { hash: h.digest("hex").slice(0, 10), files };
  return cached;
}

/** For tests and dev servers that edit styles live. */
export function resetSharedBundleCache(): void {
  cached = undefined;
}
