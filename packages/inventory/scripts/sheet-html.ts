/**
 * The contact sheet's HTML (no browser, no file system): one row per asset with its pictures, a note for an asset that
 * has no render source yet, and the sheet of a kind with no assets (an empty sheet with a note, never a failure).
 * Split from sheet.ts so tests can build sheets without photographing anything.
 */
import path from "node:path";
import type { Asset, AssetKind } from "../src/index.ts";

export interface Shot {
  asset: string;
  variant: string;
  label: string;
  width: number;
  file: string;
  problems: string[];
}

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
body{margin:0;padding:16px;background:#e9e9ea;font:13px/1.4 system-ui,sans-serif;color:#1a1a1a}
h1{font-size:20px;margin:0 0 12px}.row{display:flex;gap:12px;background:#fff;border-radius:6px;padding:10px;margin-bottom:12px;align-items:flex-start}
.meta{width:220px;flex:none}.meta h2{font-size:14px;margin:0 0 4px;word-break:break-all}.meta div{margin-bottom:2px;color:#444}.note{font-style:italic}
.prob{color:#b00020;padding-left:16px;margin:6px 0 0;font-weight:600}.vs{display:flex;gap:14px;flex-wrap:wrap}.vl{font-weight:600;margin-bottom:4px}
.pair{display:flex;gap:8px;align-items:flex-start}.pair div{overflow:hidden;border:1px solid #ccc;background:#fff}
.w360{width:180px;max-height:900px}.w1280{width:560px;max-height:900px}.pair img{width:100%;display:block}
.empty{background:#fff;border-radius:6px;padding:16px;font-style:italic}
`;

const page = (title: string, body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Inventory: ${esc(title)}</title><style>${CSS}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

/** The sheet of a kind with no registered assets: a note saying so (and how to preview a draft), not a failure. */
export function emptySheetHtml(kind: AssetKind, group?: string): string {
  const name = group ? `${kind} · ${group}` : kind;
  return page(`${name} · 0 assets`, `<div class="empty">No ${esc(kind)} assets are registered yet, so there is nothing to photograph. Register drafts in packages/inventory/src/sources.ts, or preview unregistered ids with <code>pnpm inventory:sheet --kind ${esc(kind)} --ids ${esc(kind)}/&lt;name&gt;</code>.</div>`);
}

/**
 * The sheets a kind is split into: compositions get one sheet per intent (their first intent tag; "untagged" without
 * one), every other kind one sheet. A group with no assets is never returned.
 */
export function sheetGroups(kind: AssetKind, assets: Asset[]): { name: string; assets: Asset[] }[] {
  if (kind !== "composition") return assets.length ? [{ name: "", assets }] : [];
  const by = new Map<string, Asset[]>();
  for (const a of assets) {
    const k = a.tags.intents[0] ?? "untagged";
    by.set(k, [...(by.get(k) ?? []), a]);
  }
  return [...by.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([name, list]) => ({ name, assets: list }));
}

export function sheetHtml(kind: AssetKind, assets: Asset[], shots: Shot[], outDir: string, part?: { n: number; of: number }, group?: string): string {
  const rows = assets
    .map((a) => {
      const mine = shots.filter((s) => s.asset === a.id);
      const variants = [...new Set(mine.map((s) => s.variant))];
      const problems = [...new Set(mine.flatMap((s) => s.problems))];
      const cells = variants
        .map((v) => {
          const vs = mine.filter((s) => s.variant === v);
          return `<div class="v"><div class="vl">${esc(vs[0]!.label)}</div><div class="pair">${vs.filter((s) => s.file).map((s) => `<div class="w${s.width}"><img src="${esc(path.relative(outDir, s.file).replace(/\\/g, "/"))}" loading="eager"></div>`).join("")}</div></div>`;
        })
        .join("");
      const tags = Object.entries(a.tags)
        .filter(([, v]) => (v as string[]).length)
        .map(([k, v]) => `<div><b>${k}</b> ${esc((v as string[]).join(", "))}</div>`)
        .join("");
      const none = variants.length ? "" : `<div class="note">No picture: this asset has no render source yet.</div>`;
      return `<section class="row"><div class="meta"><h2>${esc(a.id)}</h2><div>${a.status} · ${(a.bytes / 1024).toFixed(1)} KB · ${a.license} · phone ${a.phone}${a.pickable === false ? " · not pickable" : ""}</div>${a.note ? `<div class="note">${esc(a.note)}</div>` : ""}${tags}${problems.length ? `<ul class="prob">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div><div class="vs">${cells}${none}</div></section>`;
    })
    .join("");
  const title = `${group ? `${kind} · ${group}` : kind} · ${assets.length} assets${part ? ` · part ${part.n}/${part.of}` : ""}`;
  return page(title, rows);
}
