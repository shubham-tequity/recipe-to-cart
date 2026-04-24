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
    return { qty: 1, confidence: "medium", note: "To-taste item; defaulting to 1 pack." };
  }

  const needed = convertToBase(ing.quantity, ing.unit);
  if (needed == null) {
    return { qty: 1, confidence: "low", note: "Unit could not be normalized; defaulting to 1 pack." };
  }

  if (sku.pack_unit === "piece" || sku.pack_unit === "bunch" || sku.pack_unit === "dozen") {
    // Piece-based SKUs don't convert cleanly from g/ml; treat quantity as piece count when available.
    if (ing.unit === "piece" || ing.unit === "whole") {
      return { qty: Math.max(1, Math.ceil(ing.quantity)), confidence: "high" };
    }
    return { qty: 1, confidence: "medium", note: "Piece-based SKU; adding 1." };
  }

  // sku.pack_unit is 'g' or 'ml' — do pack-size rounding.
  const units = Math.max(1, Math.ceil(needed / sku.pack_size));
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
