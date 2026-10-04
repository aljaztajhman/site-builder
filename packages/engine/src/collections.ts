import type { Operation } from "fast-json-patch";
import {
  COLLECTION_DIRS,
  MAX_PAGES,
  isPlaceholder,
  type CollectionKind,
  type Collections,
  type Page,
  type Person,
  type Section,
  type Service,
  type SiteSpec,
} from "@sb/spec";

/** The list page a collection gets when the site has none for it: menu name and page name (Slovene). */
const NEW_PAGE: Record<CollectionKind, { label: string; slug: string; title: string; intro: (name: string) => string }> = {
  blog: { label: "Novice", slug: "novice", title: "Novice", intro: (n) => `Novice in obvestila: ${n}.` },
  events: { label: "Dogodki", slug: "dogodki", title: "Dogodki", intro: (n) => `Prihajajoči dogodki: ${n}.` },
  services: { label: "Storitve", slug: "storitve", title: "Storitve", intro: (n) => `Storitve: ${n}.` },
  team: { label: "Ekipa", slug: "ekipa", title: "Ekipa", intro: (n) => `Ekipa: ${n}.` },
};

/** Sections whose items a collection takes over when it is switched on (services, team). */
const SOURCES: Partial<Record<CollectionKind, readonly Section["type"][]>> = {
  services: ["services-list", "services-cards"],
  team: ["team"],
};

type SourceSection = Extract<Section, { type: "services-list" | "services-cards" | "team" }>;

const unique = (base: string, taken: Set<string>, sep: string) => {
  let v = base;
  for (let n = 2; taken.has(v); n++) v = `${base}${sep}${n}`;
  return v;
};

/** An entry made from a section's item, and where each of its texts was in that section (under `props`). */
interface Moved<T> {
  item: T;
  from: Partial<Record<string, string>>;
}

function servicesFrom(s: SourceSection): Moved<Service>[] {
  if (s.type === "services-list")
    return s.props.items.map((it, k) => ({
      item: { name: it.name, summary: it.description ?? it.name, ...(it.price ? { price: it.price } : {}) },
      from: { name: `/items/${k}/name`, summary: `/items/${k}/${it.description !== undefined ? "description" : "name"}` },
    }));
  if (s.type === "services-cards")
    return s.props.items.map((it, k) => ({ item: { name: it.title, summary: it.text, ...(it.image ? { image: it.image } : {}) }, from: { name: `/items/${k}/title`, summary: `/items/${k}/text` } }));
  return [];
}

/** Team members with a name (a name placeholder stays behind: the owner adds that person in the collection). */
function peopleFrom(s: SourceSection): Moved<Person>[] {
  if (s.type !== "team") return [];
  return s.props.members.flatMap((m, k) =>
    isPlaceholder(m.name)
      ? []
      : [{ item: { name: m.name, role: m.role, ...(m.bio ? { bio: m.bio } : {}), ...(m.image ? { image: m.image } : {}) }, from: { name: `/members/${k}/name`, role: `/members/${k}/role`, ...(m.bio ? { bio: `/members/${k}/bio` } : {}) } }],
  );
}

/**
 * Switches a collection on (the editor's "Vklopi novice"). Blog and events get their own page with the list.
 * Services and team take over the site's existing services or team sections: their items move into the
 * collection once, each such section becomes a collection section in its place (heading, intro and how many
 * items it showed kept), and the page with the fullest one lists them all. Returns the edit as JSON Patch
 * operations, or an error in Slovene. The moved items are the site's own (generated or typed earlier), not new
 * owner input, so the caller must not count them as typed by the owner (fact check).
 */
