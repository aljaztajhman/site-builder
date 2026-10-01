import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSite, type SiteSpec } from "@sb/spec";
import { keepOwnerFacts } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const golden = (): SiteSpec => JSON.parse(readFileSync(path.join(here, "../../../tools/eval/golden/pekarna-kvas.json"), "utf8")) as SiteSpec;

describe("keepOwnerFacts", () => {
  it("keeps facts the current version has filled in, over what a regeneration produced", () => {
    const current = golden();
    current.business.phone = "+38641000111"; // corrected by the owner
    current.business.provider = { ...current.business.provider, legalName: "Pekarna Kvas d.o.o.", taxNumber: "12345678", registrationNumber: "1234567000" };
    const regenerated = golden(); // phone from the intake text, provider placeholders
    regenerated.pages[0]!.sections[0]!.props = { ...regenerated.pages[0]!.sections[0]!.props, headline: "Nov naslov iz nove generacije" };

    const r = keepOwnerFacts(current, regenerated);
    expect(r.spec.business.phone).toBe("+38641000111");
    expect(r.spec.business.provider).toMatchObject({ legalName: "Pekarna Kvas d.o.o.", taxNumber: "12345678", registrationNumber: "1234567000" });
    expect(r.kept.sort()).toEqual(["/business/phone", "/business/provider/legalName", "/business/provider/registrationNumber", "/business/provider/taxNumber"]);
    // Everything else is the regenerated site.
    expect((r.spec.pages[0]!.sections[0]!.props as { headline: string }).headline).toBe("Nov naslov iz nove generacije");
    expect(validateSite(r.spec).ok).toBe(true);
    // The inputs are not changed.
    expect(regenerated.business.phone).toBe(golden().business.phone);
  });

  it("lets a regenerated value fill a fact the current version is still missing", () => {
    const current = golden();
    current.business.email = { $placeholder: "email" } as unknown as string;
    const regenerated = golden();
    regenerated.business.email = "info@pekarnakvas.si";
    const r = keepOwnerFacts(current, regenerated);
    expect(r.spec.business.email).toBe("info@pekarnakvas.si");
    expect(r.kept).toEqual([]);
  });
});
