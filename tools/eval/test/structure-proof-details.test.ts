// M1 type and details proof (docs/plans/m1-type-details.md C): type voices and the detail switches on the proof sets.
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@sb/config";
import { TYPE_VOICES, VOICE_IDS, typeVoice, validateSite, voiceOf, type SiteSpec, type VoiceId } from "@sb/spec";
import { PROOF_DETAILS, applyDetails, assignVoices, parseProofArgs, type ProofPage } from "../src/structure-proof.ts";
import { loadPrint, loadVarietyEntries, markdownLine, varietyOf } from "../src/set-variety.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const page = (id: string, o: Partial<ProofPage> = {}): ProofPage => ({
  id,
  business: o.business ?? id,
  trade: o.trade ?? `trade-${id}`,
  town: o.town ?? `town-${id}`,
  clientPhotos: o.clientPhotos ?? 0,
  aiPictures: o.aiPictures ?? 0,
});
const counts = (m: Map<string, VoiceId>) => {
  const c = new Map<VoiceId, number>();
  for (const v of m.values()) c.set(v, (c.get(v) ?? 0) + 1);
  return c;
};

describe("assignVoices", () => {
  const ten = Array.from({ length: 10 }, (_, i) => page(`p${i}`, { trade: ["pekarna", "avtoservis", "frizer"][i % 3]! }));
  // Review 50: 25 businesses, each with a generated and a regenerated page next to each other.
  const fifty = Array.from({ length: 50 }, (_, i) => page(`b${Math.floor(i / 2)}-${i % 2 ? "regen" : "gen"}`, { business: `b${Math.floor(i / 2)}`, trade: `t${Math.floor(i / 4)}` }));

  it("gives every page a voice, no voice on more than 25 % of the set", () => {
    for (const set of [ten, fifty]) {
      const m = assignVoices(set);
      expect(m.size).toBe(set.length);
      for (const v of m.values()) expect(VOICE_IDS).toContain(v);
      for (const n of counts(m).values()) expect(n).toBeLessThanOrEqual(Math.max(1, Math.floor(0.25 * set.length)));
    }
  });

  it("uses at least 6 voices on a set of 10 or more, so the set never reads as two faces", () => {
    expect(counts(assignVoices(ten)).size).toBeGreaterThanOrEqual(6);
    expect(counts(assignVoices(fifty)).size).toBe(VOICE_IDS.length);
  });

  it("gives neighbours in list order, the two pages of a business and the pages of a small trade different voices", () => {
    const m = assignVoices(fifty);
    for (let i = 1; i < fifty.length; i++) expect(m.get(fifty[i]!.id), fifty[i]!.id).not.toBe(m.get(fifty[i - 1]!.id));
    const byTrade = new Map<string, VoiceId[]>();
    for (const p of fifty) byTrade.set(p.trade, [...(byTrade.get(p.trade) ?? []), m.get(p.id)!]);
    for (const [t, vs] of byTrade) expect(new Set(vs).size, t).toBe(vs.length);
  });

  it("is deterministic and takes overrides", () => {
    expect([...assignVoices(ten)]).toEqual([...assignVoices(ten)]);
    expect(assignVoices(ten, { overrides: { p3: "wide" } }).get("p3")).toBe("wide");
  });
});

describe("applyDetails", () => {
  const golden = JSON.parse(readFileSync(path.join(here, "../golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
  it("sets the voice's type on a copy and changes nothing else; the result validates", () => {
    for (const v of TYPE_VOICES) {
      const out = applyDetails(golden, v.id);
      expect(voiceOf(out.design)).toBe(v.id);
      expect(out.design.baseFontSize).toBe(typeVoice(v.id).baseFontSize);
      expect({ ...out, design: golden.design }).toEqual(golden);
      expect(validateSite(out).ok).toBe(true);
    }
    expect(voiceOf(golden.design)).not.toBe("wide");
  });
});

describe("--details", () => {
  it("is off by default (Wave P's output) and turns every detail switch on", () => {
    expect(parseProofArgs(["--set", "fresh10"]).details).toBeUndefined();
    expect(parseProofArgs(["--set", "fresh10", "--details"]).details).toEqual(PROOF_DETAILS);
    expect(PROOF_DETAILS).toEqual({ cta: true, header: true, aiCaption: true, fit: true, scale: true });
  });
});

describe("pnpm variety: voice share", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "set-variety-voice-"));
    for (const id of ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"]) copyFileSync(path.join(here, "../golden", `${id}.json`), path.join(dir, `${id}.spec.json`));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reports the largest voice's share when the manifest names voices", async () => {
    const manifest = path.join(dir, "manifest.json");
    const ids = ["pekarna-kvas", "avtoservis-mrak", "instalacije-rebernik"];
    writeFileSync(manifest, JSON.stringify(ids.map((id, i) => ({ id, spec: `${id}.spec.json`, voice: ["wide", "slab", "wide"][i] }))));
    const r = varietyOf(await Promise.all(loadVarietyEntries(manifest).map(loadPrint)), loadConfig().studio.uniqueness.weights);
    expect(r.voices).toEqual({ pages: 3, distinct: 2, maxShare: 2 / 3, counts: { wide: 2, slab: 1 } });
    expect(markdownLine("proof", r)).toContain("voice share max 67 % over 2 voices (wide 2, slab 1)");
  });
});
