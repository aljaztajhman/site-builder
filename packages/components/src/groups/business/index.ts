import type { SectionType } from "@sb/spec";
import type { LcpResolvers } from "../../types.ts";
import { Contact, Faq, OpeningHours } from "./Info.tsx";
import { Gallery, Products, Rooms, ServiceArea, Team } from "./Media.tsx";
import { Menu, PriceList } from "./Prices.tsx";
import { ServicesCards, ServicesList } from "./Services.tsx";

// Renderers for the "business" section group, keyed by section type.
export const businessRenderers = {
  "services-list": ServicesList,
  "services-cards": ServicesCards,
  "price-list": PriceList,
  menu: Menu,
  "opening-hours": OpeningHours,
  contact: Contact,
  faq: Faq,
  team: Team,
  gallery: Gallery,
  products: Products,
  rooms: Rooms,
  "service-area": ServiceArea,
};

/** No business section opens a page, so none is an LCP candidate. */
export const businessLcp: LcpResolvers = {};

/** Islands (packages/components/islands) a section needs on the page. */
export const businessIslands: Partial<Record<SectionType, string[]>> = {
  contact: ["consent.js"],
  gallery: ["gallery.js"],
};