export function startCollection(spec: SiteSpec, kind: CollectionKind): Operation[] | { error: string } {
  if (spec.collections?.[kind]) return { error: "Ta zbirka je že vklopljena." };
  const ops: Operation[] = [];
  const sources: { pi: number; si: number; s: SourceSection }[] = [];
  spec.pages.forEach((p, pi) =>
    p.sections.forEach((s, si) => {
      if ((SOURCES[kind] ?? []).includes(s.type)) sources.push({ pi, si, s: s as SourceSection });
    }),
  );
  const itemsOf = (s: SourceSection) => (kind === "team" ? peopleFrom(s) : servicesFrom(s));
  // The fullest source, on a page of its own if there is one, is where the whole list lives.
  const ranked = [...sources].sort((a, b) => itemsOf(b.s).length - itemsOf(a.s).length || Number(spec.pages[b.pi]!.kind === "standard") - Number(spec.pages[a.pi]!.kind === "standard"));
  const main = ranked.find((x) => spec.pages[x.pi]!.kind === "standard") ?? ranked[0];

  // Items: those of the fullest section, then any other names the other sections add. A photo another section
  // shows for the same name (a service card) comes along.
  const items: (Service | Person)[] = [];
  const byName = new Map<string, Service | Person>();
  // Where each entry's texts were (`/pages/1/sections/2/props/items/0/name`), first source first: their
  // translations come along into the collection (it-collection-translations).
  const origins: Partial<Record<string, string[]>>[] = [];
  for (const src of [main, ...sources].filter((x): x is NonNullable<typeof x> => x !== undefined)) {
    for (const { item: it, from } of itemsOf(src.s)) {
      const key = it.name.toLocaleLowerCase("sl");
      const known = byName.get(key);
      if (!known) {
        byName.set(key, it);
        items.push(it);
        origins.push({});
      } else if (!known.image && it.image) known.image = it.image;
      const at = origins[items.indexOf(known ?? it)]!;
      for (const [field, rel] of Object.entries(from)) (at[field] ??= []).push(`/pages/${src.pi}/sections/${src.si}/props${rel!}`);
    }
  }

  let pageId: string;
  if (main) {
    pageId = spec.pages[main.pi]!.id;
    for (const { pi, si, s } of sources) {
      const shown = itemsOf(s).length;
      const section: Section = {
        id: s.id,
        type: "collection",
        variant: s.type === "services-list" ? "list" : "cards",
        ...(s.tone ? { tone: s.tone } : {}),
        props: {
          kind,
          title: s.props.title,
          ...(s.props.eyebrow ? { eyebrow: s.props.eyebrow } : {}),
          ...(s.props.intro ? { intro: s.props.intro } : {}),
          ...(pi !== main.pi && shown < items.length && shown > 0 ? { limit: Math.min(12, shown) } : {}),
        },
      };
      ops.push({ op: "replace", path: `/pages/${pi}/sections/${si}`, value: section });
    }
  } else {
    const n = NEW_PAGE[kind];
    const slug = unique(n.slug, new Set(spec.pages.map((p) => p.slug)), "-");
    pageId = unique(`p_${slug.replace(/-/g, "_")}`, new Set(spec.pages.map((p) => p.id)), "_");
    const sectionIds = new Set(spec.pages.flatMap((p) => p.sections.map((s) => s.id)));
    const title = `${n.title} | ${spec.business.name}`;
    const page: Page = {
      id: pageId,
      kind: "standard",
      slug,
      nav: { label: n.label, show: true },
      seo: { title: title.length <= 60 ? title : n.title, description: n.intro(spec.business.name).slice(0, 160) },
      sections: [{ id: unique(`s_${COLLECTION_DIRS[kind].replace(/-/g, "_")}`, sectionIds, "_"), type: "collection", variant: kind === "team" ? "cards" : "list", props: { kind, title: n.title } }],
    };
    if (spec.pages.length >= MAX_PAGES) return { error: `Stran ima že največ strani (${MAX_PAGES}). Najprej odstranite eno od strani.` };
    const index = spec.pages.filter((p) => p.kind === "home" || p.kind === "standard").length;
    ops.push({ op: "add", path: `/pages/${index}`, value: page });
  }

  const collection = { page: pageId, items } as NonNullable<Collections[typeof kind]>;
  if (!spec.collections) ops.push({ op: "add", path: "/collections", value: { [kind]: collection } });
  else ops.push({ op: "add", path: `/collections/${kind}`, value: collection });
  // The moved items' translations (English) move with them; the sections' own headings keep theirs in place.
  // Only with sources, so no page was inserted and the pointers above are still the spec's own.
  if (main) {
    for (const [locale, overlay] of Object.entries(spec.translations ?? {})) {
      if (!overlay) continue;
      const next = { ...overlay };
      let moved = false;
      origins.forEach((fields, j) => {
        for (const [field, ptrs] of Object.entries(fields)) {
          const text = ptrs!.map((p) => overlay[p]).find((t) => t !== undefined);
          if (text !== undefined) {
            next[`/collections/${kind}/items/${j}/${field}`] = text;
            moved = true;
          }
        }
      });
      if (!moved) continue;
      // The section items' own pointers no longer reach anything.
      for (const fields of origins) for (const ptrs of Object.values(fields)) for (const p of ptrs!) delete next[p];
      ops.push({ op: "replace", path: `/translations/${locale}`, value: next });
    }
  }
  return ops;
}
