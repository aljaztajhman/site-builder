import { definePreset } from "@sb/spec";

/** The headline, lead and two actions on the left; the client's photo as a large disc on the right, a hang tag with the town and street tilted over its edge. */
export default definePreset({
  id: "composition/hero/disc-photo-tag",
  tags: { mood: ["round", "photo", "friendly"], stances: ["hang-tag", "portrait-first"] },
  needs: ["copy.headline"],
  props: {
    intent: "hero",
    width: "wide",
    minHeight: "m",
    rows: 3,
    elements: [
      { id: "e_title", kind: "heading", text: "{copy.headline}", level: 1, size: 6, weight: 800, measure: "m", desk: { col: 1, span: 7, row: 1, alignY: "end" }, phone: { order: 0, span: "full" } },
      { id: "e_lead", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 6, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_call", kind: "action", action: "call", label: "Pokličite", style: "primary", desk: { col: 1, span: 2, row: 3, alignY: "start" }, phone: { order: 2, span: "half" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 3, span: 3, row: 3, alignY: "start" }, phone: { order: 3, span: "half" } },
      { id: "e_photo", kind: "image", image: "{images[0]}", ratio: "1:1", mask: "circle", desk: { col: 8, span: 5, row: 1, rowSpan: 3, alignY: "center" }, phone: { order: 4, span: "inset" } },
      { id: "e_tag", kind: "fact", value: "{business.town}", label: "{business.street}", treatment: "tag", size: 3, desk: { col: 11, span: 2, row: 1, layer: 1, tilt: 6, alignY: "start" }, phone: { order: 5, span: "half" } },
    ],
  },
  // Without a photo the tag stays (the town is still a fact) and the words widen.
  reflow: { e_photo: { e_title: { span: 9 }, e_lead: { span: 7 } } },
  note: "Re-expresses hero-signature:disc: the round photo, and in place of the client's sticker a tag with the town and street.",
});
