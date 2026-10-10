/**
 * Reference homepages the director may be shown (design-studio.md §4.1, §5.1): for now the 19 hand-made templates in
 * docs/design/templates/templates.json (studio.test.ts keeps the two in step). The 40 new ones (inventory I-phase) add
 * here.
 */
import type { Reference } from "./deck.ts";

export const REFERENCES: readonly Reference[] = [
  { id: "skorja", template: "J", name: "Skorja", trades: ["bakery"] },
  { id: "jedilnik", template: "K", name: "Jedilnik", trades: ["restaurant"] },
  { id: "ogledalo", template: "L", name: "Ogledalo", trades: ["hairdresser"] },
  { id: "tablica", template: "M", name: "Tablica", trades: ["car-repair"] },
  { id: "markacija", template: "N", name: "Markacija", trades: ["tourist-farm"] },
  { id: "nasmeh", template: "O", name: "Nasmeh", trades: ["dental"] },
  { id: "pregib", template: "P", name: "Pregib", trades: ["physio"] },
  { id: "racun", template: "R", name: "Račun", trades: ["accountant"] },
  { id: "cevi", template: "S", name: "Cevi", trades: ["builder"] },
  { id: "etiketa", template: "T", name: "Etiketa", trades: ["shop"] },
  // The swim-school landing studies: none of our trades, shown across trades for their type and motion.
  { id: "globina", template: "A", name: "Globina", trades: [] },
  { id: "proge", template: "B", name: "Proge", trades: [] },
  { id: "val", template: "C", name: "Val", trades: [] },
  { id: "mirno", template: "D", name: "Mirno", trades: [] },
  { id: "gladina", template: "E", name: "Gladina", trades: [] },
  { id: "lido", template: "F", name: "Lido", trades: [] },
  { id: "crke", template: "G", name: "Črke", trades: [] },
  { id: "deska", template: "H", name: "Deska", trades: [] },
  { id: "popoldan", template: "I", name: "Popoldan", trades: [] },
];
