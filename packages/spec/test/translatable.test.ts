import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { blockerMessage, blockerText, describePath, publishChecklist, sectionTexts, textsCount, translatableTexts, untranslated, type SiteSpec } from "../src/index.ts";

/**
 * The texts a second language needs (it-editor-languages) and the checklist entries for the ones still without a
 * translation: a site in two languages can't be published until every text of its pages has one.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (name = "pekarna-kvas"): SiteSpec => JSON.parse(readFileSync(path.join(here, `../../../tools/eval/golden/${name}.json`), "utf8")) as SiteSpec;
const english = (spec: SiteSpec, overlay: Record<string, string> = {}): SiteSpec => ({ ...spec, locales: { default: "sl", enabled: ["sl", "en"] }, translations: { en: overlay } });

describe("translatable texts", () => {
  it("are the pages' menu labels, search texts and sections' copy; not ids, links, pictures, actions or numbers", () => {
    const spec = golden();
    const texts = translatableTexts(spec);
    const paths = texts.map((t) => t.path);
    expect(paths.slice(0, 5)).toEqual(["/pages/0/nav/label", "/pages/0/seo/title", "/pages/0/seo/description", "/pages/0/sections/0/props/eyebrow", "/pages/0/sections/0/props/headline"]);
    expect(texts.find((t) => t.path === "/pages/0/sections/0/props/headline")?.text).toBe((spec.pages[0]!.sections[0]!.props as Record<string, unknown>).headline);
    // Button labels are copy; where they go is not.
    expect(paths).toContain("/pages/0/sections/0/props/primary/label");
    for (const p of paths) expect(p).not.toMatch(/\/(id|type|variant|tone|image|images|inset|action|page|section|url|kind)$/);
    // Every page counts, the legal and 404 pages' own texts too (their legal text is the components' own, per language).
    expect(paths).toContain("/pages/3/sections/0/props/body");
    expect(paths.filter((p) => /^\/pages\/[12]\/sections\//.test(p))).toEqual([]);
    expect(texts).toHaveLength(43);
  });

  it("leave out names, strings without a letter and placeholders; count the hours' note", () => {
    const spec = golden("racunovodstvo-seliskar");
    const about = spec.pages[0]!.sections.findIndex((s) => s.type === "about");
    expect(about).toBeGreaterThanOrEqual(0);
    const props = spec.pages[0]!.sections[about]!.props as Record<string, unknown>;
    props.ownerName = "Branka Seliškar";
    props.figure = { value: "2004", label: "leto ustanovitve" };
    props.ownerRole = { $placeholder: "text", note: "Vloga lastnice" };
    const paths = sectionTexts(spec, 0, about).map((t) => t.path);
    const base = `/pages/0/sections/${about}/props`;
    expect(paths).not.toContain(`${base}/ownerName`);
    expect(paths).not.toContain(`${base}/figure/value`);
    expect(paths).toContain(`${base}/figure/label`);
    expect(paths.filter((p) => p.startsWith(`${base}/ownerRole`))).toEqual([]);
    // Team members' names stay, their roles are copy.
    const team = { id: "s_team_x", type: "team", props: { heading: "Ekipa", members: [{ name: "Ana Novak", role: "računovodkinja" }] } };
    (spec.pages[0]!.sections as unknown[]).push(team);
    const teamPaths = sectionTexts(spec, 0, spec.pages[0]!.sections.length - 1).map((t) => t.path);
    expect(teamPaths.map((p) => p.split("/props")[1])).toEqual(["/heading", "/members/0/role"]);
    spec.business.hours = { entries: [{ from: "mon", to: "fri", open: "08:00", close: "16:00" }], note: "Avgusta zaprto." };
    expect(translatableTexts(spec).at(-1)).toEqual({ path: "/business/hours/note", text: "Avgusta zaprto." });
  });

  it("missing: no overlay, or an empty one", () => {
    const spec = english(golden(), { "/pages/0/nav/label": "Home", "/pages/0/seo/title": "  " });
    const left = untranslated(spec, "en").map((t) => t.path);
    expect(left).not.toContain("/pages/0/nav/label");
    expect(left).toContain("/pages/0/seo/title");
    expect(left).toHaveLength(42);
  });
});

describe("the checklist of a site in two languages", () => {
  it("one language: nothing about translations", () => {
    expect(publishChecklist(golden()).filter((b) => b.kind === "translation")).toEqual([]);
  });

  it("English switched on: one entry per section (and per page's own texts) at its first missing text, with how many", () => {
    const spec = english(golden());
    const entries = publishChecklist(spec).filter((b) => b.kind === "translation");
    expect(entries.map((b) => [b.path, b.value])).toEqual([
      ["/pages/0/nav/label", "3"],
      ["/pages/0/sections/0/props/eyebrow", "5"],
      ["/pages/0/sections/2/props/title", "9"],
      ["/pages/0/sections/3/props/heading", "4"],
      ["/pages/0/sections/4/props/heading", "9"],
      ["/pages/0/sections/5/props/title", "1"],
      ["/pages/0/sections/6/props/title", "1"],
      ["/pages/1/nav/label", "3"],
      ["/pages/2/nav/label", "3"],
      ["/pages/3/nav/label", "3"],
      ["/pages/3/sections/0/props/title", "2"],
    ]);
    expect(entries.every((b) => b.detail === "en")).toBe(true);
    expect(blockerText(entries[1]!)).toBe("/pages/0/sections/0/props/eyebrow: 5 text(s) here without a translation (en)");
    expect(blockerMessage(entries[1]!)).toBe("Še 5 besedil brez angleškega prevoda.");
    expect(describePath(spec, entries[1]!.path)).toMatch(/^Domov › /);
  });

  it("every text translated: no entry left, and the site validates (its own placeholders stay listed)", () => {
    const spec = golden();
    const before = publishChecklist(spec);
    const all = Object.fromEntries(translatableTexts(spec).map((t) => [t.path, `EN ${t.text}`]));
    const both = english(spec, all);
    expect(publishChecklist(both)).toEqual(before);
    expect(before.every((b) => b.kind === "placeholder")).toBe(true);
    // One emptied again: back on the list.
    const one = english(spec, { ...all, "/pages/0/sections/5/props/title": "" });
    expect(publishChecklist(one).filter((b) => b.kind !== "placeholder").map((b) => [b.kind, b.path, b.value])).toEqual([["translation", "/pages/0/sections/5/props/title", "1"]]);
  });

  it("words the count in Slovene", () => {
    expect([1, 2, 3, 4, 5, 101, 102].map(textsCount)).toEqual(["1 besedilo", "2 besedili", "3 besedila", "4 besedila", "5 besedil", "101 besedilo", "102 besedili"]);
    expect(blockerMessage({ path: "/pages/0/nav/label", kind: "translation", detail: "en", value: "1" })).toBe("Še 1 besedilo brez angleškega prevoda.");
  });
});
