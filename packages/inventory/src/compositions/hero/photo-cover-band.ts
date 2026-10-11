import { definePreset } from "@sb/spec";

/** The client's photo under a dark scrim; the headline, lead and the phone as a big number; the hours and address on a band at its foot. */
export default definePreset({
  id: "composition/hero/photo-cover-band",
  tags: { mood: ["photo", "bold", "facts"], stances: ["picture-postcard", "documentary-monochrome"] },
  needs: ["copy.headline", "images[0]"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "l",
    rows: 4,
    background: [
      { kind: "photo", image: "{images[0]}", scrim: { role: "inverse", strength: 3 }, phone: "cover" },
      { kind: "field", role: "band", rows: { from: 4, to: 4 } },
    ],
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", color: "onInverse", desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], size: 1, color: "onInverse", desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 5, color: "onInverse", link: { action: "call" }, desk: { col: 1, span: 5, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 1, span: 5, row: 4 }, phone: { order: 3, span: "full" } },
      { id: "e_addr", kind: "text", paragraphs: ["{business.address}"], desk: { col: 7, span: 4, row: 4, alignY: "center" }, phone: { order: 4, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "secondary", desk: { col: 11, span: 2, row: 4, alignY: "center" }, phone: { order: 5, span: "full" } },
    ],
  },
  // Without hours the address moves to the band's start.
  reflow: { e_hours: { e_addr: { col: 1, span: 5 } } },
  note: "Re-expresses hero-signature:photo: the photo as the layer, the phone as the object (it is the call), the facts on a band field.",
});
