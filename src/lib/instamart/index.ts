import type { InstamartClient } from "./client";
import { MockInstamartClient } from "./mock-client";

export type { InstamartClient } from "./client";
export {
  skuSchema,
  cartItemSchema,
  cartSchema,
  categorySchema,
  packUnitSchema,
} from "./types";
export type { Sku, CartItem, Cart, Category, PackUnit } from "./types";

/**
 * Resolve the active Instamart client.
 *
 * Until Swiggy Builders Club MCP access is granted, this always returns
 * the mock. After access, gate on env and return a SwiggyMcpInstamartClient.
 *
 *   if (process.env.USE_SWIGGY_MCP === "1") return new SwiggyMcpInstamartClient();
 */
export function getInstamartClient(): InstamartClient {
  return new MockInstamartClient();
}
