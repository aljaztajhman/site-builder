import { isPlaceholder, type BusinessType, type SiteSpec } from "@sb/spec";

const SCHEMA_TYPE: Record<BusinessType, string> = {
  hairdresser: "HairSalon",
  restaurant: "Restaurant",
  "tourist-farm": "LodgingBusiness",
  "car-repair": "AutoRepair",
  dental: "Dentist",
  physio: "Physiotherapy",
  accountant: "AccountingService",
  builder: "HomeAndConstructionBusiness",
  shop: "Store",
  bakery: "Bakery",
};

const DAY_URI: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** LocalBusiness structured data with only the facts the client provided (never placeholders). */
export function jsonLd(spec: SiteSpec): string {
  const b = spec.business;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[b.type],
    name: b.name,
  };
  if (!isPlaceholder(b.phone)) data.telephone = b.phone;
  if (!isPlaceholder(b.email)) data.email = b.email;
  if (!isPlaceholder(b.address)) {
    data.address = {
      "@type": "PostalAddress",
      streetAddress: b.address.street,
      postalCode: b.address.postalCode,
      addressLocality: b.address.city,
      addressCountry: "SI",
    };
  }
  if (b.hours && !isPlaceholder(b.hours)) {
    data.openingHoursSpecification = b.hours.entries
      .filter((e) => !e.closed && e.open && e.close)
      .map((e) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ORDER.slice(ORDER.indexOf(e.from), ORDER.indexOf(e.to) + 1).map((d) => DAY_URI[d]),
        opens: e.open,
        closes: e.close,
      }));
  }
  // "<" escaped so the JSON can never close the script element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
