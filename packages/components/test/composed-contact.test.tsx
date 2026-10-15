import { describe, expect, it } from "vitest";
import { ComposedProps, type Section } from "@sb/spec";
import { Composed } from "../src/groups/composed/index.tsx";
import { html, testCtx } from "./helpers.ts";

/**
 * Each way to reach the business once per composed section (the studio shoot-out, 2026-10-15: a map printed the address
 * and the contact element beside it printed it again; a phone plate and a contact element both printed the phone).
 */
const at = (order: number) => ({ desk: { col: 1, span: 6, row: order + 1 }, phone: { order, span: "full" } });
const section = (elements: object[]) =>
  ({ id: "s_contact", type: "composed", variant: "free", props: ComposedProps.parse({ intent: "contact", width: "contained", rows: elements.length, elements }) }) as unknown as Section & { type: "composed" };
const render = (elements: object[]) => html(<Composed section={section(elements)} ctx={testCtx()} index={1} />);
const count = (s: string, needle: string) => s.split(needle).length - 1;

const heading = { id: "e_h", kind: "heading", text: "Kontakt", level: 2, size: 3, ...at(0) };
const map = { id: "e_map", kind: "map", style: "pin", ...at(1) };
const phoneFact = { id: "e_ph", kind: "fact", value: "041 123 456", label: "Telefon", treatment: "numeral", size: 6, link: { action: "call" }, ...at(2) };

describe("a composed contact element beside a map or a phone fact", () => {
  it("leaves out the address and the directions link the map prints, keeps the e-mail", () => {
    const out = render([heading, map, { id: "e_c", kind: "contact", show: ["address", "email", "map"], ...at(3) }]);
    expect(count(out, "Trubarjeva cesta 12")).toBe(1); // the map's caption; none from the contact element
    expect(count(out, 'contact__fact"')).toBe(1);
    expect(out).toContain('href="mailto:info@salon-lipa.si"');
  });

  it("leaves out the phone a fact shows; with nothing left the element renders nothing", () => {
    const out = render([heading, phoneFact, { id: "e_c", kind: "contact", show: ["phone"], ...at(3) }]);
    expect(out).not.toContain("contact__facts");
    expect(out).not.toContain("cx-contact");
    expect(count(out, 'href="tel:')).toBe(1);
  });

  it("without a map or a phone fact it shows all it lists", () => {
    const out = render([heading, { id: "e_c", kind: "contact", show: ["phone", "address", "email"], ...at(1) }]);
    expect(count(out, "contact__fact\"")).toBe(3);
  });
});
