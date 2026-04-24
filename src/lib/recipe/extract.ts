import { generateObject } from "ai";
import { recipeSchema, type Recipe } from "./types";
import type { ScrapedRecipe } from "./scrape";

/**
 * Default model for extraction.
 * Haiku 4.5 handles structured extraction and Hinglish translation reliably
 * at ~1/15th Sonnet's cost — right trade-off for the prototype.
 *
 * Override per-call via `extractIngredients(scraped, { model: "openai/gpt-4.1" })`.
 */
export const DEFAULT_EXTRACTION_MODEL = "anthropic/claude-haiku-4-5";

const SYSTEM_PROMPT = `You extract grocery shopping lists from Indian recipes.

For every ingredient, return:
- name: canonical English name. If the recipe uses a regional term (haldi, dhania, jeera, methi, hing, ajwain, rai, kalonji, saunf, kasuri methi, lauki, karela, tinda, tur/arhar dal, chana dal, moong dal, urad dal, besan, atta, maida, sooji, poha, ghee, paneer, dahi, curd), translate it:
  haldi → turmeric powder
  dhania → coriander
  jeera → cumin seeds
  methi → fenugreek seeds (or leaves — use context)
  hing → asafoetida
  rai → mustard seeds
  kalonji → nigella seeds
  saunf → fennel seeds
  kasuri methi → dried fenugreek leaves
  besan → gram flour
  atta → whole wheat flour
  maida → refined flour
  sooji → semolina
  dahi → yogurt
- original_name: the term as it appeared in the recipe. Preserve regional names here.
- quantity: numeric. If the recipe says "to taste" or "as needed", use null and unit="to_taste".
- unit: one of g, kg, ml, l, tsp, tbsp, cup, piece, pinch, handful, to_taste, whole. Map "a handful" → handful, "½ cup" → cup (quantity=0.5), "2 onions" → piece (quantity=2), "1 inch ginger" → piece (quantity=1).
- notes: short, only if informative ("finely chopped", "soaked overnight"). Omit otherwise.
- optional: true only when explicitly marked optional, garnish, or "if available".

Ignore: water (unless it's a key ingredient), equipment, cooking steps, nutrition facts, tips, comments, ads, related-recipe links.

If the recipe has a target serving count and the user has requested different servings, scale every quantity proportionally.

Return ONLY the structured output.`;

type ExtractOptions = {
  servings?: number;
  model?: string;
};

export async function extractIngredients(
  scraped: ScrapedRecipe,
  opts: ExtractOptions = {}
): Promise<Recipe> {
  const model = opts.model ?? DEFAULT_EXTRACTION_MODEL;

  const servingsLine = scraped.servings
    ? `Original servings in recipe: ${scraped.servings}.`
    : "Original servings not specified.";
  const targetLine = opts.servings
    ? `Target servings requested by user: ${opts.servings}. Scale quantities linearly from original.`
    : "";

  const { object } = await generateObject({
    model,
    schema: recipeSchema,
    system: SYSTEM_PROMPT,
    prompt: `Recipe title: ${scraped.title}
Source: ${scraped.source_url}
${servingsLine}
${targetLine}

Recipe content:
"""
${scraped.content}
"""`,
  });

  return {
    ...object,
    source_url: scraped.source_url,
    title: object.title || scraped.title,
  };
}
