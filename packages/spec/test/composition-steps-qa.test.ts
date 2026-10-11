import { describe, expect, it } from "vitest";
import {
  ELEMENT_KINDS,
  Element,
  fillPreset,
  fullSources,
  slotProblem,
  slotValue,
  validatePreset,
  type CompositionPreset,
  type PresetSources,
} from "../src/index.ts";

/** The `steps` and `qa` element kinds and their slots (spec v21, studio I3b). */

const at = { desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } };
const el = (fields: object) => ({ id: "e_x", ...at, ...fields });
const ok = (fields: object) => Element.safeParse(el(fields)).success;

const step = (n: number) => ({ title: `Korak ${n}`, text: `Opis koraka ${n}` });
const STEPS = { kind: "steps", items: [step(1), step(2)], style: "line" } as const;
const QA = { kind: "qa", items: [{ question: "Ali delate ob sobotah?", answer: "Da, do poldneva." }], style: "toggle" } as const;

describe("steps and qa: schema", () => {
  it("are element kinds, strict", () => {
    for (const k of ["steps", "qa"]) expect(ELEMENT_KINDS as readonly string[]).toContain(k);
    expect(ok(STEPS)).toBe(true);
    expect(ok(QA)).toBe(true);
    expect(ok({ ...STEPS, extra: 1 })).toBe(false);
    expect(ok({ ...QA, extra: 1 })).toBe(false);
  });

  it("steps: 2–6 items, title ≤ 60, text ≤ 240, style numbered or line (or none), colour roles", () => {
    expect(ok({ ...STEPS, items: [step(1)] })).toBe(false);
    expect(ok({ ...STEPS, items: Array.from({ length: 6 }, (_, i) => step(i)) })).toBe(true);
    expect(ok({ ...STEPS, items: Array.from({ length: 7 }, (_, i) => step(i)) })).toBe(false);
    expect(ok({ ...STEPS, items: [{ title: "t".repeat(60), text: "x".repeat(240) }, step(2)] })).toBe(true);
    expect(ok({ ...STEPS, items: [{ title: "t".repeat(61), text: "x" }, step(2)] })).toBe(false);
    expect(ok({ ...STEPS, items: [{ title: "t", text: "x".repeat(241) }, step(2)] })).toBe(false);
    expect(ok({ ...STEPS, items: [{ title: "t" }, step(2)] })).toBe(false);
    expect(ok({ kind: "steps", items: [step(1), step(2)] })).toBe(true);
    for (const style of ["numbered", "line"]) expect(ok({ ...STEPS, style }), style).toBe(true);
    expect(ok({ ...STEPS, style: "timeline" })).toBe(false);
    expect(ok({ ...STEPS, color: "muted" })).toBe(true);
    expect(ok({ ...STEPS, color: "#000000" })).toBe(false);
  });

  it("qa: 1–12 items, question ≤ 140, answer ≤ 600, style open or toggle (or none)", () => {
    const item = { question: "Q?", answer: "A." };
    expect(ok({ ...QA, items: [] })).toBe(false);
    expect(ok({ ...QA, items: Array.from({ length: 12 }, () => item) })).toBe(true);
    expect(ok({ ...QA, items: Array.from({ length: 13 }, () => item) })).toBe(false);
    expect(ok({ ...QA, items: [{ question: "q".repeat(140), answer: "a".repeat(600) }] })).toBe(true);
    expect(ok({ ...QA, items: [{ question: "q".repeat(141), answer: "a" }] })).toBe(false);
    expect(ok({ ...QA, items: [{ question: "q", answer: "a".repeat(601) }] })).toBe(false);
    expect(ok({ ...QA, items: [{ question: "q" }] })).toBe(false);
    expect(ok({ kind: "qa", items: [item] })).toBe(true);
    for (const style of ["open", "toggle"]) expect(ok({ ...QA, style }), style).toBe(true);
    expect(ok({ ...QA, style: "accordion" })).toBe(false);
  });
});

describe("steps and qa: slots", () => {
  it("brief.steps[] and brief.faq[] are in the vocabulary, indices 0–11", () => {
    for (const s of ["brief.steps[0].title", "brief.steps[11].text", "brief.faq[3].question", "brief.faq[0].answer"]) expect(slotProblem(s), s).toBeNull();
    expect(slotProblem("brief.steps[12].title")).toMatch(/index 12/);
    expect(slotProblem("brief.steps[0]")).toMatch(/unknown slot/);
    expect(slotProblem("brief.faq[0].rating")).toMatch(/unknown slot/);
  });

  it("read only what the brief holds; without it there is no value", () => {
    const src: PresetSources = { ...fullSources(), brief: { steps: [{ title: " Korak  ena ", text: "Opis" }], faq: [{ question: "Vprašanje?", answer: "Odgovor." }] } };
    expect(slotValue("brief.steps[0].title", src)).toBe("Korak ena");
    expect(slotValue("brief.steps[0].text", src)).toBe("Opis");
    expect(slotValue("brief.steps[1].title", src)).toBeUndefined();
    expect(slotValue("brief.faq[0].question", src)).toBe("Vprašanje?");
    expect(slotValue("brief.faq[0].answer", src)).toBe("Odgovor.");
    expect(slotValue("brief.faq[1].answer", src)).toBeUndefined();
    expect(slotValue("brief.steps[0].title", { ...fullSources(), brief: {} })).toBeUndefined();
  });
});

