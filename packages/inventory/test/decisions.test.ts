import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Decisions, Registry, applyDecisions, formatDecisions, inventory, mergeDecisions, shippedDecisions, todaysAssets, unknownDecisionIds, type Asset } from "../src/index.ts";

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

describe("decisions.json", () => {
  it("the checked-in file parses and names only registered assets", () => {
    const d = shippedDecisions();
    expect(unknownDecisionIds(todaysAssets(), d)).toEqual([]);
    // The registry carries each decided status.
    for (const [id, dec] of Object.entries(d)) expect(inventory().byId(id)!.status, id).toBe(dec.status);
  });

  it("ids must be asset ids, statuses and dates valid, no extra fields", () => {
    expect(Decisions.safeParse({ "font/archivo": { status: "approved", at: AT } }).success).toBe(true);
    expect(Decisions.safeParse({ "nope/x": { status: "approved", at: AT } }).success).toBe(false);
    expect(Decisions.safeParse({ "Font/X": { status: "approved", at: AT } }).success).toBe(false);
    expect(Decisions.safeParse({ "font/archivo": { status: "maybe", at: AT } }).success).toBe(false);
    expect(Decisions.safeParse({ "font/archivo": { status: "approved", at: "yesterday" } }).success).toBe(false);
    expect(Decisions.safeParse({ "font/archivo": { status: "approved", at: AT, by: "x" } }).success).toBe(false);
  });

  it("flips status: draft → approved, draft → rejected, approved → rejected; others keep their default", () => {
    const assets = [asset("motif/a", "motif"), asset("motif/b", "motif"), asset("palette/c", "palette", "approved"), asset("palette/d", "palette", "approved"), asset("mask/e", "mask")];
    const out = applyDecisions(assets, {
      "motif/a": { status: "approved", at: AT },
      "motif/b": { status: "rejected", at: AT, reason: "too busy" },
      "palette/c": { status: "rejected", at: AT },
    });
    expect(out.map((a) => a.status)).toEqual(["approved", "rejected", "rejected", "approved", "draft"]);
    // Rejected assets stay registered as rejected (taste data) and never reach a shortlist query for approved.
    const r = new Registry().registerAll(out);
    expect(r.size).toBe(5);
    expect(r.query({ status: "rejected" }).map((a) => a.id)).toEqual(["motif/b", "palette/c"]);
    // The input is not mutated.
    expect(assets[0]!.status).toBe("draft");
  });

  it("a decision for an unknown id fails", () => {
    expect(() => applyDecisions([asset("motif/a", "motif")], { "motif/zz": { status: "approved", at: AT } })).toThrow(/unknown asset ids: motif\/zz/);
    expect(unknownDecisionIds(todaysAssets(), { "motif/does-not-exist": { status: "rejected", at: AT } })).toEqual(["motif/does-not-exist"]);
  });
});

describe("merging a gallery export", () => {
  const now = new Date(AT);

  it("replaces exported ids, keeps the rest, sorts by id, sets at = now, drops blank reasons", () => {
    const current: Decisions = { "palette/z": { status: "approved", at: "2026-01-01T00:00:00.000Z" }, "motif/b": { status: "draft", at: "2026-01-01T00:00:00.000Z", reason: "old" } };
    const merged = mergeDecisions(
      current,
      [
        { id: "motif/b", status: "approved" },
        { id: "font/archivo", status: "rejected", reason: "  too wide  " },
        { id: "mask/arch", status: "approved", reason: " " },
      ],
      now,
    );
    expect(Object.keys(merged)).toEqual(["font/archivo", "mask/arch", "motif/b", "palette/z"]);
    expect(merged).toEqual({
      "font/archivo": { status: "rejected", at: AT, reason: "too wide" },
      "mask/arch": { status: "approved", at: AT },
      "motif/b": { status: "approved", at: AT },
      "palette/z": { status: "approved", at: "2026-01-01T00:00:00.000Z" },
    });
  });

  it("is deterministic: the same export in any order gives the same file; a later row wins", () => {
    const rows = [
      { id: "motif/b", status: "approved" as const },
      { id: "font/archivo", status: "rejected" as const, reason: "x" },
    ];
    const a = formatDecisions(mergeDecisions({}, rows, now));
    const b = formatDecisions(mergeDecisions({}, [...rows].reverse(), now));
    expect(a).toBe(b);
    expect(a.endsWith("}\n")).toBe(true);
    expect(mergeDecisions({}, [...rows, { id: "motif/b", status: "rejected" }], now)["motif/b"]!.status).toBe("rejected");
  });

  it("refuses rows that aren't asset ids or statuses; ignores extra gallery fields", () => {
    expect(() => mergeDecisions({}, [{ id: "bad", status: "approved" }], now)).toThrow();
    expect(() => mergeDecisions({}, [{ id: "font/a", status: "yes" } as never], now)).toThrow();
    expect(mergeDecisions({}, [{ id: "font/a", status: "approved", kind: "font", thumbnail: "x.jpg" } as never], now)).toEqual({ "font/a": { status: "approved", at: AT } });
  });

  it("pnpm inventory:decide merges an export file into decisions.json and refuses unregistered ids", () => {
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/decide.ts");
    const dir = mkdtempSync(path.join(tmpdir(), "inv-decide-"));
    try {
      const file = path.join(dir, "decisions.json");
      const exp = path.join(dir, "export.json");
      writeFileSync(file, formatDecisions({ "section/menu:classic": { status: "approved", at: AT } }));
      writeFileSync(exp, JSON.stringify([{ id: "motif/pipes", status: "rejected", reason: "too literal" }, { id: "font/inter-tight", status: "approved", kind: "font" }]));
      const run = (): string => execFileSync(process.execPath, ["--import", "tsx", script, exp, "--decisions", file], { encoding: "utf8" });
      expect(run()).toMatch(/2 rows merged \(1 rejected, 1 approved\), 3 decisions in total/);
      const first = Decisions.parse(JSON.parse(readFileSync(file, "utf8")));
      expect(Object.keys(first)).toEqual(["font/inter-tight", "motif/pipes", "section/menu:classic"]);
      expect(first["motif/pipes"]).toMatchObject({ status: "rejected", reason: "too literal" });
      expect(first["section/menu:classic"]!.at).toBe(AT);
      // Running it again changes only the `at` of the exported rows.
      run();
      const second = Decisions.parse(JSON.parse(readFileSync(file, "utf8")));
      const noAt = (d: Decisions) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, at: "" }]));
      expect(noAt(second)).toEqual(noAt(first));

      writeFileSync(exp, JSON.stringify([{ id: "motif/not-registered", status: "approved" }]));
      const before = readFileSync(file, "utf8");
      expect(() => execFileSync(process.execPath, ["--import", "tsx", script, exp, "--decisions", file], { stdio: "pipe" })).toThrow(/motif\/not-registered/);
      expect(readFileSync(file, "utf8")).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
