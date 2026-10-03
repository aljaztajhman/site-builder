import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { migrateSpec, type SiteSpec } from "@sb/spec";
import { renderPage } from "../src/index.ts";
import { elementText } from "../src/landmarks.ts";

const goldenDir = new URL("../../../tools/eval/golden/", import.meta.url);
const golden = (id: string) => migrateSpec(JSON.parse(readFileSync(new URL(`${id}.json`, goldenDir), "utf8"))) as SiteSpec;
const GOLDEN_IDS = readdirSync(goldenDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

interface Landmark {
  role: string;
  name: string;
  tag: string;
}

const attr = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1];

/**
 * Every exposed landmark that carries a name, from the rendered markup: explicit landmark roles,
 * section (region), nav, aside, form and search. Elements with `hidden` are skipped (not exposed).
 * Names come from aria-labelledby (resolved to the referenced elements' text) or aria-label.
 */
function landmarks(html: string): Landmark[] {
  const out: Landmark[] = [];
  const implicit: Record<string, string> = { section: "region", nav: "navigation", aside: "complementary", form: "form", search: "search" };
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/g)) {
    const tag = m[1]!;
    const attrs = m[2]!;
    if (/\shidden(?:[\s=]|$)/.test(attrs)) continue;
    const role = attr(attrs, "role") ?? implicit[tag];
    if (!role || !["region", "navigation", "complementary", "form", "search", "main", "banner", "contentinfo"].includes(role)) continue;
    const by = attr(attrs, "aria-labelledby");
    const name = (
      by
        ? by
            .split(/\s+/)
            .map((ref) => elementText(html, ref) ?? "")
            .join(" ")
        : (attr(attrs, "aria-label") ?? "")
    )
      .replace(/\s+/g, " ")
      .trim();
    // A section or form without a name is not a landmark.
    if (!name && (role === "region" || role === "form")) continue;
    out.push({ role, name, tag });
  }
  return out;
}

function duplicates(list: Landmark[]): string[] {
  const seen = new Map<string, number>();
  for (const l of list) {
    const key = `${l.role}: ${l.name.toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
}

/** A booking section and an untitled contact strip, inserted into a golden homepage (the tests own their fixture). */
const BOOKING = {
  id: "s_booking",
  type: "booking",
  variant: "with-hours",
  props: {
    heading: "Rezervirajte termin tudi zvečer",
    text: "Prosti termini so objavljeni v spletnem naročanju. Če raje pokličete, sem dosegljiva na telefonu.",
    action: { label: "Rezervirajte online", target: { action: "booking" } },
    secondary: { label: "Pokličite", target: { action: "call" } },
  },
} as const;
const STRIP = { id: "s_strip", type: "contact-strip", variant: "bar", props: {} } as const;

/** fizioterapija-pregib with the booking section on its homepage. */
function withBookingHome() {
  const spec = golden("fizioterapija-pregib");
  const home = spec.pages[0]!;
  home.sections.splice(1, 0, structuredClone(BOOKING) as unknown as (typeof home.sections)[number]);
  return spec;
}

/** That homepage with its booking section repeated right after it under a new id. */
function withSecondBooking(copies = 1) {
  const spec = withBookingHome();
  const home = spec.pages[0]!;
  const i = home.sections.findIndex((s) => s.type === "booking");
  const booking = home.sections[i]!;
  const extra = Array.from({ length: copies }, (_, n) => ({ ...structuredClone(booking), id: `${booking.id}_${n + 2}` }));
  home.sections.splice(i + 1, 0, ...extra);
  return { spec, home, booking };
}

describe("landmark names", () => {
  it("reads names back from the markup", () => {
    const spec = withBookingHome();
    const html = renderPage(spec, spec.pages[0]!);
    expect(elementText(html, "s_booking-title")).toBe("Rezervirajte termin tudi zvečer");
    expect(landmarks(html)).toContainEqual({ role: "region", name: "Rezervirajte termin tudi zvečer", tag: "section" });
    expect(landmarks(html)).toContainEqual({ role: "navigation", name: "Glavna navigacija", tag: "nav" });
  });

  it("gives a repeated booking section a unique name and leaves the first one as it was", () => {
    const { spec, home, booking } = withSecondBooking();
    const html = renderPage(spec, home);
    // Both headings read the same: without a suffix the two regions would share one name.
    expect(elementText(html, `${booking.id}-title`)).toBe(elementText(html, `${booking.id}_2-title`));
    const list = landmarks(html);
    expect(duplicates(list)).toEqual([]);
    const names = list.filter((l) => l.role === "region").map((l) => l.name);
    expect(names).toContain("Rezervirajte termin tudi zvečer");
    expect(names).toContain("Rezervirajte termin tudi zvečer (2)");
    // The first booking section's markup is unchanged.
    const once = withBookingHome();
    const original = renderPage(once, once.pages[0]!);
    const sectionHtml = (h: string, id: string) => /<section id="[^"]+"[^>]*>/.exec(h.slice(h.indexOf(`<section id="${id}"`)))?.[0];
    expect(sectionHtml(html, booking.id)).toBe(sectionHtml(original, booking.id));
    expect(sectionHtml(html, `${booking.id}_2`)).toBe(
      `<section id="${booking.id}_2" class="s s-booking s-booking--with-hours tone-default" aria-labelledby="${booking.id}_2-title ${booking.id}_2-landmark">`,
    );
    // The suffix is hidden from view and from the reading order; it only feeds the name.
    expect(html).toContain(`<span id="${booking.id}_2-landmark" hidden="">(2)</span>`);
  });

  it("numbers further repeats in page order", () => {
    const { spec, home } = withSecondBooking(2);
    const list = landmarks(renderPage(spec, home));
    expect(duplicates(list)).toEqual([]);
    expect(list.filter((l) => l.name.startsWith("Rezervirajte termin tudi zvečer")).map((l) => l.name)).toEqual([
      "Rezervirajte termin tudi zvečer",
      "Rezervirajte termin tudi zvečer (2)",
      "Rezervirajte termin tudi zvečer (3)",
    ]);
  });

  it("repeats of a fixed fallback heading (contact strip without a title) get unique names too", () => {
    const spec = golden("fizioterapija-pregib");
    const home = spec.pages[0]!;
    home.sections.push(structuredClone(STRIP) as unknown as (typeof home.sections)[number]);
    const strip = home.sections.find((s) => s.id === STRIP.id)! as { id: string; props: Record<string, unknown> };
    expect(strip.props.title).toBeUndefined();
    home.sections.push({ ...structuredClone(strip), id: "s_strip_2" } as (typeof home.sections)[number]);
    expect(duplicates(landmarks(renderPage(spec, home)))).toEqual([]);
  });

  it.each(GOLDEN_IDS)("%s: no page has two landmarks with one name", (id) => {
    const spec = golden(id);
    let pages = 0;
    for (const locale of spec.locales.enabled) {
      for (const page of spec.pages) {
        const list = landmarks(renderPage(spec, page, { locale }));
        expect(list.length).toBeGreaterThan(0);
        expect(duplicates(list), `${locale}/${page.slug || "index"}`).toEqual([]);
        pages++;
      }
    }
    expect(pages).toBeGreaterThan(0);
  });

  it("covers all 10 golden specs", () => {
    expect(GOLDEN_IDS).toHaveLength(10);
  });
});
