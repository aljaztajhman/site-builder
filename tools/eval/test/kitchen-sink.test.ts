import { describe, expect, it } from "vitest";
import { checkFacts } from "@sb/engine";
import { ELEMENT_KINDS, validateSite, type ComposedProps } from "@sb/spec";
import { loadFixture } from "../src/fixtures/load.ts";
import { KITCHEN_SINK_FIXTURE, kitchenSinkSpecOnly } from "../src/kitchen-sink.ts";

/** The kitchen-sink fixture is valid, uses only the client's facts, and really uses every element kind and arrangement. */
describe("kitchen-sink fixture", () => {
  it("validates with no issue and has no fact outside the brief", async () => {
    const spec = await kitchenSinkSpecOnly();
    const v = validateSite(spec);
    expect(v.ok ? [] : v.issues.map((i) => `${i.path}: ${i.message}`)).toEqual([]);
    // The one exception is the before-after pair: the brief has no words for "before" and "after" and none are invented,
    // so the pair is unlabelled and a real site could not publish it (the renderer's own Prej/Potem labels are what it shows).
    const found = checkFacts(spec, loadFixture(KITCHEN_SINK_FIXTURE).brief.description);
    expect(found.map((f) => `${f.kind} ${f.path}`)).toEqual(["photo /pages/1/sections/0/props/elements/1/captions"]);
  });

  it("uses every element kind and every photos arrangement", async () => {
    const spec = await kitchenSinkSpecOnly();
    const els = spec.pages.flatMap((p) => p.sections.flatMap((s) => (s.type === "composed" ? (s.props as ComposedProps).elements : [])));
    expect(new Set(els.map((e) => e.kind))).toEqual(new Set(ELEMENT_KINDS));
    const arrangements = els.flatMap((e) => (e.kind === "photos" ? [e.arrangement] : []));
    expect(new Set(arrangements)).toEqual(new Set(["fan", "stack", "offset-pair", "strip", "before-after"]));
  });
});
