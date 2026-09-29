import type { MenuTag } from "@sb/spec";
import type { UiKey } from "../../i18n.ts";
import type { ResolvedImage } from "../../types.ts";

/** URL of the largest WebP variant, for no-JS links to a full-size photo. */
export function largestWebp(img: ResolvedImage): string {
  const webp = img.sources.find((s) => s.type === "image/webp");
  if (!webp) return img.src;
  let best = img.src;
  let bestW = 0;
  for (const part of webp.srcSet.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    const w = Number.parseInt(descriptor ?? "", 10);
    if (url && Number.isFinite(w) && w > bestW) {
      best = url;
      bestW = w;
    }
  }
  return best;
}

export const TAG_KEYS: Record<MenuTag, UiKey> = {
  vegetarian: "tagVegetarian",
  vegan: "tagVegan",
  "gluten-free": "tagGlutenFree",
  "lactose-free": "tagLactoseFree",
  spicy: "tagSpicy",
  local: "tagLocal",
};

/** Stable id for an item heading inside a section. */
export function itemId(sectionId: string, i: number, suffix = "item"): string {
  return `${sectionId}-${suffix}-${i}`;
}
