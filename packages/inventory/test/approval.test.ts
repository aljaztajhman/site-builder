import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
  Decisions,
  Registry,
  approvalDecisions,
  approvalPlan,
  formatDecisions,
  inventory,
  shownAssets,
  summarizeApproval,
  type ApprovalPlan,
  type ComposeUsed,
  type Asset,
  type DecisionPage,
  type PageFlags,
} from "../src/index.ts";
import type { SiteSpec } from "@sb/spec";

const asset = (id: string, kind: Asset["kind"], status: Asset["status"] = "draft"): Asset => ({
  id,
  kind,
  tags: { trades: [], stances: [], intents: [], mood: [], ground: [], density: [] },
  phone: "ok",
  bytes: 0,
  license: "own",
  status,
});
const AT = "2026-10-10T08:00:00.000Z";
const scripts = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts");

describe("shownAssets on the real approval pages", () => {
  let plan: ApprovalPlan;
  beforeAll(() => {
    plan = approvalPlan({ count: 30 });
  }, 300_000);

  it("gives one part per section, in order, and names the page-wide parts", () => {
    const reg = inventory();
    expect(plan.pages).toHaveLength(30);
    for (const [i, r] of plan.results.entries()) {
      const shown = shownAssets(r.spec, r.used, reg);
      const sections = shown.parts.filter((p) => /^s\d+$/.test(p.id));
      expect(sections.map((p) => p.id)).toEqual(r.used.presets.map((_, k) => `s${k + 1}`));
      expect(r.spec.pages[0]!.sections).toHaveLength(r.used.presets.length);
      sections.forEach((p, k) => {
        expect(p.assets).toContain(r.used.presets[k]);
        expect(p.label).toMatch(new RegExp(`^Section ${k + 1} — .+`));
      });
      expect(new Set(shown.parts.map((p) => p.id)).size, `page ${i}`).toBe(shown.parts.length);
      const byId = Object.fromEntries(shown.parts.map((p) => [p.id, p]));
      expect(byId.colours).toMatchObject({ label: "Colours", assets: [r.used.palette] });
      expect(byId.fonts).toMatchObject({ label: "Fonts", assets: [r.used.pairing] });
      if (r.used.wordmark) expect(byId.lettering).toMatchObject({ label: "Name lettering", assets: [r.used.wordmark] });
      if (r.used.drawing) expect(shown.assets).toContain(r.used.drawing);
      for (const id of shown.assets) expect(reg.byId(id), id).toBeDefined();
      expect(shown.assets).toEqual([...new Set(shown.parts.flatMap((p) => p.assets))].sort());
    }
  });

  it("finds the assets presets reference, not only what `used` lists", () => {
    const reg = inventory();
    const kinds = new Set<string>();
    for (const r of plan.results) {
      const shown = shownAssets(r.spec, r.used, reg);
      const listed = new Set([...r.used.presets, r.used.palette, r.used.pairing, ...(r.used.drawing ? [r.used.drawing] : []), ...(r.used.wordmark ? [r.used.wordmark] : [])]);
      for (const id of shown.assets) if (!listed.has(id)) kinds.add(reg.byId(id)!.kind);
    }
    // Fact objects and masks come from the presets' elements; at least one of them must show up across 30 pages.
    expect(kinds.size).toBeGreaterThan(0);
    expect([...kinds].some((k) => ["factObject", "mask", "ornament", "motif", "typeTreatment", "treatment", "icon", "texture"].includes(k))).toBe(true);
  });

  it("covers the draft compositions, palettes and wordmarks the plan reports as covered", () => {
    const reg = inventory();
    const shown = new Set(plan.results.flatMap((r) => shownAssets(r.spec, r.used, reg).assets));
    for (const id of plan.used.flatMap((u) => [...u.presets, u.palette, ...(u.wordmark ? [u.wordmark] : [])])) expect(shown.has(id)).toBe(true);
  });
});

