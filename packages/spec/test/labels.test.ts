import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Business,
  COLOR_LABEL,
  DESIGN_LABEL,
  DIRECTIONS,
  DIRECTION_LABEL,
  ENUM_LABEL,
  FIELD_LABEL,
  Imagery,
  PLACEHOLDER_LABEL,
  PlaceholderKind,
  SECTION_DEFS,
  SECTION_LABEL,
  TOKEN_LABEL,
  VARIANT_LABEL,
  blockerMessage,
  blockerText,
  describePath,
  issueMessage,
  publishBlockers,
  publishChecklist,
  toModelJsonSchema,
  validateSite,
  type SiteSpec,
} from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;

type Schema = Record<string, unknown>;

/** Every property key and every enum the editor forms can show (placeholder kinds are not shown). */
function walk(s: unknown, keys: Set<string>, enums: Set<string>): void {
  if (!s || typeof s !== "object") return;
  const o = s as Schema;
  if (Array.isArray(o.enum)) for (const v of o.enum) enums.add(String(v));
  for (const [k, v] of Object.entries((o.properties ?? {}) as Record<string, unknown>)) {
    if (k === "$placeholder") continue;
    keys.add(k);
    walk(v, keys, enums);
  }
  for (const k of ["items", "anyOf", "oneOf", "allOf"]) {
    const v = o[k];
    if (Array.isArray(v)) v.forEach((x) => walk(x, keys, enums));
    else walk(v, keys, enums);
  }
  for (const k of ["$defs", "definitions"]) for (const v of Object.values((o[k] ?? {}) as Record<string, unknown>)) walk(v, keys, enums);
}

describe("Slovene names for everything the editor shows", () => {
  const keys = new Set<string>();
  const enums = new Set<string>();
  for (const d of SECTION_DEFS) walk(toModelJsonSchema(d.props), keys, enums);
  walk(toModelJsonSchema(Business), keys, enums);

  it("names every section type and variant", () => {
    for (const d of SECTION_DEFS) {
      expect(SECTION_LABEL[d.type], d.type).toBeTruthy();
      for (const v of d.variants) expect(VARIANT_LABEL[d.type]?.[v], `${d.type}:${v}`).toBeTruthy();
    }
  });

  it("names every form field and every choice", () => {
    expect([...keys].filter((k) => !FIELD_LABEL[k])).toEqual([]);
    expect([...enums].filter((v) => !ENUM_LABEL[v])).toEqual([]);
  });

  it("names every direction, design token value, colour and placeholder kind", () => {
    for (const d of DIRECTIONS) {
      expect(DIRECTION_LABEL[d.id]?.name, d.id).toBeTruthy();
      expect(DIRECTION_LABEL[d.id]!.summary.length, d.id).toBeGreaterThan(40);
      for (const k of ["density", "shadow", "headingCase"] as const) for (const v of d.ranges[k]) expect(TOKEN_LABEL[k]?.[v], `${k}:${v}`).toBeTruthy();
      for (const c of Object.keys(d.palette.fallback)) expect(COLOR_LABEL[c], c).toBeTruthy();
    }
    for (const v of Imagery.options) expect(TOKEN_LABEL.imagery?.[v], v).toBeTruthy();
    for (const k of ["radius", "baseFontSize", "scale", "headingWeight", "headingTracking", "headingCase", "density", "shadow", "fontPair", "imagery"]) expect(DESIGN_LABEL[k], k).toBeTruthy();
    for (const k of PlaceholderKind.options) expect(PLACEHOLDER_LABEL[k], k).toBeTruthy();
    // Owner-facing names differ from the English ones the model sees.
    expect(new Set(Object.values(DIRECTION_LABEL).map((d) => d.name)).size).toBe(DIRECTIONS.length);
  });
});

describe("describePath", () => {
  const spec = golden();
  it("says where a path points in words the owner knows", () => {
    const pi = spec.pages.findIndex((p) => p.kind === "home");
    const page = spec.pages[pi]!;
    const si = page.sections.findIndex((s) => s.type === "products");
    expect(describePath(spec, `/pages/${pi}/sections/${si}/props/items/1/price/amount`)).toBe(`${page.nav.label} › Izdelki › Postavke (2.) › Cena › Znesek (€)`);
    expect(describePath(spec, "/business/address/postalCode")).toBe("Podatki o podjetju › Naslov › Poštna številka");
    expect(describePath(spec, "/business/hours/entries/0/from")).toBe("Podatki o podjetju › Delovni čas › Obdobja (1.) › Od dneva");
    expect(describePath(spec, `/pages/${pi}/seo/title`)).toBe(`${page.nav.label} › Naslov za iskalnike`);
    expect(describePath(spec, "/design/colors/primary")).toBe("Oblika › Glavna barva (gumbi)");
    expect(describePath(spec, "/assets/images/0/alt")).toMatch(/^Fotografija ».+«$/);
  });

  it("names price-list and menu groups and items as the editor shows them", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (id: string) => JSON.parse(readFileSync(new URL(`../../../tools/eval/golden/${id}.json`, import.meta.url), "utf8")) as unknown;
    const salon = read("frizerstvo-lana");
    expect(describePath(salon, "/pages/1/sections/1/props/groups/1/items/1/price")).toBe("Cenik › Cenik › Barvanje in pričeske › Pramene › Cena");
    expect(describePath(salon, "/pages/1/sections/1/props/groups/0/name")).toBe("Cenik › Cenik › Striženje › Ime");
    expect(describePath(salon, "/pages/1/sections/1/props/title")).toBe("Cenik › Cenik › Naslov");
    expect(describePath(read("gostilna-zlata-zlica"), "/pages/1/sections/1/props/categories/2/dishes/2/price")).toBe("Jedilnik › Jedilnik › Z jedilnega lista › Ričet › Cena");
  });
});

