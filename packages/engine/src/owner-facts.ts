import { isPlaceholder, type Business, type SiteSpec } from "@sb/spec";

/**
 * "Ustvari znova" rebuilds a site from the intake text, which is older than anything the owner typed in
 * the editor since. Facts about the business are not a matter of style, so a regeneration keeps the
 * current version's facts wherever they are filled in: a corrected phone number, the provider data
 * typed for publishing, opening hours. Only empty (placeholder) facts take the regenerated value.
 */
const FACTS = ["name", "phone", "email", "address", "hours", "bookingUrl", "social", "serviceArea"] as const;
const PROVIDER = ["legalName", "registrationNumber", "taxNumber", "vatPayer", "registry"] as const;

const filled = (v: unknown) => v !== undefined && !isPlaceholder(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function keepOwnerFacts(current: SiteSpec, regenerated: SiteSpec): { spec: SiteSpec; kept: string[] } {
  const was = current.business;
  const business: Business = { ...regenerated.business, provider: { ...regenerated.business.provider } };
  const kept: string[] = [];
  const target = business as unknown as Record<string, unknown>;
  for (const k of FACTS) {
    if (filled(was[k]) && !same(was[k], business[k])) {
      target[k] = structuredClone(was[k]);
      kept.push(`/business/${k}`);
    }
  }
  const provider = business.provider as unknown as Record<string, unknown>;
  for (const k of PROVIDER) {
    if (filled(was.provider[k]) && !same(was.provider[k], business.provider[k])) {
      provider[k] = structuredClone(was.provider[k]);
      kept.push(`/business/provider/${k}`);
    }
  }
  return { spec: { ...regenerated, business }, kept };
}