describe("shownAssets on a made-up spec", () => {
  it("reads drawings, masks and treatments (by the element they sit in) out of a section, keeps only registered ids", () => {
    const reg = inventory();
    const spec = {
      business: { amenities: ["parking", "wifi"] },
      design: { motion: "calm" },
      pages: [
        {
          sections: [
            {
              type: "composed",
              props: {
                elements: [
                  { kind: "decor", drawing: "ornament/rope-line" },
                  { kind: "fact", treatment: "numeral" },
                  { kind: "fact", treatment: "door-plate" },
                  { kind: "heading", treatment: "masthead" },
                  { kind: "image", mask: "arch", treatment: "matte" },
                  { kind: "iconFacts", icons: "line" },
                  { kind: "decor", motif: "not-a-registered-motif" },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as SiteSpec;
    const used: ComposeUsed = { fixtureId: "x", stance: "s", seed: 1, catalogue: "drafts", presets: ["composition/hero/phone-giant-rope"], palette: "palette/skorja-poppy", pairing: "pairing/bricolage-figtree", drawing: null, wordmark: "wordmark/lockup", skipped: [] };
    const shown = shownAssets(spec, used, reg);
    const s1 = shown.parts.find((p) => p.id === "s1")!;
    expect(s1.label).toBe("Section 1 — opening");
    for (const id of ["composition/hero/phone-giant-rope", "ornament/rope-line", "fact/numeral", "fact/door-plate", "type-treatment/masthead", "mask/arch", "treatment/matte", "icon/line/parking", "icon/line/wifi"]) expect(s1.assets, id).toContain(id);
    expect(s1.assets.some((id) => id.includes("not-a-registered"))).toBe(false);
  });
});

describe("approvalDecisions", () => {
  const reg = new Registry().registerAll([
    asset("mask/a", "mask"),
    asset("mask/b", "mask"),
    asset("mask/c", "mask"),
    asset("mask/never", "mask"),
    asset("palette/done-earlier", "palette"),
    asset("palette/starter", "palette", "approved"),
    asset("wordmark/w", "wordmark"),
  ]);
  const pages: DecisionPage[] = [
    { id: "p01", parts: [{ id: "s1", assets: ["mask/a", "mask/b"] }, { id: "colours", assets: ["palette/starter", "palette/done-earlier"] }] },
    { id: "p02", parts: [{ id: "s1", assets: ["mask/a", "mask/c"] }, { id: "lettering", assets: ["wordmark/w"] }] },
  ];
  const flag = (pageId: string, flagged: string[], done = true): PageFlags => ({ pageId, flagged, done });
  const byId = (rows: ReturnType<typeof approvalDecisions>) => Object.fromEntries(rows.map((r) => [r.id, r]));

  it("approves what is shown and not flagged, rejects what is flagged, leaves what was never shown", () => {
    const rows = byId(approvalDecisions(pages, [flag("p01", ["s1"]), flag("p02", [])], {}, reg));
    expect(rows["mask/a"]).toMatchObject({ status: "rejected", reason: "flagged on p01" });
    expect(rows["mask/b"]).toMatchObject({ status: "rejected" });
    expect(rows["mask/c"]).toMatchObject({ status: "approved" });
    expect(rows["wordmark/w"]).toMatchObject({ status: "approved" });
    expect(rows["palette/done-earlier"]).toMatchObject({ status: "approved" });
    expect(rows["mask/never"]).toBeUndefined();
  });

  it("flag beats approve across pages, and the reason names every page that flagged it", () => {
    const rows = byId(approvalDecisions(pages, [flag("p01", []), flag("p02", ["s1"])], {}, reg));
    expect(rows["mask/a"]).toMatchObject({ status: "rejected", reason: "flagged on p02" });
    expect(rows["mask/b"]).toMatchObject({ status: "approved" });
    const both = byId(approvalDecisions(pages, [flag("p01", ["s1"]), flag("p02", ["s1"])], {}, reg));
    expect(both["mask/a"]!.reason).toBe("flagged on p01, p02");
  });

  it("never emits a row for an asset that already has a decision, or that is not draft", () => {
    const current = { "mask/b": { status: "approved", at: AT }, "wordmark/w": { status: "rejected", at: AT } };
    const rows = byId(approvalDecisions(pages, [flag("p01", ["s1"]), flag("p02", ["lettering"])], current, reg));
    expect(rows["mask/b"]).toBeUndefined();
    expect(rows["wordmark/w"]).toBeUndefined();
    expect(rows["palette/starter"]).toBeUndefined();
    expect(rows["mask/a"]).toMatchObject({ status: "rejected" });
  });

  it("a page not marked done counts as not shown, but its flags still count", () => {
    const rows = byId(approvalDecisions(pages, [flag("p01", ["s1"], false), flag("p02", [], false)], {}, reg));
    expect(rows["mask/a"]).toMatchObject({ status: "rejected" });
    expect(rows["mask/c"]).toBeUndefined();
    expect(rows["wordmark/w"]).toBeUndefined();
    expect(approvalDecisions(pages, [], {}, reg)).toEqual([]);
  });

  it("an asset shown on an undone page and a done page is approved only by the done one", () => {
    const rows = byId(approvalDecisions(pages, [flag("p01", [], false), flag("p02", [])], {}, reg));
    expect(rows["mask/a"]).toMatchObject({ status: "approved", reason: "shown on p02, not flagged" });
    expect(rows["mask/b"]).toBeUndefined();
  });

  it("summarises the counts and the drafts left", () => {
    const rows = approvalDecisions(pages, [flag("p01", ["s1"]), flag("p02", [])], {}, reg);
    const s = summarizeApproval(rows, {}, reg);
    expect(s).toMatchObject({ approved: 3, rejected: 2, stillDraftTotal: 1, stillDraft: { mask: 1 } });
  });
});

describe("export round trip", () => {
  it("approval:export then inventory:decide: new ratings land, the pilot ratings stay as they were", () => {
    const reg = inventory();
    const drafts = reg.byKind("wordmark").filter((a) => a.status === "draft").map((a) => a.id);
    expect(drafts.length).toBeGreaterThanOrEqual(3);
    const [kept, flagged, fine, unseen] = drafts as [string, string, string, string];
    const dir = mkdtempSync(path.join(tmpdir(), "approval-rt-"));
    try {
      const decisions = path.join(dir, "decisions.json");
      const itemsFile = path.join(dir, "items.json");
      const flagsFile = path.join(dir, "flags.json");
      const out = path.join(dir, "export.json");
      const pilot = { [kept]: { status: "approved" as const, at: "2026-10-01T00:00:00.000Z", reason: "pilot" } };
      writeFileSync(decisions, formatDecisions(pilot));
      writeFileSync(
        itemsFile,
        JSON.stringify({
          pages: [
            { id: "p01", parts: [{ id: "s1", assets: [kept, flagged] }, { id: "fonts", assets: [fine] }] },
            { id: "p02", parts: [{ id: "s1", assets: [unseen] }] },
          ],
        }),
      );
      writeFileSync(
        flagsFile,
        JSON.stringify([
          { pageId: "p01", flagged: ["s1"], note: "no", done: true, at: AT },
          { pageId: "p02", flagged: [], done: false },
        ]),
      );
      const script = path.join(scripts, "approval-export.ts");
      const log = execFileSync(process.execPath, ["--import", "tsx", script, flagsFile, "--items", itemsFile, "--decisions", decisions, "--out", out], { encoding: "utf8" });
      expect(log).toMatch(/2 rows: 1 approved, 1 rejected/);
      expect(log).toMatch(/draft assets stay/);
      const rows = JSON.parse(readFileSync(out, "utf8")) as { id: string; status: string }[];
      expect(Object.fromEntries(rows.map((r) => [r.id, r.status]))).toEqual({ [flagged]: "rejected", [fine]: "approved" });

      execFileSync(process.execPath, ["--import", "tsx", path.join(scripts, "decide.ts"), out, "--decisions", decisions], { encoding: "utf8" });
      const after = Decisions.parse(JSON.parse(readFileSync(decisions, "utf8")));
      expect(after[kept]).toEqual(pilot[kept]);
      expect(after[flagged]).toMatchObject({ status: "rejected", reason: `flagged on p01` });
      expect(after[fine]).toMatchObject({ status: "approved" });
      expect(after[unseen]).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
