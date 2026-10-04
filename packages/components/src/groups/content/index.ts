import type { SectionType } from "@sb/spec";
import type { LcpResolvers } from "../../types.ts";
import { About } from "./About.tsx";
import { Announcement } from "./Announcement.tsx";
import { Booking } from "./Booking.tsx";
import { Cta } from "./Cta.tsx";
import { Highlights } from "./Highlights.tsx";
import { ImageText } from "./ImageText.tsx";
import { Steps } from "./Steps.tsx";
import { Text } from "./Text.tsx";
import { Collection } from "./Collection.tsx";

export const contentRenderers = {
  text: Text,
  "image-text": ImageText,
  highlights: Highlights,
  steps: Steps,
  cta: Cta,
  booking: Booking,
  about: About,
  announcement: Announcement,
  collection: Collection,
};

/** Content sections render an h2 and never open a page, so none is an LCP candidate. */
export const contentLcp: LcpResolvers = {};

/** No content section needs client-side JS. */
export const contentIslands: Partial<Record<SectionType, string[]>> = {
  // Hides events whose last day has passed (and says when none are left).
  collection: ["events.js"],
};
