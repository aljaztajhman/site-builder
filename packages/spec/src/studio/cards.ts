/**
 * The starter constraint-card deck (design-studio.md §5.3): one card per concept, drawn by seed, pushing it away from
 * the safe middle the way a creative brief does. The full deck of 50 comes with the inventory (I8). The director may
 * reject a card with a written reason; the critic sees the cards.
 */
import type { ConstraintCard } from "./deck.ts";

export const CARDS: readonly ConstraintCard[] = [
  { id: "headline-largest", text: "The headline is the largest thing on the page." },
  { id: "one-photo-full-bleed", text: "One photo only, full bleed." },
  { id: "no-photo-first-screen", text: "The first screen has no photo; a drawn object carries it." },
  { id: "asymmetric-5-7", text: "A 5/7 asymmetric grid, held on every section." },
  { id: "fact-as-object", text: "The strongest fact the client gave is an object on the page, not a sentence." },
  { id: "two-colours-and-paper", text: "Two colours and the paper; nothing else." },
  {
    id: "phone-is-hero",
    text: "The phone number is the hero.",
    appliesTo: { trades: ["car-repair", "builder", "physio", "dental", "hairdresser", "accountant", "tourist-farm"] },
  },
  { id: "one-typeface", text: "One typeface in three sizes; hierarchy from size and space alone." },
  { id: "price-at-headline-size", text: "One price the client gave, set at headline size.", appliesTo: { trades: ["restaurant", "bakery", "shop", "hairdresser", "tourist-farm"] } },
];
