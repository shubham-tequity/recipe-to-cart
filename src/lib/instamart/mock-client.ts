import catalogData from "./catalog.json";
import { skuSchema, cartSchema, type Sku, type CartItem, type Cart } from "./types";
import type { InstamartClient } from "./client";

const CATALOG: Sku[] = (catalogData as unknown[]).map((entry) => skuSchema.parse(entry));

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
    const q = query.trim().toLowerCase();
    if (!q) return CATALOG.slice(0, limit);

    const matches = CATALOG.filter((sku) => {
      if (sku.name.toLowerCase().includes(q)) return true;
      if (sku.brand.toLowerCase().includes(q)) return true;
      if (sku.aliases.some((a) => a.toLowerCase().includes(q))) return true;
      return false;
    });

    return matches.slice(0, limit);
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
