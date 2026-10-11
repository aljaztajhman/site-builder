import { describe, expect, it } from "vitest";
import { FACT_OBJECTS, STANCES, TYPE_TREATMENTS, validateSite } from "@sb/spec";
import { STARTER_NAMES } from "@sb/render";
import { BYTE_BUDGET, Registry, inventory, registeredAssets } from "../src/index.ts";
import { FACT_OBJECT_DRAFTS, TYPE_TREATMENT_DRAFTS, factObjectDraftAssets, typeTreatmentDraftAssets } from "../src/type-and-facts.ts";
import { FACT_OBJECT_SAMPLES, TYPE_TREATMENT_SAMPLES, pagesFor, treatmentSizes } from "../scripts/pages-v2.ts";

/** Batch I6: type treatments and fact objects as draft assets, and their contact-sheet pages. */
const added = (list: readonly string[], starters: readonly string[]) => list.filter((n) => !starters.includes(n));
const NEW_TYPE = added(TYPE_TREATMENTS, STARTER_NAMES["type-treatments"]);
const NEW_FACT = added(FACT_OBJECTS, STARTER_NAMES["fact-objects"]);
const registry = inventory();
/** As each batch registered it, before the owner's gallery decisions (approval rounds) are applied. */
const registered = new Registry().registerAll(registeredAssets());

/** The facts of the three fixtures the sheets may show (tools/eval/fixtures: pekarna-kvas, avtoservis-mrak, instalacije-rebernik), as the client gave them. */
const FIXTURE_VALUES = new Set(["30", "52", "18", "Kamnik", "Kranj", "Ptuj", "6.30–18.00", "7.00–16.00", "6.30–12.00", "7.00–10.00", "po dogovoru", "4,20 €", "1,30 €", "30 €", "59 €", "40 €", "od 18 €", "1 kg", "3,5 t", "041 555 906", "041 555 730", "041 555 118", "2008", "2011", "Jure Petek", "Rok Mrak", "Matej Rebernik"]);

describe("I6 draft assets", () => {
  it("every name the batch added is registered once, as a draft, with a note, its own licence and its bytes within the kind's budget", () => {
    const ids = [...NEW_TYPE.map((n) => `type-treatment/${n}`), ...NEW_FACT.map((n) => `fact/${n}`)];
    for (const id of ids) {
      const a = registered.byId(id);
      expect(a, id).toBeDefined();
      expect(a!.status, id).toBe("draft");
      expect(a!.license, id).toBe("own");
      expect(a!.note, id).toBeTruthy();
      expect(a!.bytes, id).toBeGreaterThan(0);
      expect(a!.bytes, id).toBeLessThanOrEqual(BYTE_BUDGET[a!.kind]!);
    }
    expect(BYTE_BUDGET.typeTreatment).toBe(1.5 * 1024);
    expect(typeTreatmentDraftAssets()).toHaveLength(NEW_TYPE.length);
    expect(factObjectDraftAssets()).toHaveLength(NEW_FACT.length);
    // The starters stay as they were: approved, and no type treatment starter is a draft of this batch.
    for (const n of STARTER_NAMES["fact-objects"]) expect(registry.byId(`fact/${n}`)?.status, n).not.toBe("draft");
    expect(Object.keys(TYPE_TREATMENT_DRAFTS).sort()).toEqual([...NEW_TYPE].sort());
    expect(Object.keys(FACT_OBJECT_DRAFTS).sort()).toEqual([...NEW_FACT].sort());
  });

  it("tags name real stances and every ground (the inks are guaranteed pairs or the text colour)", () => {
    const stances = new Set(STANCES.map((s) => s.id));
    for (const a of [...typeTreatmentDraftAssets(), ...factObjectDraftAssets()]) {
      for (const s of a.tags.stances) expect(stances.has(s), `${a.id}: ${s}`).toBe(true);
      expect(a.tags.ground, a.id).toEqual(["dark", "tint", "white"]);
    }
  });
});

describe("I6 contact-sheet pages", () => {
  it("type treatments: real headings at sizes 2/5/8 inside the G20 limits, valid sites in two palettes", () => {
    for (const n of NEW_TYPE) {
      expect(TYPE_TREATMENT_SAMPLES[n], n).toBeDefined();
      const pages = pagesFor(registry.byId(`type-treatment/${n}`)!);
      expect(pages, n).toHaveLength(2);
      for (const p of pages) {
        if (p.kind !== "site") throw new Error("site page expected");
        const v = validateSite(p.spec);
        expect(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`), `${n} ${p.variant}`).toEqual([]);
        const headings = p.spec.pages[0]!.sections.flatMap((s) => (s.type === "composed" ? s.props.elements.filter((e) => e.kind === "heading") : []));
        expect(headings.every((h) => h.kind === "heading" && h.treatment === n), n).toBe(true);
      }
    }
    expect(treatmentSizes("circle")).toEqual([2, 5, 8]);
    expect(treatmentSizes("vertical")).toEqual([4, 5, 5]);
  });

  it("fact objects: values only from the three fixtures' facts, sizes 2/5/8, the smallest linked, valid sites", () => {
    for (const n of NEW_FACT) {
      const samples = FACT_OBJECT_SAMPLES[n]!;
      for (const s of samples) expect(FIXTURE_VALUES.has(s.value), `${n}: ${s.value}`).toBe(true);
      const pages = pagesFor(registry.byId(`fact/${n}`)!);
      expect(pages, n).toHaveLength(2);
      for (const p of pages) {
        if (p.kind !== "site") throw new Error("site page expected");
        const v = validateSite(p.spec);
        expect(v.ok ? [] : v.issues.map((i) => `${i.path} ${i.message}`), `${n} ${p.variant}`).toEqual([]);
        const facts = p.spec.pages[0]!.sections.flatMap((s) => (s.type === "composed" ? s.props.elements.filter((e) => e.kind === "fact") : []));
        expect(facts.map((f) => (f.kind === "fact" ? f.size : 0)), n).toEqual([2, 5, 8, 5]);
        expect(facts[0]!.kind === "fact" && facts[0]!.link !== undefined, n).toBe(true);
      }
    }
  });
});
