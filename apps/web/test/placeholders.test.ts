import { describe, expect, it } from "vitest";
import { placeholderPath } from "../src/client/placeholders.ts";

const list = [
  { path: "/business/provider/legalName", kind: "legalName" },
  { path: "/business/phone", kind: "phone" },
  { path: "/pages/0/sections/2/props/items/4/price", kind: "price" },
  { path: "/pages/0/sections/2/props/items/5/price", kind: "price" },
  { path: "/pages/0/sections/3/props/members/0/name", kind: "name" },
  { path: "/translations/en/pages/0/sections/2/props/items/4/price", kind: "price" },
];

describe("placeholderPath: the field a tapped placeholder fills", () => {
  it("takes the section's own placeholders of that kind in page order", () => {
    expect(placeholderPath(list, "price", "/pages/0/sections/2/", 0)).toBe("/pages/0/sections/2/props/items/4/price");
    expect(placeholderPath(list, "price", "/pages/0/sections/2/", 1)).toBe("/pages/0/sections/2/props/items/5/price");
    expect(placeholderPath(list, "name", "/pages/0/sections/3/", 0)).toBe("/pages/0/sections/3/props/members/0/name");
  });

  it("falls back to the section's first one when the page shows more marks than the spec has", () => {
    expect(placeholderPath(list, "price", "/pages/0/sections/2/", 7)).toBe("/pages/0/sections/2/props/items/4/price");
  });

  it("finds a business fact shown in any section, the header or the footer", () => {
    expect(placeholderPath(list, "phone", "/pages/0/sections/1/", 0)).toBe("/business/phone");
    expect(placeholderPath(list, "legalName", null, 0)).toBe("/business/provider/legalName");
  });

  it("never sends a tap on one section to another section's or a translation's field", () => {
    expect(placeholderPath(list, "price", "/pages/0/sections/5/", 0)).toBeNull();
    expect(placeholderPath(list, "price", null, 0)).toBeNull();
  });
});
