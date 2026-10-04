import { describe, expect, it } from "vitest";
import { missingFacts, type PublishBlocker } from "../src/index.ts";

describe("missingFacts (the 'Še to potrebujemo' screen)", () => {
  it("asks for the facts only the owner can give, once each, in checklist order", () => {
    const checklist: PublishBlocker[] = [
      { path: "/pages/1/sections/1/props/items/2/price", kind: "placeholder", detail: "price" },
      { path: "/business/email", kind: "placeholder", detail: "email" },
      { path: "/business/hours", kind: "placeholder", detail: "hours" },
      { path: "/business/serviceArea", kind: "placeholder", detail: "serviceArea" },
      { path: "/business/provider/taxNumber", kind: "placeholder", detail: "taxNumber" },
      { path: "/business/email", kind: "placeholder", detail: "email" },
      // Not facts: free text, a photo description, a value the fact check doesn't find, wording.
      { path: "/pages/0/sections/3/props/body", kind: "placeholder", detail: "text" },
      { path: "/assets/images/0/alt", kind: "alt", detail: "img_01" },
      { path: "/business/phone", kind: "fact", detail: "phone", value: "+38641000000" },
      { path: "/pages/0/sections/0/props/title", kind: "starter", detail: "starter text" },
    ];
    expect(missingFacts(checklist)).toEqual([
      { path: "/pages/1/sections/1/props/items/2/price", kind: "price" },
      { path: "/business/email", kind: "email" },
      { path: "/business/hours", kind: "hours" },
      { path: "/business/serviceArea", kind: "serviceArea" },
      { path: "/business/provider/taxNumber", kind: "taxNumber" },
    ]);
    expect(missingFacts([])).toEqual([]);
  });
});
