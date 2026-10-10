import { Section } from "../../primitives/index.tsx";
import type { LcpResolvers, SectionProps } from "../../types.ts";

/**
 * Spec v19 composed sections (packages/spec/src/composition). Placeholder until the renderer lands (F1, builder
 * "renderer"): it renders the section shell only. Nothing generates composed sections while config designer.agent is off.
 */
export function Composed({ section }: SectionProps<"composed">) {
  return <Section id={section.id} type={section.type} variant={section.variant} tone={section.tone}>{null}</Section>;
}

export const composedRenderers = { composed: Composed };
export const composedLcp: LcpResolvers = {};