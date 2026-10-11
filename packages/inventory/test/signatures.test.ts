import { describe, expect, it } from "vitest";
import { INTENTS, STANCES, parseAssetId } from "@sb/spec";
import { MUST_DRAW_MOTIFS, KIND_COMPLETE, Registry, inventory, resolveSignature } from "../src/index.ts";

describe("resolveSignature", () => {
  const reg = inventory();

  it("resolved: registered; pending: a valid id of a kind not yet built; unknown: the rest", () => {
    expect(resolveSignature("fact/plate", reg)).toBe("resolved");
    expect(resolveSignature("mask/arch", reg)).toBe("resolved");
    expect(resolveSignature("treatment/duotone", reg)).toBe("resolved");
    expect(resolveSignature("pairing/bricolage-figtree", reg)).toBe("resolved");
    expect(resolveSignature("submotif/wire", reg)).toBe("resolved");
    expect(resolveSignature("divider/torn-edge", reg)).toBe("pending");
    expect(resolveSignature("type-treatment/masthead", reg)).toBe("resolved"); // batch I6a drew it (draft)
    expect(resolveSignature("type-treatment/tabular-figures", reg)).toBe("pending");
    expect(resolveSignature("composition/hero/front-page", reg)).toBe("pending");
    expect(resolveSignature("fact/hologram", reg)).toBe("unknown");
    expect(resolveSignature("mask/none", reg)).toBe("unknown");
    expect(resolveSignature("imagery/duotone", reg)).toBe("unknown");
    expect(resolveSignature("typeTreatment/masthead", reg)).toBe("unknown");
    expect(resolveSignature("nonsense", reg)).toBe("unknown");
    expect(resolveSignature("motif/nonexistent", new Registry())).toBe("unknown");
  });

  it("a registered asset of any status resolves", () => {
    const first = reg.all()[0]!;
    expect(resolveSignature(first.id, new Registry().registerAll([{ ...first, status: "draft" }]))).toBe("resolved");
  });

  it("every signature of all 80 stances resolves or is pending: 0 unknown", () => {
    expect(STANCES.length).toBe(80);
    const unknown: string[] = [];
    const counts: Record<string, { resolved: number; pending: number }> = {};
    for (const s of STANCES) {
      for (const id of s.signatures) {
        const state = resolveSignature(id, reg);
        const kind = parseAssetId(id).kind;
        counts[kind] ??= { resolved: 0, pending: 0 };
        if (state === "unknown") unknown.push(`${s.id}: ${id}`);
        else counts[kind]![state]++;
      }
    }
    console.log("signature counts per kind", JSON.stringify(counts));
    expect(unknown).toEqual([]);
  });

  it("composition signatures name a spec intent", () => {
    for (const s of STANCES)
      for (const id of s.signatures.filter((x) => x.startsWith("composition/"))) {
        expect(INTENTS as readonly string[], `${s.id} ${id}`).toContain(id.split("/")[1]);
      }
  });

  it("shapes live in axes.shape, not in signatures", () => {
    for (const s of STANCES) expect(s.signatures.some((x) => x.startsWith("shape/")), s.id).toBe(false);
  });

  it("every pending motif ref is on the must-draw list, and the list holds only pending motifs", () => {
    const pendingMotifs = new Set<string>();
    for (const s of STANCES)
      for (const id of s.signatures)
        if ((id.startsWith("motif/") || id.startsWith("submotif/")) && reg.byId(id) === undefined) pendingMotifs.add(id);
    // motif and submotif are complete kinds, so a missing one is unknown unless it is declared must-draw.
    for (const id of pendingMotifs) expect(MUST_DRAW_MOTIFS, id).toContain(id);
    for (const id of MUST_DRAW_MOTIFS) expect(pendingMotifs.has(id), `${id} is on the list but no stance names it`).toBe(true);
  });

  it("KIND_COMPLETE holds the merged batches", () => {
    expect([...KIND_COMPLETE].sort()).toEqual(
      ["factObject", "font", "footer", "header", "mask", "motif", "submotif", "pairing", "palette", "section", "treatment", "texture"].sort(),
    );
  });
});
