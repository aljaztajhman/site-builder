import { collectPlaceholders, type PlaceholderKind } from "@sb/spec";

/**
 * Fictional test values an owner would type into the editor, one per placeholder kind.
 * Used by the deployed smoke test to make a generated site publishable; never shipped to a real site.
 */
export const TEST_FACTS: Record<PlaceholderKind, unknown> = {
  phone: "+38640123456",
  email: "info@primer.si",
  address: { street: "Testna ulica 1", postalCode: "1000", city: "Ljubljana" },
  price: { amount: 10 },
  hours: {
    entries: [
      { from: "mon", to: "fri", open: "08:00", close: "16:00" },
      { from: "sat", to: "sun", closed: true },
    ],
  },
  name: "Ana Testna",
  legalName: "Testno podjetje d.o.o.",
  registrationNumber: "1234567000",
  taxNumber: "SI12345678",
  text: "Testno besedilo.",
};

/** JSON Patch ops that replace every placeholder in the spec with its test value. */
export function fillPlaceholderOps(spec: unknown): { op: "replace"; path: string; value: unknown }[] {
  return collectPlaceholders(spec).map((p) => ({ op: "replace" as const, path: p.path, value: TEST_FACTS[p.kind] }));
}
