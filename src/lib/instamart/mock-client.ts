import catalogData from "./catalog.json";
import { skuSchema, cartSchema, type Sku, type CartItem, type Cart } from "./types";
import type { InstamartClient } from "./client";
import { tokenize } from "@/lib/text/tokenize";

const CATALOG: Sku[] = (catalogData as unknown[]).map((entry) => skuSchema.parse(entry));

// Two token caches per SKU:
// - FULL covers name + brand + aliases. Used for scoring (aliases help
//   findability — "haldi" should find "Turmeric Powder").
// - NAME covers just the product name. Used for the extraneous-token
//   tiebreaker, where we want to measure "how many modifier words are on
//   this product's label" — aliases shouldn't penalize a well-aliased SKU.
const SKU_FULL_TOKENS = new WeakMap<Sku, Set<string>>();
const SKU_NAME_TOKENS = new WeakMap<Sku, Set<string>>();

function skuFullTokens(sku: Sku): Set<string> {
  let cached = SKU_FULL_TOKENS.get(sku);
  if (cached) return cached;
  cached = new Set(tokenize([sku.name, sku.brand, ...sku.aliases].join(" ")));
  SKU_FULL_TOKENS.set(sku, cached);
  return cached;
}

function skuNameTokens(sku: Sku): Set<string> {
  let cached = SKU_NAME_TOKENS.get(sku);
  if (cached) return cached;
  cached = new Set(tokenize(sku.name));
  SKU_NAME_TOKENS.set(sku, cached);
  return cached;
}

// Inverse-document-frequency weights, computed once.
//
// "fennel" appears in 1 SKU; "seed" and "powder" appear in many. When ranking
// "fennel seeds powder", we want the rare token to dominate — otherwise a SKU
// like "Pomegranate Seeds Powder" (matching seed + powder) can beat "Fennel
// Seeds" (matching fennel + seed) by sheer common-token weight.
//
// idf(t) = log(N / df(t)). Higher = rarer = more discriminative.
const DOC_FREQ: Map<string, number> = (() => {
  const freq = new Map<string, number>();
  for (const sku of CATALOG) {
    for (const t of skuFullTokens(sku)) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return freq;
})();
const N = CATALOG.length;

function idf(token: string): number {
  const df = DOC_FREQ.get(token) ?? N;
  return Math.log(N / df);
}

/**
 * MockInstamartClient — reads from catalog.json.
 *
 * Stand-in for the real Swiggy MCP client. Match the shape of the MCP tools
 * closely (searchProducts ≈ search_products, buildCart ≈ update_cart → get_cart)
 * so the swap later is mechanical.
 */
export class MockInstamartClient implements InstamartClient {
  async searchProducts(query: string, opts?: { limit?: number }): Promise<Sku[]> {
    const limit = opts?.limit ?? 10;
    const qTokenList = tokenize(query);
    if (qTokenList.length === 0) return CATALOG.slice(0, limit);

    // The last token of an English-language ingredient query is almost always
    // the head noun: "vegetable oil" → oil, "coriander powder" → powder,
    // "fresh coriander" → coriander. Candidates that contain the head noun
    // beat candidates that only share a modifier — this prevents
    // "vegetable oil" from landing on "Vegetable Spring Rolls".
    const primary = qTokenList[qTokenList.length - 1];
    const qTokens = new Set(qTokenList);

    // Rank SKUs by IDF-weighted overlap of query tokens in the SKU text.
    // Rare tokens ("fennel", "paneer") count more than common ones ("seed",
    // "powder"). Word-boundary matching via the tokenizer prevents "salt"
    // from matching "salted pistachios".
    const scored: {
      sku: Sku;
      score: number;
      hits: number;
      hasPrimary: boolean;
      extraneous: number;
    }[] = [];
    for (const sku of CATALOG) {
      const fullTokens = skuFullTokens(sku);
      let score = 0;
      let hits = 0;
      for (const t of qTokens) {
        if (fullTokens.has(t)) {
          score += idf(t);
          hits++;
        }
      }
      if (hits > 0) {
        // Tokens in the SKU *name* that weren't in the query — "modifier
        // noise" on the actual product label. Fewer is better: "Fresh Cream"
        // (one extra: "fresh") is tighter than "Full Cream Milk" (two
        // extras). Aliases are deliberately excluded — a SKU with many
        // useful aliases shouldn't be penalized for being well-aliased.
        const nameTokens = skuNameTokens(sku);
        let extraneous = 0;
        for (const t of nameTokens) {
          if (!qTokens.has(t)) extraneous++;
        }
        scored.push({ sku, score, hits, hasPrimary: fullTokens.has(primary), extraneous });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.hasPrimary !== b.hasPrimary) return a.hasPrimary ? -1 : 1;
      return a.extraneous - b.extraneous;
    });
    return scored.slice(0, limit).map((s) => s.sku);
  }

  async getProduct(skuId: string): Promise<Sku | null> {
    return CATALOG.find((s) => s.id === skuId) ?? null;
  }

  async buildCart(items: CartItem[]): Promise<Cart> {
    // Merge duplicate sku_ids first — two recipe ingredients can resolve to
    // the same SKU (e.g. "onion" + "small onion"), and the cart should show
    // one row with a summed quantity, not two.
    const merged = new Map<string, number>();
    for (const item of items) {
      merged.set(item.sku_id, (merged.get(item.sku_id) ?? 0) + item.quantity);
    }

    let subtotal = 0;
    const validated: CartItem[] = [];
    for (const [sku_id, quantity] of merged) {
      const sku = CATALOG.find((s) => s.id === sku_id);
      if (!sku) continue;
      subtotal += sku.mrp * quantity;
      validated.push({ sku_id, quantity });
    }

    return cartSchema.parse({ items: validated, subtotal });
  }
}
