import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getAt, migrateSpec, repairRepeatedSentences, validateSite, type SiteSpec } from "@sb/spec";
import { renderedPageText, visibleText } from "../src/page-text.ts";

/**
 * A sentence at most once per page (the outside review of 50 pages, 2026-10-15: "the same sentence twice" held
 * frizerstvo-lana and gostisce-na-gricu with all three reviewers). Generation's repair counts sentences on the rendered
 * page; the cases are the review's saved specs.
 */
const specs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../eval/outside-review/review50-specs");
const load = (id: string, file: "spec-generated.json" | "spec-regenerated.json"): SiteSpec =>
  migrateSpec(JSON.parse(readFileSync(path.join(specs, id, file), "utf8")));
const props = (spec: SiteSpec, si: number) => spec.pages[0]!.sections[si]!.props;

describe("visible text of a rendered page", () => {
  it("leaves out scripts, styles, links and buttons; tags become spaces, entities decoded", () => {
    const html = `<html><head><title>T</title></head><body><p>Ena&nbsp;dva &amp; tri.</p><p>Štiri</p><a href="#">Pokličite</a><button>Pošlji</button><script>x()</script><style>p{}</style><p>&#269;&#x161;</p></body></html>`;
    expect(visibleText(html).replace(/\s+/g, " ").trim()).toBe("Ena dva & tri. Štiri čš");
  });
});

describe("repairRepeatedSentences on the review's pages", () => {
  it("drops the hours section's copy of the hours note; the hours keep theirs (frizerstvo-lana, gostisce-na-gricu)", () => {
    for (const [id, file] of [
      ["frizerstvo-lana", "spec-generated.json"],
      ["gostisce-na-gricu", "spec-regenerated.json"],
    ] as const) {
      const spec = load(id, file);
      const hoursNote = JSON.stringify(spec.business.hours);
      const si = spec.pages[0]!.sections.findIndex((s) => s.type === "opening-hours");
      expect(repairRepeatedSentences(spec, renderedPageText), id).toEqual([`/pages/0/sections/${si}/props/note: the hours note says it already; dropped the note`]);
      expect((props(spec, si) as { note?: string }).note, id).toBeUndefined();
      expect(JSON.stringify(spec.business.hours)).toBe(hoursNote);
      expect(validateSite(spec).ok).toBe(true);
    }
  });

  it("a note the hero's variant doesn't draw is not a copy: frizerstvo-lana's hero keeps its factNote", () => {
    const spec = load("frizerstvo-lana", "spec-generated.json");
    const factNote = getAt(props(spec, 0), "/factNote");
    repairRepeatedSentences(spec, renderedPageText);
    expect(getAt(props(spec, 0), "/factNote")).toBe(factNote);
  });

  it("takes the later copy out of its paragraph and keeps the paragraph's other sentence (kmetija-grabnar)", () => {
    const spec = load("kmetija-grabnar", "spec-regenerated.json");
    repairRepeatedSentences(spec, renderedPageText);
    expect(getAt(props(spec, 3), "/paragraphs/1")).toBe("Nočitev z zajtrkom stane 38 € na osebo, polpenzion 52 € na osebo.");
    expect(getAt(props(spec, 2), "/intro")).toBe("Vse enote imajo lastno kopalnico in pogled na gore. Otroci do 6 let so brezplačni.");
  });

  it("takes the hero's copy when the later one is a step's whole required text (kljucavnicarstvo-hrovat)", () => {
    const spec = load("kljucavnicarstvo-hrovat", "spec-regenerated.json");
    const step = getAt(props(spec, 3), "/steps/1/text");
    repairRepeatedSentences(spec, renderedPageText);
    expect(getAt(props(spec, 3), "/steps/1/text")).toBe(step);
    expect(getAt(props(spec, 0), "/intro")).toBe("Vrata, avtomobile in sefe odpiram vse dni v letu, tudi za praznike.");
    expect(validateSite(spec).ok).toBe(true);
  });

  it("a fact two items of one list share stays with both (pekarna-kvas: potica and krofi, Fridays and Saturdays)", () => {
    const spec = migrateSpec(JSON.parse(readFileSync(path.join(specs, "../../../tools/eval/zero-to-live/specs/pekarna-kvas.json"), "utf8")));
    const before = JSON.stringify(spec.pages[1]!.sections[1]!.props);
    const log = repairRepeatedSentences(spec, renderedPageText);
    expect(log.filter((l) => l.startsWith("/pages/1/"))).toEqual([]);
    expect(JSON.stringify(spec.pages[1]!.sections[1]!.props)).toBe(before);
  });

  it("when every copy left is a required field, one stays and the line says so (vulkanizer-zorman)", () => {
    const spec = load("vulkanizer-zorman", "spec-regenerated.json");
    const item = getAt(props(spec, 1), "/items/0/description");
    const log = repairRepeatedSentences(spec, renderedPageText);
    // The service keeps its required description; the hero's intro gives up that sentence and keeps the other one,
    // which the hours note also says: the intro can't be empty, so that repeat stays for the check and the critique.
    expect(getAt(props(spec, 1), "/items/0/description")).toBe(item);
    expect(getAt(props(spec, 0), "/intro")).toBe("Spomladi in jeseni je gneča, zato se prej naročite po telefonu.");
    expect(log).toEqual([expect.stringMatching(/intro: .* dropped it here$/), expect.stringMatching(/^\/pages\/0: "spomladi in jeseni .* left it/)]);
    expect(validateSite(spec).ok).toBe(true);
  });

  it("all 100 saved review pages: each sentence shown once but for two whose copies are all required, as valid as before", () => {
    const left: string[] = [];
    for (const id of readdirSync(specs).sort())
      for (const file of ["spec-generated.json", "spec-regenerated.json"] as const) {
        if (!existsSync(path.join(specs, id, file))) continue;
        const spec = load(id, file);
        const wasValid = validateSite(spec).ok;
        for (const l of repairRepeatedSentences(spec, renderedPageText)) if (l.includes("left it")) left.push(`${id} ${file}`);
        expect(repairRepeatedSentences(spec, renderedPageText).filter((l) => !l.includes("left it")), `${id} ${file}: one pass repairs all it can`).toEqual([]);
        expect(validateSite(spec).ok, `${id} ${file}`).toBe(wasValid);
      }
    expect(left).toEqual(["karoserija-hribar spec-generated.json", "vulkanizer-zorman spec-regenerated.json"]);
  }, 120_000);
});
