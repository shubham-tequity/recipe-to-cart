import Fuse from "fuse.js";
import type { Ingredient } from "@/lib/recipe/types";
import type { InstamartClient, Sku, CartItem } from "@/lib/instamart";

export type MatchConfidence = "high" | "medium" | "low";

export type MatchResult = {
  ingredient: Ingredient;
  best_match: Sku | null;
  alternatives: Sku[];
  /** Integer number of SKU units the user should add to cart. */
  quantity_ordered: number;
  confidence: MatchConfidence;
  /** Human-readable note on how the match was resolved. */
  note?: string;
};

/**
 * For each ingredient, ask the catalog for candidates, then fuzzy-pick the
 * best SKU and decide how many units of that pack to add.
 *
 * When we swap to the real Swiggy MCP, searchProducts is already the right
 * surface — this whole file is intentionally client-agnostic.
 */
export async function matchIngredientsToSkus(
  ingredients: Ingredient[],
  client: InstamartClient
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];

  for (const ing of ingredients) {
    // Search by canonical name first; fall back to original (often regional) name.
    const primary = await client.searchProducts(ing.name, { limit: 20 });
    const secondary =
      primary.length === 0 && ing.original_name !== ing.name
        ? await client.searchProducts(ing.original_name, { limit: 20 })
        : [];
    const candidates = primary.length > 0 ? primary : secondary;

    if (candidates.length === 0) {
      results.push({
        ingredient: ing,
        best_match: null,
        alternatives: [],
        quantity_ordered: 0,
        confidence: "low",
        note: "No matching SKU in catalog.",
      });
      continue;
    }

    const fuse = new Fuse(candidates, {
      keys: ["name", "brand", "aliases"],
      threshold: 0.4,
      includeScore: true,
    });
    const scored = fuse.search(ing.name);
    const best =
      scored[0]?.item ?? candidates[0];
    const alternatives = scored
      .slice(1, 4)
      .map((r) => r.item)
      .filter((s) => s.id !== best.id);

    const { qty, confidence, note } = resolveQuantity(ing, best);
    results.push({
      ingredient: ing,
      best_match: best,
      alternatives,
      quantity_ordered: qty,
      confidence,
      note,
    });
  }

  return results;
}

export function matchResultsToCartItems(results: MatchResult[]): CartItem[] {
  return results
    .filter(
      (r): r is MatchResult & { best_match: Sku } =>
        r.best_match !== null && r.quantity_ordered > 0
    )
    .map((r) => ({
      sku_id: r.best_match.id,
      quantity: r.quantity_ordered,
    }));
}

function resolveQuantity(
  ing: Ingredient,
  sku: Sku
): { qty: number; confidence: MatchConfidence; note?: string } {
  if (ing.quantity == null || ing.unit === "to_taste") {
    return { qty: 1, confidence: "medium", note: "To-taste item; 1 pack is enough." };
  }

  // Piece/handful/pinch against a gram/ml SKU almost never needs multiple packs.
  // The "100g per piece" heuristic blows up small leaf/spice items into absurd
  // pack counts (5 basil leaves → 25 packs of bay leaves). Default to one pack
  // and let the user override if they need more.
  const smallCountUnit =
    ing.unit === "piece" ||
    ing.unit === "whole" ||
    ing.unit === "handful" ||
    ing.unit === "pinch";
  if (smallCountUnit && (sku.pack_unit === "g" || sku.pack_unit === "ml")) {
    return { qty: 1, confidence: "medium", note: "Small-count item; 1 pack is enough." };
  }

  const needed = convertToBase(ing.quantity, ing.unit);
  if (needed == null) {
    return { qty: 1, confidence: "low", note: "Unit could not be normalized; defaulting to 1 pack." };
  }

  if (sku.pack_unit === "piece" || sku.pack_unit === "bunch" || sku.pack_unit === "dozen") {
    if (ing.unit === "piece" || ing.unit === "whole") {
      return { qty: Math.max(1, Math.ceil(ing.quantity)), confidence: "high" };
    }
    return { qty: 1, confidence: "medium", note: "Piece-based SKU; adding 1." };
  }

  // sku.pack_unit is 'g' or 'ml' — pack-size rounding.
  const units = Math.max(1, Math.ceil(needed / sku.pack_size));

  // Sanity cap: more than 5 packs almost always means the match is semantic-mismatched
  // or the unit conversion is wrong (e.g. recipe asked for 2 tsp, not 2 cups). Cap at 2.
  if (units > 5) {
    return {
      qty: 2,
      confidence: "low",
      note: `Conversion yielded ${units} packs — capped at 2 to avoid over-ordering.`,
    };
  }

  return { qty: units, confidence: "high" };
}

/**
 * Convert (quantity, unit) into grams-or-millilitres for pack-size math.
 * Deliberately conservative: approximations for volume→mass (cup, tbsp, tsp)
 * are close enough for shopping decisions, not cooking chemistry.
 */
function convertToBase(quantity: number, unit: Ingredient["unit"]): number | null {
  switch (unit) {
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "ml":
      return quantity;
    case "l":
      return quantity * 1000;
    case "tsp":
      return quantity * 5;
    case "tbsp":
      return quantity * 15;
    case "cup":
      return quantity * 240;
    case "piece":
    case "whole":
      return quantity * 100; // rough per-piece estimate; piece-SKU branch short-circuits this
    case "handful":
      return 30;
    case "pinch":
      return 1;
    case "to_taste":
      return null;
  }
}
