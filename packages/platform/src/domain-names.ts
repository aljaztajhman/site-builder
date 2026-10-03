/**
 * Domain names to offer an owner, from the business name: ASCII labels (č → c, š → s, ž → z …), the
 * legal form (s.p., d.o.o. …) and filler dropped, joined and hyphenated variants, the town as a fallback.
 * Availability and price come from the registrar; this only proposes, in the order to show them.
 */

/** Legal forms and their pieces: never part of the name. */
const LEGAL = new Set(["s", "p", "sp", "d", "o", "oo", "doo", "dd", "dno", "zoo", "ltd", "gmbh", "inc", "llc", "kd"]);
/** Small words that make a name longer without making it more recognisable. */
const FILLER = new Set(["in", "ter", "za", "na", "pri", "v", "z", "s", "the", "and", "of", "storitve", "podjetje"]);

const LABEL_MAX = 63;

/** Lower-case ASCII words of a name (diacritics folded, anything else a separator). */
export function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/đ/g, "dz")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/&/g, " in ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The words of the name without the legal form at the end ("Pekarna Kvas, s.p.", "Novak d.o.o."). */
export function businessWords(name: string): string[] {
  const words = nameWords(name);
  while (words.length > 1 && LEGAL.has(words.at(-1)!)) words.pop();
  return words;
}

/** businessWords without the small filler words ("Gostilna pri Zlati Žlici" → gostilna, zlati, zlici). */
export function coreWords(name: string): string[] {
  const words = businessWords(name);
  const core = words.filter((w, i) => i === 0 || !FILLER.has(w));
  return core.length ? core : words;
}

const validLabel = (l: string) => l.length >= 2 && l.length <= LABEL_MAX && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l) && !l.includes("--");

/**
 * Second-level labels in the order to offer them: the whole name joined ("gostilnaprizlatizlici") and
 * hyphenated, the same without filler words ("gostilnazlatizlici"), then with the town
 * ("pekarnakvas-ljubljana"), then the words after a generic first one ("kvas" from "Pekarna Kvas").
 */
export function domainLabels(name: string, opts: { town?: string | null } = {}): string[] {
  const words = businessWords(name);
  const core = coreWords(name);
  const out: string[] = [];
  const add = (l: string) => {
    if (validLabel(l) && !out.includes(l)) out.push(l);
  };
  add(words.join(""));
  if (words.length > 1) add(words.join("-"));
  add(core.join(""));
  if (core.length > 1) add(core.join("-"));
  const town = opts.town ? nameWords(opts.town).join("") : "";
  if (town && !core.includes(town)) {
    add(`${core.join("")}-${town}`);
    add(`${core.join("")}${town}`);
  }
  if (core.length > 1) add(core.slice(1).join(""));
  return out;
}

/**
 * Full names to check, labels × TLDs in order: every label in the first TLD (.si for a Slovene business),
 * then the next TLD. `limit` caps how many the registrar is asked about.
 */
export function suggestDomains(name: string, opts: { tlds: readonly string[]; town?: string | null; limit?: number }): string[] {
  const labels = domainLabels(name, { town: opts.town ?? null });
  const out: string[] = [];
  for (const tld of opts.tlds) for (const l of labels) out.push(`${l}.${tld.replace(/^\./, "")}`);
  return out.slice(0, opts.limit ?? out.length);
}
