const MAP: Record<string, string> = { č: "c", ć: "c", š: "s", ž: "z", đ: "d", ä: "a", ö: "o", ü: "u", ß: "ss" };

/** ASCII kebab-case slug from free text: "Frizerski salon Lipa, Ljubljana" -> "frizerski-salon-lipa". */
export function slugify(text: string, maxWords = 3): string {
  return text
    .toLowerCase()
    .replace(/[čćšžđäöüß]/g, (ch) => MAP[ch] ?? ch)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join("-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/^-|-$/g, "");
}
