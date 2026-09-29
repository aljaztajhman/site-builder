import { z } from "zod";
import { orPlaceholder, text } from "./common.ts";

export const BusinessType = z.enum([
  "hairdresser",
  "restaurant",
  "tourist-farm",
  "car-repair",
  "dental",
  "physio",
  "accountant",
  "builder",
  "shop",
  "bakery",
]);
export type BusinessType = z.infer<typeof BusinessType>;

export const Address = z.strictObject({
  street: text(80).describe('Street and number, e.g. "Trubarjeva cesta 12"'),
  postalCode: z.string().regex(/^\d{4}$/),
  city: text(40),
  country: text(40).optional(),
});
export type Address = z.infer<typeof Address>;

export const Day = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export type Day = z.infer<typeof Day>;
export const DAYS: readonly Day[] = Day.options;

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const HoursEntry = z.strictObject({
  from: Day,
  to: Day,
  closed: z.boolean().optional(),
  open: Time.optional(),
  close: Time.optional(),
});
export type HoursEntry = z.infer<typeof HoursEntry>;

export const Hours = z.strictObject({
  entries: z.array(HoursEntry).min(1).max(7),
  note: z.string().max(140).optional().describe("e.g. seasonal note, taken from the client's input"),
});
export type Hours = z.infer<typeof Hours>;

export const Social = z.strictObject({
  network: z.enum(["facebook", "instagram", "tiktok", "youtube", "linkedin"]),
  url: z.url().max(200),
});

/**
 * Facts about the business. Only what the client provided; everything else is a placeholder.
 * Components read facts from here instead of repeating them in section copy.
 */
export const Business = z.strictObject({
  name: text(80),
  type: BusinessType,
  phone: orPlaceholder(z.string().regex(/^\+\d{8,15}$/).describe("E.164, e.g. +38641123456")),
  email: orPlaceholder(z.email().max(120)),
  address: orPlaceholder(Address),
  hours: orPlaceholder(Hours).optional(),
  bookingUrl: z.url().max(300).optional(),
  social: z.array(Social).max(5).optional(),
  /** Provider information required by ZEPT in the footer. */
  provider: z.strictObject({
    legalName: orPlaceholder(text(120)),
    registrationNumber: orPlaceholder(z.string().regex(/^\d{7}(\d{3})?$/).describe("Matična številka")),
    taxNumber: orPlaceholder(z.string().regex(/^(SI)?\d{8}$/).describe("Davčna številka / ID za DDV")),
    vatPayer: z.boolean().optional(),
    registry: z.string().max(120).optional().describe('e.g. "AJPES"'),
  }),
  serviceArea: z.array(text(40)).max(20).optional(),
});
export type Business = z.infer<typeof Business>;
