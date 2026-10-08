import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPlannedPages } from "@sb/engine";
import type { SiteSpec } from "@sb/spec";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A full site (the accountant golden: no photos, homepage + Storitve + Kontakt) and the homepage-only spec the
 * pipeline logs with "Homepage ready" for it (config pipeline.homepageFirst): its homepage, chrome and system pages,
 * the other pages as empty stand-ins (engine withPlannedPages).
 */
export async function goldenWithDraft(slug: string): Promise<{ full: SiteSpec; draft: SiteSpec }> {
  const golden = JSON.parse(await readFile(path.join(here, "../../../tools/eval/golden/racunovodstvo-seliskar.json"), "utf8")) as SiteSpec;
  const full = { ...golden, slug };
  const planned = full.pages.filter((p) => p.kind === "standard").map((p) => ({ kind: "standard" as const, slug: p.slug, navLabel: p.nav.label, purpose: p.seo.description.slice(0, 200) }));
  const draft = withPlannedPages({ ...full, pages: full.pages.filter((p) => p.kind !== "standard") }, planned);
  return { full, draft };
}