describe("issueMessage", () => {
  it("words real validation messages in Slovene", () => {
    const spec = golden();
    const at = (p: string) => {
      const v = validateSite(spec);
      expect(v.ok).toBe(false);
      return v.ok ? undefined : v.issues.find((i) => i.path === p);
    };
    (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = "x".repeat(200);
    const long = at("/pages/0/sections/0/props/headline");
    expect(long && issueMessage(long)).toMatch(/^je predolgo \(največ \d+ znakov\)$/);
    (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = "";
    const empty = at("/pages/0/sections/0/props/headline");
    expect(empty && issueMessage(empty)).toBe("ne sme biti prazno");
    (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = "Dobrodošli v Pekarni Kvas";
    const banned = at("/pages/0/sections/0/props/headline");
    expect(banned && issueMessage(banned)).toBe("naslov ne sme biti pozdrav (»Dobrodošli«); povejte, kaj ponujate");
    (spec.pages[0]!.sections[0]!.props as { headline: string }).headline = "Vrhunska kakovost kruha";
    const filler = at("/pages/0/sections/0/props/headline");
    expect(filler && issueMessage(filler)).toBe("vsebuje prazno frazo »vrhunska kakovost«; napišite konkretno, kaj ponujate");
  });

  it("uses Slovene plural forms for item counts (one, two, few, other)", () => {
    const min = (n: number) => issueMessage({ path: "/x", code: "schema", message: `Too small: expected array to have >=${n} items` });
    expect(min(1)).toBe("potrebuje vsaj 1 postavko");
    expect(min(2)).toBe("potrebuje vsaj 2 postavki");
    expect(min(3)).toBe("potrebuje vsaj 3 postavke");
    expect(min(5)).toBe("potrebuje vsaj 5 postavk");
    expect(min(101)).toBe("potrebuje vsaj 101 postavko");
    expect(min(102)).toBe("potrebuje vsaj 102 postavki");
    expect(min(104)).toBe("potrebuje vsaj 104 postavke");
  });

  it("falls back to a plain sentence, never English", () => {
    expect(issueMessage({ path: "/x", code: "schema", message: "Something odd" })).toBe("ni veljavno");
  });
});

describe("publish checklist", () => {
  it("keeps the English lines of publishBlockers and words each entry in Slovene", () => {
    const spec = golden();
    spec.business.phone = { $placeholder: "phone" } as unknown as string;
    spec.assets.images[0] = { ...spec.assets.images[0]!, alt: "" };
    const list = publishChecklist(spec);
    expect(list.map(blockerText)).toEqual(publishBlockers(spec));
    expect(list.find((b) => b.kind === "placeholder")).toMatchObject({ path: "/business/phone", detail: "phone" });
    expect(blockerMessage(list.find((b) => b.kind === "placeholder")!)).toBe("Manjka telefonska številka.");
    expect(blockerMessage(list.find((b) => b.kind === "alt")!)).toMatch(/^Fotografija nima opisa/);
    expect(blockerMessage({ path: "/business/phone", kind: "fact", detail: "phone", value: "01 234 56 78" })).toMatch(/^»01 234 56 78« ni iz vašega opisa/);
    expect(blockerMessage({ path: "/pages/0/sections/0/props/title", kind: "starter", detail: "starter text" })).toBe("Začetno besedilo še ni zamenjano.");
  });

  it("names the facts sections need at render time (hours, service area)", () => {
    const spec = golden();
    delete spec.business.hours;
    spec.pages[0]!.sections.push({ id: "s_area", type: "service-area", variant: "list", props: { title: "Kam dostavljamo" } } as SiteSpec["pages"][number]["sections"][number]);
    const list = publishChecklist(spec);
    const hours = list.find((b) => b.path === "/business/hours")!;
    const area = list.find((b) => b.path === "/business/serviceArea")!;
    expect(`${describePath(spec, hours.path)}: ${blockerMessage(hours)}`).toBe("Podatki o podjetju › Delovni čas: Manjka delovni čas.");
    expect(`${describePath(spec, area.path)}: ${blockerMessage(area)}`).toBe("Podatki o podjetju › Območje dela: Manjka območje dela.");
  });
});
