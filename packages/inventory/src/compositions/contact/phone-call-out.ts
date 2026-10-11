import { definePreset } from "@sb/spec";

/** The heading and lead, the phone number at display size as the call, then the address and the hours small under a rule. */
export default definePreset({
  id: "composition/contact/phone-call-out",
  tags: { mood: ["bold", "direct"], stances: ["oversized-type"] },
  needs: ["copy.headline", "business.phone"],
  props: {
    intent: "contact",
    width: "contained",
    rows: 4,
    elements: [
      { id: "e_h", kind: "heading", text: "{copy.headline}", level: 2, size: 4, desk: { col: 1, span: 8, row: 1 }, phone: { order: 0, span: "full" } },
      { id: "e_t", kind: "text", paragraphs: ["{copy.lead}"], desk: { col: 1, span: 7, row: 2 }, phone: { order: 1, span: "full" } },
      { id: "e_phone", kind: "fact", value: "{business.phone}", label: "Pokličite", labelAt: "before", treatment: "numeral", size: 7, link: { action: "call" }, desk: { col: 1, span: 10, row: 3 }, phone: { order: 2, span: "full" } },
      { id: "e_c", kind: "contact", show: ["address", "email"], desk: { col: 1, span: 7, row: 4 }, phone: { order: 3, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 9, span: 4, row: 4 }, phone: { order: 4, span: "full" } },
    ],
  },
  // Without hours the other facts take the row.
  reflow: { e_hours: { e_c: { span: 12 } } },
  note: "Re-expresses contact:call-out: the phone as the object (it is the call), the other facts small.",
});
