import { generateObject } from "ai";
import { z } from "zod";
import { recipeSchema, type Recipe } from "./types";
import { dedupeIngredients } from "./dedupe";
import { filterNonShoppable } from "./filter";
import { canonicalizeIngredient } from "./canonicalize";
import { normalizeUnit } from "./unit-normalize";
import type { ScrapedRecipe } from "./scrape";

/**
 * Permissive mirror of `recipeSchema` used only for the LLM's response.
 *
 * `unit` is a free string here instead of the strict enum. Models keep
 * inventing units — "strand" for mace, "blade" for fenugreek leaves, "knob"
 * for ginger — and a strict enum rejects the ENTIRE extraction when one
 * ingredient slips through. We accept anything here, then normalize each
 * unit before re-validating against the strict `recipeSchema`.
 */
const llmRecipeSchema = z.object({
  title: z.string(),
  source_url: z.string().url(),
  servings: z.number().int().positive().nullable(),
  ingredients: z.array(
    z.object({
      name: z.string(),
      original_name: z.string(),
      quantity: z.number().nullable(),
      unit: z.string(),
      notes: z.string().optional(),
      optional: z.boolean().default(false),
    })
  ),
});

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
- name: CANONICAL English shopping name — chosen so a grocery search engine can find the right product. This is the most important field. See DISAMBIGUATION RULES below.
- original_name: the bare source term — the ingredient noun as the recipe wrote it, in its original language/spelling. STRIP prep descriptors and parenthetical modifiers; those go in \`notes\`, not here. Examples:
    "onion, sliced" → original_name: "onion", notes: "sliced"
    "kasuri methi (crushed)" → original_name: "kasuri methi", notes: "crushed"
    "finely chopped coriander" → original_name: "coriander", notes: "finely chopped"
    "2 garlic cloves, minced" → original_name: "garlic", notes: "minced"
  If after stripping, original_name would be identical to the canonical \`name\`, set original_name equal to name (don't fabricate a different term).
- quantity: numeric. If the recipe says "to taste" or "as needed", use null and unit="to_taste".
- unit: MUST be EXACTLY one of: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, handful, to_taste, whole. No other strings are valid. Mapping for common exotics:
    "strand" / "blade" / "stick" / "stalk" / "sprig" / "sheet" / "leaf" / "knob" / "bunch" / "pod" / "pack" / "slice" / "clove" (the garlic kind) → unit: "piece"
    "dash" → unit: "pinch"
    "teaspoon(s)" / "tablespoon(s)" / "gram(s)" / "kilogram(s)" / "milliliter(s)" / "liter(s)" → their abbreviated canonical forms.
  Examples: "a handful" → handful, "½ cup" → cup (quantity=0.5), "2 onions" → piece (quantity=2), "1 inch ginger" → piece (quantity=1), "1 strand mace" → piece (quantity=1), "a knob of ginger" → piece (quantity=1).
- notes: short, only if informative ("finely chopped", "soaked overnight", "crushed"). This is where prep/state descriptors live. Omit if the recipe gives no prep detail.
- optional: true only when explicitly marked optional, garnish, or "if available".

HINGLISH / REGIONAL MAPPINGS:
  haldi → turmeric powder
  dhania → see coriander rules below
  jeera (whole) → cumin seeds
  jeera powder → cumin powder
  methi → see fenugreek rules below
  hing → asafoetida
  rai → mustard seeds
  kalonji → nigella seeds
  saunf → fennel seeds
  besan → gram flour
  atta → whole wheat flour
  maida → refined flour
  sooji → semolina
  dahi → yogurt
  magaz / watermelon seeds / melon seeds → melon seeds (NOT sesame seeds — those are til)
  til → sesame seeds

DISAMBIGUATION RULES (critical — a grocery search on the wrong phrasing returns the wrong product):

1. Oil: use "oil" alone for generic cooking oil. Specify a type ONLY when the recipe explicitly demands it: "olive oil", "coconut oil", "mustard oil", "sesame oil", "groundnut oil". NEVER output "vegetable oil" — it's ambiguous and catalogs have no SKU by that exact name.

2. Coriander / dhania — distinguish by form:
   - Fresh leaves (used as garnish, measured in tbsp/cup/handful, "chopped coriander", "finely chopped dhania", "fresh coriander") → name: "fresh coriander"
   - Ground spice ("coriander powder", "dhania powder") → name: "coriander powder"
   - Whole spice ("coriander seeds", "whole coriander") → name: "coriander seeds"
   Default when ambiguous AND the unit is tbsp/cup/handful AND no "powder" or "seed" qualifier is given: treat as fresh leaves.

3. Fenugreek / methi — distinguish three forms:
   - Whole spice ("methi seeds", "methi dana") → name: "fenugreek seeds"
   - Fresh leaves ("methi leaves", "fresh methi", "methi saag") → name: "fenugreek leaves"
   - Dried leaves ("kasuri methi", "dried methi") → name: "dried fenugreek leaves"

4. Chilli — distinguish:
   - Fresh green ("green chilli", "hari mirch", "chopped chilli") → name: "green chilli"
   - Fresh red ("red chilli", "lal mirch" — uncommon fresh) → name: "red chilli"
   - Dried ("dried red chilli", "sukhi lal mirch") → name: "dried red chilli"
   - Ground ("red chilli powder", "lal mirch powder") → name: "red chilli powder"
   - Chilli sauce is a condiment, NOT the spice — use sauce only if the recipe says so.

5. Herb rule of thumb: when the unit is tbsp/cup/handful and the item is a herb (coriander, mint, basil, methi, curry leaves), it is almost always FRESH, not dried/ground.

6. Compound processed forms — HARD RULE: if the recipe lists a paste / puree / sauce / chutney / masala blend as a SINGLE line item (one quantity, one unit), extract it as ONE ingredient. NEVER split it into component parts.
   - "1.5 tsp ginger garlic paste" → ONE ingredient, name: "ginger garlic paste", quantity: 1.5, unit: tsp.
     WRONG: two ingredients "fresh ginger 1.5 tsp" + "fresh garlic 1.5 tsp".
   - "2 tbsp tomato puree" → ONE ingredient, name: "tomato puree".
     WRONG: "tomato 2 tbsp".
   - "1 tbsp green chutney" → ONE ingredient, name: "green chutney".
   Do NOT add "fresh" to processed forms. The canonical name is the compound form verbatim.

7. Fresh-produce rule: OUTSIDE of the compound-forms rule above, plain ingredient names like "garlic" / "lehsun" or "ginger" / "adrak" in an Indian recipe almost always mean the FRESH form. Prefix with "fresh":
   - "garlic" / "lehsun" / "4 garlic cloves" → name: "fresh garlic"
   - "ginger" / "adrak" / "1 inch ginger" → name: "fresh ginger"
   This applies only when the recipe lists the raw ingredient on its own. If it's embedded in a paste / puree / sauce name, rule 6 wins.

EXCLUSIONS:
- Skip: plain water / hot water / cold water / boiling water (cooking liquids, not shoppable).
- Keep: "coconut water", "rose water", "tamarind water" — these are distinct products.
- Skip: equipment, cooking steps, nutrition facts, tips, comments, ads, related-recipe links.

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

  const { object: raw } = await generateObject({
    model,
    schema: llmRecipeSchema,
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

  // Normalize units (strand → piece, teaspoons → tsp, etc.), then re-validate
  // against the strict schema so everything downstream sees canonical units.
  const validated = recipeSchema.parse({
    ...raw,
    ingredients: raw.ingredients.map((ing) => ({
      ...ing,
      unit: normalizeUnit(ing.unit),
    })),
  });

  return {
    ...validated,
    source_url: scraped.source_url,
    title: validated.title || scraped.title,
    ingredients: dedupeIngredients(
      filterNonShoppable(validated.ingredients.map(canonicalizeIngredient))
    ),
  };
}
