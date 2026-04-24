import { unitSchema, type Unit } from "./types";

/**
 * Recipes use plenty of units the LLM will happily hallucinate back at us
 * ("1 strand of mace", "2 blades of fenugreek", "a knob of ginger"). Those
 * aren't in the canonical enum, so Zod rejects the whole extraction — one
 * bad unit fails 30 good ingredients.
 *
 * This maps exotics into the closest canonical unit. When a recipe says
 * "1 strand", "1 blade", "1 stick", etc., we treat it as "1 piece" — which
 * the matcher already handles correctly (small-count-on-g-SKU = 1 pack).
 */
const UNIT_ALIASES: Record<string, Unit> = {
  // Count-like exotics → piece
  strand: "piece",
  strands: "piece",
  blade: "piece",
  blades: "piece",
  stick: "piece",
  sticks: "piece",
  stalk: "piece",
  stalks: "piece",
  sprig: "piece",
  sprigs: "piece",
  clove: "piece",
  cloves: "piece",
  sheet: "piece",
  sheets: "piece",
  leaf: "piece",
  leaves: "piece",
  bunch: "piece",
  bunches: "piece",
  knob: "piece",
  pod: "piece",
  pods: "piece",
  pack: "piece",
  packet: "piece",
  can: "piece",
  bottle: "piece",
  bar: "piece",
  slice: "piece",
  slices: "piece",
  // Tiny-amount exotics → pinch
  dash: "pinch",
  dashes: "pinch",
  // Common full-word canonical forms
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cups: "cup",
  pieces: "piece",
  pinches: "pinch",
  handfuls: "handful",
};

export function normalizeUnit(u: string): Unit {
  const lc = u.toLowerCase().trim();
  if (UNIT_ALIASES[lc]) return UNIT_ALIASES[lc];
  const parsed = unitSchema.safeParse(lc);
  if (parsed.success) return parsed.data;
  // Final fallback for truly unknown units. "piece" is the safest default
  // because the small-count-on-g-SKU rule in match.ts turns it into 1 pack.
  return "piece";
}
