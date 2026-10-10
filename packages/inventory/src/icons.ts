/**
 * The practical-fact icons (kind `icon`, docs/plans/studio-phase1-design.md §4, §5 batch I9): ids `icon/<style>/<fact>`,
 * one per PRACTICAL_FACTS key and style. The line style (I9-p, the pilot the owner rates) is drawn in @sb/components
 * (groups/composed/kinds/icons.ts); solid and cut follow in I9c. Each registers as a draft until the owner's gallery
 * decision (decisions.json). An icon fits any trade and ground: it is ink in the text colour (currentColor).
 */
import { PRACTICAL_FACTS } from "@sb/spec";
import { LINE_ICONS, factIconSvg, type PracticalFact } from "@sb/components";
import type { Asset } from "./schema.ts";

/** What each line icon draws, one line each (the registry note; the gallery shows it under the icon). */
export const ICON_NOTES: Readonly<Record<PracticalFact, string>> = {
  parking: "A P on a sign plate on its post.",
  "free-parking": "The P sign beside a struck-out euro sign.",
  "bike-parking": "A bicycle, side view.",
  "ev-charging": "A two-pin plug with its cable (no lightning bolt).",
  "public-transport": "A bus seen from the front: windscreen, headlights, wheels.",
  wheelchair: "The forward-leaning wheelchair user (the dynamic accessibility symbol), drawn new in line.",
  "step-free": "A ramp up to a level landing and a door.",
  "accessible-toilet": "A toilet, side view, with a small wheelchair symbol above the bowl.",
  lift: "A lift car with its up and down arrows.",
  card: "A payment card with its stripe.",
  contactless: "A card held up with three waves going out from it.",
  "cash-only": "A banknote.",
  invoice: "A sheet with a folded corner and a euro sign.",
  "gift-voucher": "A card tied with a ribbon and a bow.",
  wifi: "Three arcs over a dot.",
  toilets: "A toilet, side view: cistern, bowl, pedestal.",
  "baby-change": "A baby on its back, legs up, on a fold-down changing table.",
  "kids-welcome": "An adult and a child holding hands.",
  "play-corner": "Toy blocks, one with a circle and one with a triangle, a third tipped on top.",
  "pets-welcome": "A paw print in outline.",
  "no-pets": "The paw print in a struck-out circle.",
  terrace: "A parasol over a café table.",
  garden: "A tree with a full crown on the ground line.",
  "air-con": "A wall air-conditioning unit with three wavy lines of air.",
  takeaway: "A lidded paper cup to go with its sleeve.",
  delivery: "A delivery van, side view.",
  "home-visits": "A house with a location pin in it.",
  "pickup-service": "A house with an arrow leading out of it.",
  emergency: "A rotating beacon light with its rays.",
  "appointment-only": "A calendar page with a clock over its corner.",
  "walk-ins": "A walking figure going in at a doorway.",
  "online-booking": "A laptop with a pointer on its screen.",
  "phone-booking": "A telephone handset.",
  vegetarian: "A carrot with its leaves.",
  vegan: "A leaf with its vein.",
  "gluten-free": "An ear of wheat in a struck-out circle.",
  "local-produce": "A market basket with an apple and its leaf.",
  english: "A speech bubble with EN in drawn capitals.",
  german: "A speech bubble with DE in drawn capitals.",
  italian: "A speech bubble with IT in drawn capitals.",
};

/** What an icon adds to a page: its inline SVG as an iconFacts item writes it (no CSS of its own). */
export const iconBytes = (fact: string): number => Buffer.byteLength(factIconSvg(fact) ?? "", "utf8");

/** The line icons as draft assets `icon/line/<fact>`, in PRACTICAL_FACTS order. */
export function iconAssets(): Asset[] {
  return PRACTICAL_FACTS.map((fact) => {
    if (!LINE_ICONS[fact]) throw new Error(`No line icon for ${fact} (packages/components/src/groups/composed/kinds/icons.ts)`);
    return {
      id: `icon/line/${fact}`,
      kind: "icon",
      tags: { trades: [], stances: [], intents: [], mood: ["line"], ground: ["dark", "tint", "white"], density: ["airy", "compact", "regular"] },
      phone: "ok",
      bytes: iconBytes(fact),
      license: "own",
      status: "draft",
      note: `I9-p: ${ICON_NOTES[fact]}`,
    } satisfies Asset;
  });
}
