import type { Ingredient } from "@/lib/recipe/types";
import type { InstamartClient, Sku, CartItem } from "@/lib/instamart";
import { tokenize } from "@/lib/text/tokenize";

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
 * For each ingredient, ask the catalog for candidates and pick the first one
 * (the client returns results already ranked by relevance — primary-noun
 * tiebroken for the mock, embedding/BM25 for the real MCP). Then decide how
 * many units of that pack to add.
 *
 * We don't re-rank with Fuse here anymore — fuzzy re-ranking of a ranker's
 * output was demoting correct matches like "Saffola Soyabean Oil" in favor
 * of "Vegetable Spring Rolls" whenever one modifier word appeared earlier
 * in a wrong SKU's name.
 */
export async function matchIngredientsToSkus(
  ingredients: Ingredient[],
  client: InstamartClient
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];

  for (const ing of ingredients) {
    // Search by canonical name first; fall back to original (often regional) name.
    const primary = await client.searchProducts(ing.name, { limit: 5 });
    const secondary =
      primary.length === 0 && ing.original_name !== ing.name
        ? await client.searchProducts(ing.original_name, { limit: 5 })
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

    const best = candidates[0];
    const alternatives = candidates.slice(1, 4);

    const nameConf = computeNameConfidence(ing.name, best);
    const { qty, confidence: qtyConf, note } = resolveQuantity(ing, best);

    // Overall confidence is the weaker of "is this the right product" and
    // "will the user get the right amount". A great name match with a shaky
    // pack conversion is still only medium; a perfect quantity on the wrong
    // product is low.
    const confidence = weakerOf(nameConf, qtyConf);

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

/**
 * Name-match confidence from shared-token overlap between query and SKU text.
 *
 * Thresholds scale with query length so a single-word query like "oil" can
 * still earn "high" — otherwise any one-word ingredient would be permanently
 * stuck at medium.
 */
function computeNameConfidence(queryName: string, sku: Sku): MatchConfidence {
  const qTokens = new Set(tokenize(queryName));
  const sTokens = new Set(
    tokenize(`${sku.name} ${sku.brand} ${sku.aliases.join(" ")}`)
  );

  let overlap = 0;
  for (const t of qTokens) if (sTokens.has(t)) overlap++;

  const required = Math.min(qTokens.size, 2);
  if (qTokens.size === 0) return "low";
  if (overlap >= required) return "high";
  if (overlap >= 1) return "medium";
  return "low";
}

function weakerOf(a: MatchConfidence, b: MatchConfidence): MatchConfidence {
  const rank: Record<MatchConfidence, number> = { low: 0, medium: 1, high: 2 };
  return rank[a] < rank[b] ? a : b;
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
