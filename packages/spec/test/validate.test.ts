import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findBannedCopy, getAt, isWebUrl, issueMessage, publishChecklist, setAt, validateSite, type SiteSpec } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;
const issuesOf = (spec: SiteSpec) => {
  const v = validateSite(spec);
  return v.ok ? [] : v.issues;
};

describe("JSON pointers", () => {
  it("follow own properties only", () => {
    const spec = golden();
    expect(getAt(spec, "/business/name")).toBe("Pekarna Kvas");
    expect(getAt(spec, "/pages/0/id")).toBe("p_home");
    expect(getAt(spec, "/constructor/name")).toBeUndefined();
    expect(getAt(spec, "/business/toString")).toBeUndefined();
    expect(getAt(spec, "/__proto__/constructor")).toBeUndefined();
    expect(() => setAt(spec, "/constructor/name", "x")).toThrow(/No parent/);
    setAt(spec, "/business/name", "Pekarna Drož");
    expect(spec.business.name).toBe("Pekarna Drož");
  });

  it("reject a translation pointer that resolves only through the prototype", () => {
    const spec = golden();
    spec.locales.enabled = ["sl", "en"];
    spec.translations = { en: { "/constructor/name": "Object" } };
    expect(issuesOf(spec)).toContainEqual(expect.objectContaining({ code: "translation", message: "pointer /constructor/name is not a string in the spec" }));
  });
});

describe("banned copy", () => {
  it("bans greetings in the eyebrow as in the headline", () => {
    expect(findBannedCopy({ eyebrow: "Dobrodošli v Kamniku" })).toEqual([{ path: "/eyebrow", rule: '"Dobrodošli" headline', text: "Dobrodošli v Kamniku" }]);
    expect(findBannedCopy({ eyebrow: "Welcome to Kamnik" })).toHaveLength(1);
    expect(findBannedCopy({ eyebrow: "Šutna 30, Kamnik" })).toEqual([]);
    const spec = golden();
    (spec.pages[0]!.sections[0]!.props as { eyebrow: string }).eyebrow = "Dobrodošli";
    expect(issuesOf(spec)).toContainEqual(expect.objectContaining({ path: "/pages/0/sections/0/props/eyebrow", code: "banned" }));
  });
});

describe("link URLs", () => {
  it("accepts only http(s)", () => {
    expect(isWebUrl("https://example.com")).toBe(true);
    expect(isWebUrl("HTTP://example.com")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("data:text/html,<p>")).toBe(false);
    expect(isWebUrl("mailto:a@b.si")).toBe(false);
  });

  it("reports javascript: and data: in links, the booking URL and social links", () => {
    const spec = golden();
    expect(issuesOf(spec)).toEqual([]);
    (spec.pages[0]!.sections[0]!.props as { secondary: unknown }).secondary = { label: "Več", target: { url: "javascript:alert(1)" } };
    spec.business.bookingUrl = "data:text/html,<script>alert(1)</script>";
    spec.business.social = [
      { network: "facebook", url: "https://facebook.com/pekarnakvas" },
      { network: "instagram", url: "javascript:alert(1)" },
    ];
    const bad = issuesOf(spec).filter((i) => i.message === "link URL must start with http:// or https://");
    expect(bad.map((i) => i.path).sort()).toEqual(["/business/bookingUrl", "/business/social/1/url", "/pages/0/sections/0/props/secondary/target/url"]);
    expect(issueMessage(bad[0]!)).toBe("spletni naslov se mora začeti s https:// (ali http://)");
  });
});

describe("publish checklist: facts a section shows at render time", () => {
  it("blocks an opening-hours section when the business has no hours", () => {
    const spec = golden();
    expect(publishChecklist(spec).filter((b) => b.path === "/business/hours")).toEqual([]);
    delete spec.business.hours;
    expect(publishChecklist(spec)).toContainEqual({ path: "/business/hours", kind: "placeholder", detail: "hours" });
    // A stored placeholder is reported once, by collectPlaceholders.
    spec.business.hours = { $placeholder: "hours" };
    expect(publishChecklist(spec).filter((b) => b.path === "/business/hours")).toHaveLength(1);
    // No opening-hours section: nothing to block.
    delete spec.business.hours;
    spec.pages[0]!.sections = spec.pages[0]!.sections.filter((s) => s.type !== "opening-hours");
    expect(publishChecklist(spec).filter((b) => b.path === "/business/hours")).toEqual([]);
  });

  it("blocks a service-area section when the business has no service area", () => {
    const spec = golden();
    spec.pages[0]!.sections.push({ id: "s_area", type: "service-area", variant: "list", props: { title: "Kam dostavljamo" } } as SiteSpec["pages"][number]["sections"][number]);
    expect(issuesOf(spec)).toEqual([]);
    expect(publishChecklist(spec)).toContainEqual({ path: "/business/serviceArea", kind: "placeholder", detail: "serviceArea" });
    spec.business.serviceArea = [];
    expect(publishChecklist(spec)).toContainEqual({ path: "/business/serviceArea", kind: "placeholder", detail: "serviceArea" });
    spec.business.serviceArea = ["Kamnik", "Domžale"];
    expect(publishChecklist(spec).filter((b) => b.path === "/business/serviceArea")).toEqual([]);
  });
});
