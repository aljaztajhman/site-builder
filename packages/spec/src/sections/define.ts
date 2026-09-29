import { z } from "zod";
import { Tone } from "../common.ts";

export type SectionGroup = "heroes" | "content" | "business" | "structure";

export interface SectionMeta<T extends string, V extends readonly [string, ...string[]]> {
  type: T;
  group: SectionGroup;
  variants: V;
  /** For the model catalogue: what it is for, when to use it (English, one or two sentences). */
  description: string;
  /** Whether the section needs photos. "required" sections cannot be used on a site without photos. */
  images: "none" | "optional" | "required";
  /** Mobile behaviour at 360 px (for the catalogue and reviewers). */
  mobile: string;
  /** Accessibility notes. */
  a11y: string;
  /** Section is centred as a whole (limited per page by the banned "everything centred" rule). */
  centredVariants?: readonly V[number][];
  /** Only the code adds this section (legal pages, 404); the model must not add or edit it. */
  systemOnly?: boolean;
}

export const SectionId = z.string().regex(/^s_[a-z0-9_-]+$/);

export function defineSection<
  const T extends string,
  const V extends readonly [string, ...string[]],
  P extends z.ZodObject,
>(meta: SectionMeta<T, V>, props: P) {
  const schema = z.strictObject({
    id: SectionId,
    type: z.literal(meta.type),
    variant: z.enum(meta.variants),
    tone: Tone.optional(),
    props,
  });
  return { ...meta, props, schema };
}

export type SectionDef = ReturnType<typeof defineSection>;
