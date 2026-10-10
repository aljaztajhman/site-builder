/**
 * The preset a composed section falls back to (docs/plans/ai-designer-spec.md §2.4): when a composed section still fails
 * the guards after repair, it is replaced by a preset layout of the same intent filled from its own texts, where the
 * mapping is obvious: nothing is invented, and nothing is guessed (a text that doesn't fit a preset's limit makes that
 * preset fail its schema and the next one is tried). Null when no preset of the intent can take it; the engine then drops
 * the section and logs it.
 */
import type { Link } from "../common.ts";
import { sectionDef, type Section } from "../sections/index.ts";
import { readingOrder, type ComposedSection } from "./guards.ts";
import type { Element } from "./schema.ts";

type Of<K extends Element["kind"]> = Extract<Element, { kind: K }>;
type Props = Record<string, unknown>;
type Candidate = [layout: string, props: Props];

/** An action element as a link: call, directions and book resolve their facts at render time, a link keeps its target. */
function linkOf(a: Of<"action">): Link | undefined {
  switch (a.action) {
    case "call":
      return { label: a.label, target: { action: "call" } };
    case "directions":
      return { label: a.label, target: { action: "directions" } };
    case "book":
      return { label: a.label, target: { action: "booking" } };
    case "link":
      return a.link ? { label: a.label, target: a.link.target } : undefined;
  }
}

const defined = (o: Props): Props => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** The section as a preset of this layout ("type:variant"), or null when the preset's schema doesn't take the props. */
function asPreset(section: ComposedSection, layout: string, props: Props): Section | null {
  const [type, variant] = layout.split(":") as [string, string];
  const def = sectionDef(type);
  const parsed = def.schema.safeParse({ id: section.id, type, variant, ...(section.tone ? { tone: section.tone } : {}), props: defined(props) });
  return parsed.success ? (parsed.data as unknown as Section) : null;
}

export function composedFallback(section: ComposedSection): Section | null {
  const els = readingOrder(section.props.elements).map((o) => o.e);
  const of = <K extends Element["kind"]>(kind: K) => els.filter((e): e is Of<K> => e.kind === kind);

  // The title: the first heading of the lowest level (the h1 of an opener, else the first h2).
  const headings = of("heading");
  const title = headings.length ? headings.reduce((best, h) => (h.level < best.level ? h : best)).text : undefined;
  const paragraphs = of("text").flatMap((t) => t.paragraphs);
  const intro = paragraphs[0];
  const images = [...new Set(of("image").map((i) => i.image))];
  const links = of("action")
    .sort((a, b) => Number(b.style === "primary") - Number(a.style === "primary"))
    .flatMap((a) => linkOf(a) ?? []);
  const [primary, secondary] = links;
  const first = (...layouts: Candidate[]): Section | null => {
    for (const [layout, props] of layouts) {
      const s = asPreset(section, layout, props);
      if (s) return s;
    }
    return null;
  };

  switch (section.props.intent) {
    case "hero": {
      if (!title || !intro) return null;
      const props = { headline: title, intro, primary, secondary };
      return first(...(images[0] ? ([["hero-split:image-right", { ...props, image: images[0] }], ["hero-image:overlay-bottom", { ...props, image: images[0] }]] as Candidate[]) : []), ["hero-type:large", props]);
    }
    case "page-head":
      if (!title) return null;
      return first(...(images[0] ? ([["page-header:with-image", { title, intro, image: images[0] }]] as Candidate[]) : []), ["page-header:plain", { title, intro }]);
    case "story": {
      if (!title || !paragraphs.length) return null;
      const link = links[0];
      return first(
        ...(images[0]
          ? ([
              ["image-text:image-right", { heading: title, paragraphs, link, image: images[0] }],
              ["about:image-side", { heading: title, paragraphs, image: images[0] }],
            ] as Candidate[])
          : []),
        ["text:narrow", { heading: title, paragraphs }],
        ["about:text-only", { heading: title, paragraphs }],
      );
    }
    case "highlights": {
      const facts = of("fact");
      if (!title || facts.length < 2) return null;
      return first(["highlights:figures", { heading: title, intro, items: facts.map((f) => ({ title: f.value, text: f.label })) }]);
    }
    case "call":
      if (!title || !primary) return null;
      return first(["cta:band", { heading: title, text: intro, primary, secondary }], ["cta:split", { heading: title, text: intro, primary, secondary }]);
    case "booking": {
      const action = links.find((l) => "action" in l.target && (l.target.action === "booking" || l.target.action === "call"));
      if (!title || !intro || !action) return null;
      return first(["booking:simple", { heading: title, text: intro, action, secondary: links.find((l) => l !== action) }]);
    }
    case "services": {
      // A list of names only is what the aside variant is for (the others need a description each).
      const items = of("list").flatMap((l) => l.items);
      if (!title || items.length < 2) return null;
      return first(["services-list:aside", { title, intro, items: items.map((name) => ({ name })) }]);
    }
    case "prices": {
      const lists = of("prices");
      if (!title || !lists.length) return null;
      const item = (p: Of<"prices">["items"][number]) => defined({ name: p.name, note: p.note, price: p.price, unavailable: p.unavailable });
      const merged = lists.flatMap((l) => l.items);
      const groups = merged.length <= 20 ? [{ items: merged.map(item) }] : lists.map((l) => ({ items: l.items.map(item) }));
      const tags = lists.some((l) => l.style !== "rows");
      return first(...(tags ? ([["price-list:tags", { title, intro, groups }]] as Candidate[]) : []), ["price-list:table", { title, intro, groups }]);
    }
    case "hours": {
      const hours = of("hours")[0];
      if (!title || !hours) return null;
      const note = intro;
      return first(
        ...(images[0] ? ([["opening-hours:photo", { title, note, image: images[0] }]] as Candidate[]) : []),
        [`opening-hours:${hours.style}`, { title, note }],
        ["opening-hours:table", { title, note }],
      );
    }
    case "contact": {
      const contact = of("contact")[0];
      if (!title || !contact) return null;
      return first([contact.show.includes("map") ? "contact:split-map" : "contact:stacked", { title, intro }], ["contact:stacked", { title, intro }]);
    }
    case "gallery":
      if (!title || images.length < 2) return null;
      return first(["gallery:grid", { title, intro, images: images.map((image) => ({ image })) }]);
    case "area":
      if (!title) return null;
      return first(["service-area:list", { title, intro, action: primary }]);
    case "notice":
      if (!title || !intro) return null;
      return first(["announcement:card", { title, text: intro, link: primary }]);
    default:
      // steps, menu, faq, team, products, rooms, form and collection need structure (titles with texts, categories,
      // people, questions) that composed elements don't carry; system sections are never composed.
      return null;
  }
}
