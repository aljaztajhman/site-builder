import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateSpec, validateSite, collectPlaceholders, type SiteSpec } from "@sb/spec";
import { renderSite, sharedBundle } from "@sb/render";

/**
 * The landing page's example sites, rendered by our own engine. Each starts from a spec the pipeline
 * generated in the eval (tools/examples/specs, copied from eval/runs/<id>/spec-generated.json) and the
 * fixture's photos. Missing facts on the homepage are filled the way an owner fills them in the editor
 * (FILLS); the landing caption says so. Only the homepage is shipped, with the files it references.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../../../..");
export const OUT_DIR = path.join(ROOT, "apps/web/src/ui/examples");
export const WIDTHS = [480, 960];

export interface Example {
  id: string;
  /** Values for the homepage's placeholders, by spec path, as an owner would type them. */
  fills: Record<string, unknown>;
}

export const EXAMPLES: Example[] = [
  // The hero animation: a shop in Koper, five photos.
  { id: "trgovina-oljka-in-sol", fills: { "/pages/0/sections/2/props/items/2/price": { unit: "100 g", amount: 3.9 } } },
  // "Kaj dobite": a dental practice whose hero calls first (one call button on a phone).
  { id: "zobozdravstvo-lebar", fills: {} },
];

/** Replaces the value at a JSON pointer that must already exist (a placeholder). */
function setAt(doc: unknown, pointer: string, value: unknown): void {
  const keys = pointer.split("/").slice(1);
  const last = keys.pop()!;
  let node = doc as Record<string, unknown>;
  for (const k of keys) node = node[k] as Record<string, unknown>;
  if (!node || !(last in node)) throw new Error(`no value at ${pointer}`);
  node[last] = value;
}

export function exampleSpec(ex: Example): SiteSpec {
  const raw = JSON.parse(readFileSync(path.join(ROOT, "tools/examples/specs", `${ex.id}.json`), "utf8")) as unknown;
  for (const [p, value] of Object.entries(ex.fills)) setAt(raw, p, value);
  const spec = migrateSpec(raw);
  const v = validateSite(spec);
  if (!v.ok) throw new Error(`${ex.id}: ${v.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
  const left = collectPlaceholders(spec).filter((p) => p.path.startsWith("/pages/0/") || !p.path.startsWith("/pages/"));
  if (left.length) throw new Error(`${ex.id}: unfilled on the homepage: ${left.map((p) => p.path).join(", ")}`);
  return spec;
}

/** The example's homepage HTML and the shared files (CSS, fonts, scripts) it references, by path under OUT_DIR. */
export function exampleHtml(ex: Example): { slug: string; html: string; shared: Map<string, Uint8Array> } {
  return homepageFiles(exampleSpec(ex));
}

/** A spec's homepage HTML and the shared files it references (examples and the trade showcase). */
export function homepageFiles(spec: SiteSpec): { slug: string; html: string; shared: Map<string, Uint8Array> } {
  const bundle = sharedBundle();
  const html = renderSite(spec, { imageWidths: WIDTHS, sharedHash: bundle.hash }).pages.get("index.html");
  if (!html) throw new Error(`${spec.slug}: no homepage`);
  const shared = new Map<string, Uint8Array>();
  const want = (p: string) => {
    const data = bundle.files.get(p);
    if (!data || shared.has(`_shared/${bundle.hash}/${p}`)) return;
    shared.set(`_shared/${bundle.hash}/${p}`, data);
    if (p.endsWith(".css")) {
      const dir = path.posix.dirname(p);
      for (const m of new TextDecoder().decode(data).matchAll(/url\(["']?([^"')]+)["']?\)/g)) want(path.posix.normalize(path.posix.join(dir, m[1]!)));
    }
  };
  for (const m of html.matchAll(new RegExp(`_shared/${bundle.hash}/([^"'\\s)]+)`, "g"))) want(m[1]!);
  return { slug: spec.slug, html, shared };
}
