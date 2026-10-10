import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ALL_PROMPT_FIXES,
  CritiqueOutput,
  EditOutput,
  NO_PROMPT_FIXES,
  businessSchema,
  briefJsonSchema,
  classificationJsonSchema,
  compactBusinessSchema,
  compactSectionCatalogue,
  contentJsonSchema,
  sectionCatalogue,
} from "../src/index.ts";
import { toModelJsonSchema } from "@sb/spec";

/**
 * Spec v20 (composition language v2, docs/plans/studio-phase1-design.md §1.6, §3.3): with the designer off, no model
 * request changes. Composed sections stay designerOnly, and the new design.motion, design.wordmark and
 * business.amenities are SYSTEM_ONLY, so every schema and catalogue the model is sent is byte-identical to spec v19's.
 * The hashes below were taken at spec v19 (origin/claude/studio-f1b, 4c13711) and must not move with v20.
 */
const TEXTS: Record<string, () => string> = {
  sectionCatalogue: () => sectionCatalogue(NO_PROMPT_FIXES),
  sectionCatalogueFixed: () => sectionCatalogue(ALL_PROMPT_FIXES),
  compactSectionCatalogue: () => compactSectionCatalogue(NO_PROMPT_FIXES),
  compactSectionCatalogueFixed: () => compactSectionCatalogue(ALL_PROMPT_FIXES),
  businessSchema: () => businessSchema(),
  compactBusinessSchema: () => compactBusinessSchema(),
  contentJsonSchema: () => JSON.stringify(contentJsonSchema()),
  briefJsonSchema: () => JSON.stringify(briefJsonSchema()),
  briefConceptJsonSchema: () => JSON.stringify(briefJsonSchema(true)),
  classificationJsonSchema: () => JSON.stringify(classificationJsonSchema()),
  editOutput: () => JSON.stringify(toModelJsonSchema(EditOutput)),
  critiqueOutput: () => JSON.stringify(toModelJsonSchema(CritiqueOutput)),
};

const V19: Record<string, string> = {
  briefConceptJsonSchema: "eabe408a89006b0b",
  briefJsonSchema: "4a6415ed8e903caf",
  businessSchema: "4e0f96995bd0d4be",
  classificationJsonSchema: "9157abaf228dacc2",
  compactBusinessSchema: "39c33ff035bf679e",
  compactSectionCatalogue: "83edb6f9a878712d",
  compactSectionCatalogueFixed: "c58b299b17e9cc71",
  contentJsonSchema: "0dc45431e07efbd9",
  critiqueOutput: "0222d4d23713ce34",
  editOutput: "8dd42fb6a030caf6",
  sectionCatalogue: "c1ca4f753e529bc2",
  sectionCatalogueFixed: "e87786256f394e2b",
};

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

describe("designer off: spec v20 changes no model request", () => {
  it("sends the same catalogues and schemas as spec v19", () => {
    const now = Object.fromEntries(Object.entries(TEXTS).map(([k, f]) => [k, hash(f())]));
    expect(now).toEqual(V19);
  });

  it("never names a v20 field, element kind or vocabulary in them", () => {
    for (const [k, f] of Object.entries(TEXTS)) {
      const text = f();
      for (const word of ["amenities", "iconFacts", "headerOver", "x-vocab", "x-system-only", '"composed"', "### composed"]) expect(text, `${k}: ${word}`).not.toContain(word);
    }
  });
});
