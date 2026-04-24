import type { Ingredient, Unit } from "./types";

// Rough gram-equivalents — same spirit as matching/convertToBase. Used only
// for picking the dominant entry when the LLM extracts the same ingredient
// twice in different units.
const BASE_GRAMS: Record<Exclude<Unit, "to_taste">, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  cup: 240,
  piece: 100,
  whole: 100,
  handful: 30,
  pinch: 1,
};

function baseWeight(ing: Ingredient): number {
  if (ing.unit === "to_taste" || ing.quantity == null) return -1;
  return BASE_GRAMS[ing.unit] * ing.quantity;
}

/**
 * Recipes list ingredients per step (marinade + curry + garnish), so the LLM
 * faithfully extracts the same ingredient multiple times. Collapse into one
 * entry per canonical name before display + matching.
 *
 * - Same unit across duplicates: sum quantities.
 * - Mixed units: keep the largest gram-equivalent; the rest are almost always
 *   trivial sprinkles (0.5 tsp kasuri methi on top, a tbsp of crumbled paneer)
 *   that don't change the shopping list.
 * - "to taste" alongside a quantified entry: drop the to_taste.
 */
export function dedupeIngredients(ingredients: Ingredient[]): Ingredient[] {
  const groups = new Map<string, Ingredient[]>();
  for (const ing of ingredients) {
    const key = ing.name.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) existing.push(ing);
    else groups.set(key, [ing]);
  }

  const out: Ingredient[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }

    const quantified = group.filter(
      (g) => g.unit !== "to_taste" && g.quantity != null
    );
    const pool = quantified.length > 0 ? quantified : group;

    const firstUnit = pool[0].unit;
    const sameUnit = pool.every((g) => g.unit === firstUnit);

    if (sameUnit && quantified.length > 0) {
      const total = pool.reduce((s, g) => s + (g.quantity ?? 0), 0);
      out.push({ ...pool[0], quantity: total });
      continue;
    }

    pool.sort((a, b) => baseWeight(b) - baseWeight(a));
    out.push(pool[0]);
  }

  return out;
}
