import { z } from "zod";
import { heroDefs, heroSchemas } from "./heroes.ts";
import { contentDefs, contentSchemas } from "./content.ts";
import { businessDefs, businessSchemas } from "./business.ts";
import { structureDefs, structureSchemas } from "./structure.ts";
import type { SectionMeta } from "./define.ts";

export * from "./define.ts";
export * from "./heroes.ts";
export * from "./content.ts";
export * from "./business.ts";
export * from "./structure.ts";

export const Section = z.discriminatedUnion("type", [
  ...heroSchemas,
  ...contentSchemas,
  ...businessSchemas,
  ...structureSchemas,
]);
export type Section = z.infer<typeof Section>;
export type SectionType = Section["type"];
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>;

type AnyDef = SectionMeta<string, readonly [string, ...string[]]> & { props: z.ZodObject; schema: z.ZodObject };

export const SECTION_DEFS: readonly AnyDef[] = [...heroDefs, ...contentDefs, ...businessDefs, ...structureDefs] as AnyDef[];

export function sectionDef(type: string): AnyDef {
  const d = SECTION_DEFS.find((s) => s.type === type);
  if (!d) throw new Error(`Unknown section type: ${type}`);
  return d;
}
