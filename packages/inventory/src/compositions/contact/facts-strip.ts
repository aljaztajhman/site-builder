import { definePreset } from "@sb/spec";

/** No heading: the phone, the address with directions and the opening hours in one row. */
export default definePreset({
  id: "composition/contact/facts-strip",
  tags: { mood: ["practical", "slim"] },
  props: {
    intent: "contact",
    width: "contained",
    rows: 2,
    elements: [
      { id: "e_phone", kind: "contact", show: ["phone"], desk: { col: 1, span: 4, row: 1, rowSpan: 2 }, phone: { order: 0, span: "full" } },
      { id: "e_addr", kind: "contact", show: ["address"], desk: { col: 5, span: 4, row: 1 }, phone: { order: 1, span: "full" } },
      { id: "e_dir", kind: "action", action: "directions", label: "Pot do nas", style: "text", desk: { col: 5, span: 4, row: 2, alignY: "start" }, phone: { order: 2, span: "full" } },
      { id: "e_hours", kind: "hours", style: "compact", desk: { col: 9, span: 4, row: 1, rowSpan: 2 }, phone: { order: 3, span: "full" } },
    ],
  },
  // Without hours the address takes the free columns.
  reflow: { e_hours: { e_addr: { span: 8 } } },
  note: "Re-expresses contact-strip:bar: three facts side by side, a strip under the opener.",
});
