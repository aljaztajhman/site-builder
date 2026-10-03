/**
 * pnpm examples:build — renders the landing page's example sites into apps/web/src/ui/examples/
 * (homepage, its photos at 480/960 px, the shared files it references). Run it after a renderer change;
 * tools/eval/test/examples.test.ts fails while the committed examples differ from a fresh render.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "@sb/config";
import { processPhoto } from "@sb/engine";
import type { SiteSpec } from "@sb/spec";
import { EXAMPLES, OUT_DIR, ROOT, WIDTHS, exampleSpec, homepageFiles, primerSpec } from "./examples.ts";
import { SHOWCASES, SHOWCASE_JSON, showcaseJson, showcaseSpec } from "./showcase.ts";

const config = loadConfig();
rmSync(OUT_DIR, { recursive: true, force: true });
const write = (rel: string, data: Uint8Array | string) => {
  const file = path.join(OUT_DIR, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
};

/** Writes a homepage, the shared files it uses and its photos (from fixture `fixture`). */
async function writeSite(spec: SiteSpec, fixture: string): Promise<void> {
  const { slug, html, shared } = homepageFiles(spec);
  write(`${slug}/index.html`, html);
  for (const [p, data] of shared) write(p, data);
  // Photos: the pipeline numbers the owner's photos img_01… in upload order, the fixture's order.
  const brief = JSON.parse(readFileSync(path.join(ROOT, "tools/eval/fixtures", fixture, "brief.json"), "utf8")) as { photos: { file: string }[] };
  const used = new Set([...html.matchAll(/media\/(img_[a-z0-9_]+)-\d+\./g)].map((m) => m[1]!));
  for (const im of spec.assets.images) {
    if (!used.has(im.id)) continue;
    const n = Number(/^img_(\d+)$/.exec(im.id)?.[1]);
    const photo = brief.photos[n - 1];
    if (!photo) throw new Error(`${fixture}: ${im.id} has no fixture photo`);
    const data = new Uint8Array(readFileSync(path.join(ROOT, "tools/eval/fixtures", fixture, ...photo.file.split("/"))));
    const processed = await processPhoto(im.id, data, WIDTHS, { avif: config.images.avifQuality, webp: config.images.webpQuality });
    for (const v of processed.variants) write(`${slug}/media/${v.file}`, v.data);
  }
  // The logo, as the owner uploaded it (the page shows media/<file>).
  const logo = spec.assets.logo;
  if (logo && html.includes(`media/${logo.file}`)) write(`${slug}/media/${logo.file}`, readFileSync(path.join(ROOT, "tools/eval/fixtures", fixture, logo.file)));
  console.log(`${fixture}: ${slug}/index.html, ${used.size} photos, ${shared.size} shared files${logo ? ", logo" : ""}`);
}

for (const ex of EXAMPLES) await writeSite(exampleSpec(ex), ex.id);
// The "Primer" section: Pekarna Kvas with the cinnamon rolls' price left missing (marked on the page).
await writeSite(primerSpec(), "pekarna-kvas");
// The trade showcase: each golden in its showcase colourway, and the landing page's data for it.
for (const s of SHOWCASES) await writeSite(showcaseSpec(s), s.golden);
write(SHOWCASE_JSON, showcaseJson());
