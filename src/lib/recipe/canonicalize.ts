import type { Ingredient } from "./types";

/**
 * Deterministic normalization applied to LLM-extracted ingredient names.
 *
 * The prompt tells the LLM not to prefix "fresh" onto processed forms
 * (paste / powder / sauce / puree / chutney / achar). The LLM mostly obeys,
 * but not reliably. This post-processing is the safety net — anything that
 * slips through gets fixed before matching so the catalog search sees a
 * clean query.
 */
const STRIP_FRESH_PREFIX =
  /^fresh\s+(.+\s+(paste|powder|sauce|puree|chutney|achar|ketchup))$/i;

export function canonicalizeIngredient(ing: Ingredient): Ingredient {
  const stripped = ing.name.trim().match(STRIP_FRESH_PREFIX);
  if (stripped) {
    return { ...ing, name: stripped[1] };
  }
  return ing;
}
