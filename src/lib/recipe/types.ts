import { z } from "zod";

/**
 * Canonical unit list for ingredient quantities.
 * Extraction prompts map any source-language unit into this set.
 */
export const unitSchema = z.enum([
  "g",
  "kg",
  "ml",
  "l",
  "tsp",
  "tbsp",
  "cup",
  "piece",
  "pinch",
  "handful",
  "to_taste",
  "whole",
]);
export type Unit = z.infer<typeof unitSchema>;

export const ingredientSchema = z.object({
  name: z
    .string()
    .describe(
      "Canonical English name — e.g. 'turmeric powder' for 'haldi', 'cumin seeds' for 'jeera'."
    ),
  original_name: z
    .string()
    .describe("Name exactly as it appears in the recipe. Preserve regional names here."),
  quantity: z
    .number()
    .nullable()
    .describe("Numeric quantity. Use null for 'to taste' or when unspecified."),
  unit: unitSchema.describe(
    "Unit from the canonical list. Convert e.g. 'a tablespoon' → 'tbsp', '½ cup' → cup with quantity=0.5."
  ),
  notes: z
    .string()
    .optional()
    .describe("Short prep note like 'finely chopped' or 'soaked overnight'. Omit if uninformative."),
  optional: z
    .boolean()
    .default(false)
    .describe("true only if the recipe explicitly marks the ingredient as optional or garnish."),
});
export type Ingredient = z.infer<typeof ingredientSchema>;

export const recipeSchema = z.object({
  title: z.string(),
  source_url: z.string().url(),
  servings: z.number().int().positive().nullable(),
  ingredients: z.array(ingredientSchema),
});
export type Recipe = z.infer<typeof recipeSchema>;
