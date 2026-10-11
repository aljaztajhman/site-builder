/**
 * pnpm approval:export <flags.json> [--items <items.json>] [--decisions <decisions.json>] [--out export.json]
 *
 * Turns the owner's taps on the approval pages (tools/approval; the `flags` collection, an array of
 * { pageId, flagged, note, done, at }) into the gallery rows `pnpm inventory:decide` merges: flagged anywhere →
 * rejected, shown on a page marked done and never flagged → approved, never shown → untouched. Assets that already
 * have a decision (the pilot ratings, the starter set) are never given a row. Writes the rows (default
 * eval/runs/approval-export.json), prints counts. No network. Items default: tools/approval/round/items.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Decisions, approvalDecisions, inventory, summarizeApproval, type ApprovalItems, type PageFlags } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../../..");

const Flags = z.object({
  pageId: z.string().min(1),
  flagged: z.array(z.string()).default([]),
  note: z.string().optional(),
  done: z.boolean().default(false),
  at: z.string().optional(),
});

/** The flags export: an array of docs, or `{ "<pageId>": doc }` (the page's localStorage mirror); a doc without `pageId` takes its key. */
export function parseFlags(raw: unknown): PageFlags[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.entries(raw).map(([id, d]) => ({ pageId: id, ...(d as object) })) : [];
  return z.array(Flags).parse(list);
}

function main(argv: string[]): void {
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const skip = new Set(["--items", "--decisions", "--out"].flatMap((f) => (argv.includes(f) ? [argv.indexOf(f), argv.indexOf(f) + 1] : [])));
  const input = argv.filter((a, i) => a !== "--" && !skip.has(i))[0];
  if (!input) {
    console.error("usage: pnpm approval:export <flags.json> [--items <items.json>] [--decisions <decisions.json>] [--out <export.json>]");
    process.exit(2);
  }
  const itemsFile = val("--items") ?? path.join(REPO_ROOT, "tools/approval/round/items.json");
  const decisionsFile = val("--decisions") ?? path.join(here, "../src/decisions.json");
  const out = path.resolve(val("--out") ?? path.join(REPO_ROOT, "eval/runs/approval-export.json"));
  const flags = parseFlags(JSON.parse(readFileSync(input, "utf8")));
  const items = JSON.parse(readFileSync(itemsFile, "utf8")) as ApprovalItems;
  const current = Decisions.parse(JSON.parse(readFileSync(decisionsFile, "utf8")));
  const unknownPages = flags.filter((f) => !items.pages.some((p) => p.id === f.pageId)).map((f) => f.pageId);
  if (unknownPages.length) {
    console.error(`Flags for pages that are not in ${itemsFile}: ${unknownPages.join(", ")}`);
    process.exit(1);
  }
  const registry = inventory();
  const rows = approvalDecisions(items.pages, flags, current, registry);
  const s = summarizeApproval(rows, current, registry);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`);
  const done = flags.filter((f) => f.done).length;
  console.log(`${done} of ${items.pages.length} pages marked done, ${flags.reduce((n, f) => n + f.flagged.length, 0)} parts flagged`);
  console.log(`${rows.length} rows: ${s.approved} approved, ${s.rejected} rejected -> ${path.relative(process.cwd(), out)}`);
  console.log(`${s.stillDraftTotal} draft assets stay unshown/undecided (${Object.entries(s.stillDraft).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`next: pnpm inventory:decide ${path.relative(process.cwd(), out)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
