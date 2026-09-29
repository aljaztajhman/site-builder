import { ContactStrip } from "./ContactStrip.tsx";
import { Legal } from "./Legal.tsx";
import { NotFound } from "./NotFound.tsx";

export const structureRenderers = {
  legal: Legal,
  "not-found": NotFound,
  "contact-strip": ContactStrip,
};

/** Islands (files in packages/components/islands) each structure section needs. None so far. */
export const structureIslands: Partial<Record<string, string[]>> = {};
