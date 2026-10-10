/**
 * pnpm inventory:decide <gallery-export.json> [--decisions <file>]
 *
 * Merges the owner's approval-gallery export (a JSON array of { id, status, reason? }) into
 * packages/inventory/src/decisions.json (studio-phase1-design.md §5 step 6): each exported row replaces that asset's
 * decision with `at` = now, other decisions are kept, ids are sorted. Refuses ids that aren't registered. No network.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Decisions, GalleryExport, formatDecisions, mergeDecisions, unknownDecisionIds } from "../src/decisions.ts";
import { todaysAssets } from "../src/sources.ts";

const DEFAULT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/decisions.json");

function main(argv: string[]): void {
  const i = argv.indexOf("--decisions");
  const file = i >= 0 ? argv[i + 1] : DEFAULT_FILE;
  const input = argv.filter((a, j) => a !== "--" && (i < 0 || (j !== i && j !== i + 1)))[0];
  if (!input || !file) {
    console.error("usage: pnpm inventory:decide <gallery-export.json> [--decisions <decisions.json>]");
    process.exit(2);
  }
  const rows = GalleryExport.parse(JSON.parse(readFileSync(input, "utf8")));
  const current = Decisions.parse(JSON.parse(readFileSync(file, "utf8")));
  const merged = mergeDecisions(current, rows, new Date());
  const unknown = unknownDecisionIds(todaysAssets(), merged);
  if (unknown.length) {
    console.error(`Not registered in the inventory: ${unknown.join(", ")}`);
    process.exit(1);
  }
  writeFileSync(file, formatDecisions(merged));
  const counts = rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.status]: (n[r.status] ?? 0) + 1 }), {});
  console.log(`${path.relative(process.cwd(), file)}: ${rows.length} rows merged (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}), ${Object.keys(merged).length} decisions in total`);
}

main(process.argv.slice(2));
