import { z } from "zod";
import { ImageRef, PageRef, Price, text } from "./common.ts";

/**
 * Collections (phase 4, it-collections): lists the owner keeps up to date in the editor without the assistant —
 * blog posts, events, services and team members. They live once in the spec (SiteSpec.collections), are shown
 * by `collection` sections on any page, and an entry with a body gets a page of its own under the collection's
 * directory (novice/…, dogodki/…). Only the owner writes them: the model never generates them and chat edits
 * can't change them (stages.ts applyPatches), so nothing in them is invented.
 */

export const COLLECTION_KINDS = ["blog", "events", "services", "team"] as const;
export const CollectionKind = z.enum(COLLECTION_KINDS);
export type CollectionKind = z.infer<typeof CollectionKind>;

/** Directory of a collection's entry pages, under the site's (or the locale's) root. Slovene, as the page slugs. */
export const COLLECTION_DIRS: Record<CollectionKind, string> = { blog: "novice", events: "dogodki", services: "storitve", team: "ekipa" };

/** A calendar day, YYYY-MM-DD. */
export const IsoDay = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).describe("YYYY-MM-DD");
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).describe("HH:MM");

/** File name of an entry's page, without .html. Derived from its title when left out (entrySlugs). */
export const EntrySlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60);

/** An entry's own page: paragraphs of plain text. */
const Body = z.array(text(1000)).min(1).max(20);

export const Post = z.strictObject({
  title: text(100),
  date: IsoDay,
  summary: text(240).describe("One or two sentences for the list and search results"),
  body: Body,
  image: ImageRef.optional(),
  slug: EntrySlug.optional(),
});
export type Post = z.infer<typeof Post>;

export const Event = z.strictObject({
  title: text(100),
  date: IsoDay,
  endDate: IsoDay.optional().describe("Last day, for an event over several days"),
  start: Time.optional(),
  end: Time.optional(),
  place: text(120).optional(),
  summary: text(240),
  body: Body.optional(),
  price: Price.optional(),
  image: ImageRef.optional(),
  /** Tickets or sign-up elsewhere. */
  url: z.url().max(300).optional(),
  slug: EntrySlug.optional(),
});
export type Event = z.infer<typeof Event>;

export const Service = z.strictObject({
  name: text(60),
  summary: text(240),
  body: Body.optional(),
  price: Price.optional(),
  image: ImageRef.optional(),
  slug: EntrySlug.optional(),
});
export type Service = z.infer<typeof Service>;

export const Person = z.strictObject({
  name: text(60),
  role: text(60),
  bio: text(240).optional(),
  body: Body.optional(),
  image: ImageRef.optional(),
  slug: EntrySlug.optional(),
});
export type Person = z.infer<typeof Person>;

/** Most entries per collection: the spec is stored whole with every version (sb-autosave-versions). */
export const COLLECTION_LIMITS: Record<CollectionKind, number> = { blog: 60, events: 40, services: 30, team: 30 };

const collection = <T extends z.ZodType>(item: T, max: number) =>
  z.strictObject({
    /** The page that lists every entry (its `collection` section); entry pages link back to it. */
    page: PageRef,
    items: z.array(item).max(max),
  });

export const Collections = z.strictObject({
  blog: collection(Post, COLLECTION_LIMITS.blog).optional(),
  events: collection(Event, COLLECTION_LIMITS.events).optional(),
  services: collection(Service, COLLECTION_LIMITS.services).optional(),
  team: collection(Person, COLLECTION_LIMITS.team).optional(),
});
export type Collections = z.infer<typeof Collections>;

export interface EntryOf {
  blog: Post;
  events: Event;
  services: Service;
  team: Person;
}
export type AnyEntry = EntryOf[CollectionKind];

/** An entry's title: a post's or event's title, a service's or person's name. */
export const entryTitle = (e: AnyEntry): string => ("title" in e ? e.title : e.name);

const TRANSLIT: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "d", ä: "a", ö: "o", ü: "u", ß: "ss" };

/** "Poletni tečaj plavanja 2026" -> "poletni-tecaj-plavanja-2026". */
export function slugifyTitle(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[čćšžđäöüß]/g, (c) => TRANSLIT[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "vnos";
}

/**
 * Each entry's page name, in list order: its own slug, else one made from its title; a repeat gets -2, -3.
 * Entries the owner named keep their names; derived ones step around them.
 */
export function entrySlugs(items: readonly AnyEntry[]): string[] {
  const named = new Map<string, number>();
  items.forEach((e, i) => {
    if (e.slug && !named.has(e.slug)) named.set(e.slug, i);
  });
  const used = new Set<string>();
  return items.map((e, i) => {
    if (e.slug && named.get(e.slug) === i) {
      used.add(e.slug);
      return e.slug;
    }
    const base = e.slug ?? slugifyTitle(entryTitle(e));
    let slug = base;
    for (let n = 2; used.has(slug) || named.has(slug); n++) slug = `${base.slice(0, 56)}-${n}`;
    used.add(slug);
    return slug;
  });
}

/** Whether an entry has a page of its own: it has a body (a post always does). */
export const hasEntryPage = (e: AnyEntry): boolean => "body" in e && e.body !== undefined && e.body.length > 0;

export interface ResolvedEntry<K extends CollectionKind = CollectionKind> {
  kind: K;
  index: number;
  entry: EntryOf[K];
  slug: string;
  /** Path of its page inside the locale's directory ("novice/odprtje.html"), or null without a page. */
  path: string | null;
}

/**
 * A collection's entries in the order the site shows them: posts newest first, events soonest first,
 * services and team as the owner ordered them.
 */
export function collectionEntries<K extends CollectionKind>(collections: Collections | undefined, kind: K): ResolvedEntry<K>[] {
  const items = (collections?.[kind]?.items ?? []) as EntryOf[K][];
  const slugs = entrySlugs(items);
  const out = items.map((entry, index) => ({
    kind,
    index,
    entry,
    slug: slugs[index]!,
    path: hasEntryPage(entry) ? `${COLLECTION_DIRS[kind]}/${slugs[index]}.html` : null,
  }));
  if (kind === "blog") out.sort((a, b) => (b.entry as Post).date.localeCompare((a.entry as Post).date) || a.index - b.index);
  if (kind === "events") out.sort((a, b) => eventKey(a.entry as Event).localeCompare(eventKey(b.entry as Event)) || a.index - b.index);
  return out;
}

const eventKey = (e: Event) => `${e.date}T${e.start ?? "00:00"}`;

/** Every entry with a page of its own, across the site's collections. */
export function entryPages(collections: Collections | undefined): ResolvedEntry[] {
  return COLLECTION_KINDS.flatMap((k) => collectionEntries(collections, k)).filter((e) => e.path !== null);
}