const d = (col: number, span: number, row: number) => ({ col, span, row });
const ph = (order: number) => ({ order, span: "full" as const });

const stepsPreset = (n = 4): CompositionPreset => ({
  id: "composition/steps/test-steps",
  props: {
    intent: "steps",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: d(1, 8, 1), phone: ph(0) },
      { id: "e_steps", kind: "steps", style: "numbered", items: Array.from({ length: n }, (_, i) => ({ title: `{brief.steps[${i}].title}`, text: `{brief.steps[${i}].text}` })), desk: d(1, 8, 2), phone: ph(1) },
    ],
  },
});

const faqPreset = (n = 4): CompositionPreset => ({
  id: "composition/faq/test-qa",
  props: {
    intent: "faq",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 2, size: 3, desk: d(1, 8, 1), phone: ph(0) },
      { id: "e_qa", kind: "qa", style: "toggle", items: Array.from({ length: n }, (_, i) => ({ question: `{brief.faq[${i}].question}`, answer: `{brief.faq[${i}].answer}` })), desk: d(1, 8, 2), phone: ph(1) },
    ],
  },
});

const sources = (brief: PresetSources["brief"]): PresetSources => ({ ...fullSources(), brief });

describe("steps and qa: presets", () => {
  it("validate and fill from full sources with nothing dropped", () => {
    expect(validatePreset(stepsPreset())).toEqual([]);
    expect(validatePreset(faqPreset())).toEqual([]);
  });

  it("bind the brief's own steps and questions, in order", () => {
    const r = fillPreset(stepsPreset(), sources({ steps: [{ title: "Naročilo", text: "Pokličete nas." }, { title: "Pregled", text: "Pogledamo vozilo." }, { title: "Popravilo", text: "Popravimo." }] }));
    if (!r.ok) throw new Error(r.issues.join("; "));
    const e = r.props.elements.find((x) => x.kind === "steps");
    expect(e && e.kind === "steps" && e.items).toEqual([
      { title: "Naročilo", text: "Pokličete nas." },
      { title: "Pregled", text: "Pogledamo vozilo." },
      { title: "Popravilo", text: "Popravimo." },
    ]);
    const q = fillPreset(faqPreset(), sources({ faq: [{ question: "Ali delate ob sobotah?", answer: "Da." }] }));
    if (!q.ok) throw new Error(q.issues.join("; "));
    const qa = q.props.elements.find((x) => x.kind === "qa");
    expect(qa && qa.kind === "qa" && qa.items).toEqual([{ question: "Ali delate ob sobotah?", answer: "Da." }]);
  });

  it("drop the element when the brief has none (never invented); the section then fails its intent, so the preset isn't used", () => {
    const none = fillPreset(stepsPreset(), sources({}));
    expect(none).toMatchObject({ ok: false, reason: "invalid", dropped: [{ id: "e_steps", kind: "steps" }] });
    expect(none.ok ? [] : none.issues.join(";")).toMatch(/intent steps needs a steps element/);
    // One step is not a process (2 at least): the element goes the same way.
    const one = fillPreset(stepsPreset(), sources({ steps: [{ title: "Naročilo", text: "Pokličete nas." }] }));
    expect(one).toMatchObject({ ok: false, reason: "invalid", dropped: [{ id: "e_steps" }] });
    const noFaq = fillPreset(faqPreset(), sources({}));
    expect(noFaq).toMatchObject({ ok: false, reason: "invalid", dropped: [{ id: "e_qa", kind: "qa" }] });
    expect(noFaq.ok ? [] : noFaq.issues.join(";")).toMatch(/intent faq needs a qa element/);
  });

  it("elsewhere the element is just dropped and the section closes up behind it", () => {
    const p = stepsPreset();
    (p.props as { intent: string }).intent = "story";
    const r = fillPreset(p, sources({}));
    if (!r.ok) throw new Error(r.issues.join("; "));
    expect(r.dropped.map((x) => [x.id, x.kind])).toEqual([["e_steps", "steps"]]);
    expect(r.props.elements.map((x) => x.kind)).toEqual(["heading"]);
  });

  it("an item missing half its words is left out, the rest stay", () => {
    const r = fillPreset(faqPreset(), sources({ faq: [{ question: "Prvo?", answer: "Da." }, { question: "Drugo?", answer: "" }, { question: "Tretje?", answer: "Ne." }] }));
    if (!r.ok) throw new Error(r.issues.join("; "));
    const qa = r.props.elements.find((x) => x.kind === "qa");
    expect(qa && qa.kind === "qa" && qa.items.map((i) => i.question)).toEqual(["Prvo?", "Tretje?"]);
  });
});
