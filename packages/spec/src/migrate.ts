import { SPEC_VERSION, type SiteSpec } from "./site.ts";

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
