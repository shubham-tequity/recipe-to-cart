import catalogData from "./catalog.json";
import { skuSchema, cartSchema, type Sku, type CartItem, type Cart } from "./types";
import type { InstamartClient } from "./client";

const CATALOG: Sku[] = (catalogData as unknown[]).map((entry) => skuSchema.parse(entry));

// Pre-compute a normalized token set per SKU so search doesn't redo the work.
const SKU_TOKENS = new WeakMap<Sku, Set<string>>();

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      // British → US spelling we see in recipes
      .replace(/chilli(es)?/g, "chili")
      .replace(/pulses/g, "pulse")
      // Strip punctuation (commas, parens, slashes, etc.)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      // Crude singularization: drop trailing 's' on 4+ char words (tomatoes → tomatoe? close enough for set membership)
      .map((w) => (w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w))
  );
}

function skuTokenSet(sku: Sku): Set<string> {
  let cached = SKU_TOKENS.get(sku);
  if (cached) return cached;
  const text = [sku.name, sku.brand, ...sku.aliases].join(" ");
  cached = new Set(tokenize(text));
  SKU_TOKENS.set(sku, cached);
  return cached;
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
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return CATALOG.slice(0, limit);

    // Rank SKUs by how many query tokens appear as whole words in the SKU text.
    // Word-boundary matching prevents "salt" from matching "salted pistachios".
    const scored: { sku: Sku; score: number }[] = [];
    for (const sku of CATALOG) {
      const skuTokens = skuTokenSet(sku);
      let score = 0;
      for (const t of qTokens) {
        if (skuTokens.has(t)) score++;
      }
      if (score > 0) scored.push({ sku, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.sku);
  }

  async getProduct(skuId: string): Promise<Sku | null> {
    return CATALOG.find((s) => s.id === skuId) ?? null;
  }

  async buildCart(items: CartItem[]): Promise<Cart> {
    let subtotal = 0;
    const validated: CartItem[] = [];

    for (const item of items) {
      const sku = CATALOG.find((s) => s.id === item.sku_id);
      if (!sku) continue;
      subtotal += sku.mrp * item.quantity;
      validated.push(item);
    }

    return cartSchema.parse({ items: validated, subtotal });
  }
}
