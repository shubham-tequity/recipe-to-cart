import { z } from "zod";

export const categorySchema = z.enum([
  "staples",
  "flours",
  "pulses",
  "spices",
  "oils",
  "dairy",
  "vegetables",
  "fruits",
  "condiments",
  "dry-goods",
  "beverages",
  "frozen",
  "bakery",
  "snacks",
  "other",
]);
export type Category = z.infer<typeof categorySchema>;

export const packUnitSchema = z.enum(["g", "ml", "piece", "bunch", "dozen"]);
export type PackUnit = z.infer<typeof packUnitSchema>;

export const skuSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  category: categorySchema,
  pack_size: z.number().positive(),
  pack_unit: packUnitSchema,
  mrp: z.number().positive(),
  is_veg: z.boolean(),
  aliases: z.array(z.string()).default([]),
  image_url: z.string().url().optional(),
});
export type Sku = z.infer<typeof skuSchema>;

export const cartItemSchema = z.object({
  sku_id: z.string(),
  quantity: z.number().int().positive(),
});
export type CartItem = z.infer<typeof cartItemSchema>;

export const cartSchema = z.object({
  items: z.array(cartItemSchema),
  subtotal: z.number().nonnegative(),
});
export type Cart = z.infer<typeof cartSchema>;
