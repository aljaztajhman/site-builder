/**
 * pnpm examples:build — renders the landing page's example sites into apps/web/src/ui/examples/
 * (homepage, its photos at 480/960 px, the shared files it references). Run it after a renderer change;
 * tools/eval/test/examples.test.ts fails while the committed examples differ from a fresh render.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { processPhoto } from "@sb/engine";
import { EXAMPLES, OUT_DIR, ROOT, WIDTHS, exampleHtml, exampleSpec } from "./examples.ts";

const config = loadConfig();
rmSync(OUT_DIR, { recursive: true, force: true });
const write = (rel: string, data: Uint8Array | string) => {
  const file = path.join(OUT_DIR, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
};

for (const ex of EXAMPLES) {
  const spec = exampleSpec(ex);
  const { slug, html, shared } = exampleHtml(ex);
  write(`${slug}/index.html`, html);
  for (const [p, data] of shared) write(p, data);
  // Photos: the pipeline numbers the owner's photos img_01… in upload order, the fixture's order.
  const brief = JSON.parse(readFileSync(path.join(ROOT, "tools/eval/fixtures", ex.id, "brief.json"), "utf8")) as { photos: { file: string }[] };
  const used = new Set([...html.matchAll(/media\/(img_[a-z0-9_]+)-\d+\./g)].map((m) => m[1]!));
  for (const im of spec.assets.images) {
    if (!used.has(im.id)) continue;
    const n = Number(/^img_(\d+)$/.exec(im.id)?.[1]);
    const photo = brief.photos[n - 1];
    if (!photo) throw new Error(`${ex.id}: ${im.id} has no fixture photo`);
    const data = new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures", ex.id, ...photo.file.split("/"))));
    const processed = await processPhoto(im.id, data, WIDTHS, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) write(`${slug}/media/${v.file}`, v.data);
  }
  console.log(`${ex.id}: ${slug}/index.html, ${used.size} photos, ${shared.size} shared files`);
}
