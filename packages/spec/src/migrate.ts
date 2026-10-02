import { SPEC_VERSION, type SiteSpec } from "./site.ts";
import { repairSiteCopy } from "./banned.ts";
import { Design } from "./design.ts";
import { enforceDesign } from "./design-rules.ts";
import { DIRECTIONS } from "./directions.ts";

type RawSpec = Record<string, unknown>;

/**
 * Spec migrations. Every spec change bumps SPEC_VERSION and adds a step here that turns
 * version n into n + 1, with a test in test/migrate.test.ts.
 */
export const MIGRATIONS: Record<number, (spec: RawSpec) => RawSpec> = {
  // 1 → 2: adds the "contact-form" section type. Additive: every v1 spec is a valid v2 spec.
  1: (spec) => spec,
  // 2 → 3: optional `origin` on images ("generated" for AI images). Additive: every v2 spec is a valid v3 spec.
  2: (spec) => spec,
  // 3 → 4: give-away rules (sb-giveaway-additions). The schema is unchanged; stored copy and colours are
  // brought inside the new rules mechanically so existing sites stay valid: em dashes in pages and
  // translations become en dashes, pure black and pure white text and surface colours become off-black and
  // off-white (contrast kept). New filler phrases and all-caps eyebrows can't be fixed mechanically; the
  // editor's checklist lists them.
  3: (spec) => {
    const out = structuredClone(spec);
    repairSiteCopy(out);
    const design = Design.safeParse(out.design);
    const dir = design.success ? DIRECTIONS.find((d) => d.id === design.data.direction) : undefined;
    if (design.success && dir) out.design = { ...design.data, colors: enforceDesign(design.data, dir).colors };
    return out;
  },
  // 4 → 5: trade templates. Additive: the "band" tone, optional colours band/onBand, heading weight up to 900,
  // the hero-signature section, price-list "tags" and contact "call-out". Every v4 spec is a valid v5 spec.
  4: (spec) => spec,
  // 5 → 6: owner-edited price lists and menus (sb-roadmap-order). Additive: optional `unavailable` on
  // price-list items and menu dishes. Every v5 spec is a valid v6 spec.
  5: (spec) => spec,
  // 6 → 7: trade templates R (Račun) and T (Etiketa). Additive: hero-signature variants "receipt" and "label",
  // fact "address", optional factLabel (still required for phone and opening, checked in validate.ts), optional
  // receipt and inset; highlights "figures"; about "figure" with optional figure; image-text "round"; opening-hours
  // "photo" with optional image and inset. Every v6 spec is a valid v7 spec.
  6: (spec) => spec,
  // 7 → 8: trade templates K (Jedilnik) and L (Ogledalo). Additive: hero-signature variants "card" and "mirrors"
  // with optional images and wordmark (fact address also on card); price-list "offers"; products "plates"; team
  // "photo" with optional image and inset; image-text "pair" with optional inset and figure. Every v7 spec is a
  // valid v8 spec.
  7: (spec) => spec,
  // 8 → 9: trade template O (Nasmeh). Additive: hero-signature "disc"; opening-hours "week"; services-list "aside"
  // with an optional note; a service's description optional (validation still requires it outside aside). Every v8
  // spec is a valid v9 spec.
  8: (spec) => spec,
  // 9 → 10: trade templates N (Markacija) and P (Pregib). Additive: hero-signature "view" with optional signs and
  // "bend" (fact address also on bend); price-list "rates" with an optional image; opening-hours "poster"; gallery
  // "wall". Every v9 spec is a valid v10 spec.
  9: (spec) => spec,
};

export function migrateSpec(input: unknown, migrations = MIGRATIONS, target: number = SPEC_VERSION): SiteSpec {
  if (!input || typeof input !== "object") throw new Error("Spec must be an object");
  let spec = input as RawSpec;
  let version = typeof spec.specVersion === "number" ? spec.specVersion : NaN;
  if (!Number.isInteger(version)) throw new Error("Spec has no specVersion");
  if (version > target) throw new Error(`Spec version ${version} is newer than supported ${target}`);
  while (version < target) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration from spec version ${version}`);
    spec = { ...step(spec), specVersion: version + 1 };
    version += 1;
  }
  return spec as unknown as SiteSpec;
}
