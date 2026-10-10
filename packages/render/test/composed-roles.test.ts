import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ColorRole, ON_ROLE, factObjectGround } from "@sb/spec";

/**
 * The text role on each ground is named once, in @sb/spec (ON_ROLE); the stylesheet repeats it as --cx-ro (.cx-ro-<role>,
 * a layer's or the header's ground) and --cx-o (.cx-bg-<role>, an element's own fill). The guards (G3, G9) read the table,
 * so a rule here that disagrees would let an unreadable pair pass, or reject a readable one.
 */
const v2 = readFileSync(new URL("../../components/styles/composed-v2.css", import.meta.url), "utf8");
const core = readFileSync(new URL("../../components/styles/composed.css", import.meta.url), "utf8");

/** The CSS custom property of a palette role. */
const VAR: Record<string, string> = {
  "--c-bg": "background",
  "--c-surface": "surface",
  "--c-text": "text",
  "--c-muted": "muted",
  "--c-primary": "primary",
  "--c-on-primary": "onPrimary",
  "--c-accent": "accent",
  "--c-border": "border",
  "--c-inverse": "inverse",
  "--c-on-inverse": "onInverse",
  "--c-band": "band",
  "--c-on-band": "onBand",
};
const roleOf = (v: string) => VAR[v]!;

/** `selector-start … { body }` blocks whose selector list starts with `.cx-<prefix>-<role>`. */
function rules(prefix: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = new RegExp(String.raw`^\.cx-${prefix}-(\w+)\b[^{]*\{([^}]*)\}`, "gm");
  for (const m of v2.matchAll(re)) out.set(m[1]!, m[2]!);
  return out;
}
const first = (body: string, prop: string) => new RegExp(prop + String.raw`:\s*var\((--[\w-]+)`).exec(body)?.[1];

describe("composed-v2.css repeats the spec's text-role table", () => {
  it("has a .cx-ro-<role> rule per role whose --cx-ro is ON_ROLE[role]", () => {
    const r = rules("ro");
    expect([...r.keys()].sort()).toEqual([...ColorRole.options].sort());
    for (const [role, body] of r) {
      expect(roleOf(first(body, "--cx-rc")!), `--cx-rc of ${role}`).toBe(role);
      expect(roleOf(first(body, "--cx-ro")!), `--cx-ro of ${role}`).toBe(ON_ROLE[role as ColorRole]);
    }
  });

  it("has a .cx-bg-<role> rule per role whose --cx-o is ON_ROLE[role] (the fill is the role)", () => {
    const r = new Map([...rules("bg")].filter(([k]) => k !== "photo" && k !== "art"));
    expect([...r.keys()].sort()).toEqual([...ColorRole.options].sort());
    for (const [role, body] of r) {
      expect(roleOf(first(body, "--cx-f")!), `--cx-f of ${role}`).toBe(role);
      expect(roleOf(first(body, "--cx-o")!), `--cx-o of ${role}`).toBe(ON_ROLE[role as ColorRole]);
    }
  });

  it("puts an own text colour into a fact's object only where the object has no ground of its own (numeral, stamp)", () => {
    expect(v2).toContain(".cx-pf:is(.cx-fact--numeral, .cx-fact--stamp) .cx-fact__obj");
    expect(v2).not.toMatch(/\.cx-fact\.cx-pf \.cx-fact__obj/);
    for (const t of ["ticket", "seal", "tag", "plate"]) expect(v2, t).not.toContain(`.cx-fact--${t}.cx-pf`);
  });
});

describe("a fact object's own ground (what G9 checks a colour against)", () => {
  const body = (re: RegExp) => re.exec(core)?.[1] ?? "";
  it("matches composed.css: ticket primary, seal band, tag inverse; flipped on a band or inverse section", () => {
    const ticket = body(/\n\.cx-fact--ticket \.cx-fact__obj \{([^}]*)\}/);
    const seal = body(/\n\.cx-fact--seal \.cx-fact__obj \{([^}]*)\}/);
    const tag = body(/\n\.cx-fact--tag \.cx-fact__obj \{([^}]*)\}/);
    expect(roleOf(first(ticket, "background")!)).toBe("primary");
    expect(roleOf(first(seal, "background")!)).toBe("band");
    expect(roleOf(first(tag, "background")!)).toBe("inverse");
    expect(factObjectGround("ticket", "default")).toBe("primary");
    expect(factObjectGround("seal", "default")).toBe("band");
    expect(factObjectGround("tag", "default")).toBe("inverse");
    expect(core).toMatch(/\.tone-band \.cx-fact--seal \.cx-fact__obj,\s*\.tone-band \.cx-fact--ticket \.cx-fact__obj[^{]*\{\s*background: var\(--c-on-band/);
    expect(core).toMatch(/\.tone-inverse \.cx-fact--tag \.cx-fact__obj[^{]*\{\s*background: var\(--c-on-inverse/);
    expect(factObjectGround("seal", "band")).toBe("onBand");
    expect(factObjectGround("ticket", "band")).toBe("onBand");
    expect(factObjectGround("tag", "inverse")).toBe("onInverse");
    expect(factObjectGround("numeral", "default")).toBeUndefined();
  });
});

describe("the starter type treatments have rules (cx-tt-<name>, extensions region)", () => {
  it("stacked and knockout style a heading; neither blends, blurs or paints a gradient", () => {
    for (const t of ["stacked", "knockout"]) expect(v2, t).toContain(`.cx-h.cx-tt-${t} {`);
    const rules = [...v2.matchAll(/\.cx-h\.cx-tt-(stacked|knockout) \{([^}]*)\}/g)].map((m) => m[2]!);
    expect(rules).toHaveLength(2);
    for (const r of rules) expect(r).not.toMatch(/blend|blur|gradient|shadow/);
    expect(rules[0]).toContain("inline-size: min-content"); // one word to a line
  });
});
