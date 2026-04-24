import type { Ingredient } from "./types";

/**
 * Drop LLM-extracted ingredients that aren't actually shoppable.
 *
 * The system prompt asks the LLM to skip water, but it still sometimes keeps
 * "hot water 2 cups" because the quantity feels substantive. This is the
 * deterministic safety net — cooking liquids and ice get stripped here,
 * regardless of what the LLM decided.
 *
 * Preserved: "coconut water", "rose water", "tamarind water" — these ARE
 * distinct shoppable products.
 */
const NON_SHOPPABLE_PATTERNS: RegExp[] = [
  /^\s*(hot|cold|warm|boiling|boiled|iced?|lukewarm|room[\s-]?temperature|plain|drinking|tap|filtered)?\s*water\s*$/i,
  /^\s*ice(\s+cubes?)?\s*$/i,
];

export function filterNonShoppable(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.filter(
    (ing) => !NON_SHOPPABLE_PATTERNS.some((rx) => rx.test(ing.name))
  );
}
