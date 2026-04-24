import type { Sku, CartItem, Cart } from "./types";

/**
 * Abstract client for Instamart catalog + cart operations.
 *
 * Prototype: MockInstamartClient reads a local catalog.json.
 * Production (pending Swiggy Builders Club MCP access): SwiggyMcpInstamartClient
 * will implement the same interface, backed by MCP tool calls —
 * search_products, get_cart, update_cart, checkout, track_order, get_orders.
 *
 * Keep this surface narrow. Anything that leaks "mock vs real" details
 * into callers belongs in an implementation, not the interface.
 */
export interface InstamartClient {
  /** Free-text search over the product catalog. */
  searchProducts(query: string, opts?: { limit?: number }): Promise<Sku[]>;

  /** Fetch a single SKU by id. Returns null if unknown. */
  getProduct(skuId: string): Promise<Sku | null>;

  /** Price and validate a list of cart items. Mock has no server-side cart state. */
  buildCart(items: CartItem[]): Promise<Cart>;
}
