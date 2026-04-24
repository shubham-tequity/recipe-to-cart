/**
 * scripts/generate-catalog.ts
 *
 * One-shot generator for the mock Instamart catalog.
 * Calls the LLM once per category with tight prompts, validates every
 * item against skuSchema, dedupes, and writes the result to
 * src/lib/instamart/catalog.json.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/generate-catalog.ts
 *
 * This file is a build artifact — it does not ship to the runtime.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateObject } from "ai";
import { z } from "zod";
import {
  packUnitSchema,
  skuSchema,
  type Category,
  type Sku,
} from "../src/lib/instamart/types.js";

const MODEL = "anthropic/claude-haiku-4-5";

// Shape the LLM produces. Missing here (vs full Sku): `id` — we generate it programmatically.
const draftSkuSchema = z.object({
  name: z.string(),
  brand: z.string(),
  pack_size: z.number().positive(),
  pack_unit: packUnitSchema,
  mrp: z.number().positive(),
  is_veg: z.boolean(),
  aliases: z.array(z.string()).default([]),
});
type DraftSku = z.infer<typeof draftSkuSchema>;

type CategorySpec = {
  category: Category;
  count: number;
  brand_hints: string;
  example_items: string;
  pack_size_hint: string;
};

const SPECS: CategorySpec[] = [
  {
    category: "staples",
    count: 15,
    brand_hints: "India Gate, Daawat, Kohinoor, Fortune, Tata Salt, Aashirvaad, Madhur, Dhampure",
    example_items:
      "basmati rice (1kg and 5kg variants), sona masoori rice, idli rice, salt (iodized, rock, black), sugar (white, brown), jaggery, rice flakes (poha), vermicelli, sabudana",
    pack_size_hint: "rice: 1000g/5000g, salt: 1000g, sugar: 1000g, poha/sabudana: 500g",
  },
  {
    category: "flours",
    count: 12,
    brand_hints: "Aashirvaad, Pillsbury, Fortune, Tata Sampann, 24 Mantra",
    example_items:
      "atta (whole wheat), maida (refined), besan (gram flour), sooji (semolina, coarse+fine), ragi flour, bajra flour, jowar flour, rice flour, multigrain atta",
    pack_size_hint: "atta/maida: 1000g or 5000g, besan/sooji/specialty flours: 500g or 1000g",
  },
  {
    category: "pulses",
    count: 20,
    brand_hints: "Tata Sampann, Fortune, 24 Mantra, Patanjali",
    example_items:
      "toor/arhar dal, moong dal (whole green, split yellow, split green with skin), chana dal, kabuli chana, kala chana, urad dal (whole black, split white, split black), masoor dal (whole pink, split red), rajma (red, chitra, kashmiri), lobia, green peas dry",
    pack_size_hint: "500g or 1000g packs, both common",
  },
  {
    category: "spices",
    count: 35,
    brand_hints: "MDH, Everest, Catch, Tata Sampann, Aashirvaad, Ramdev",
    example_items:
      "turmeric powder, red chili powder (kashmiri, regular), coriander powder, cumin seeds (whole), cumin powder, black pepper (whole, powder), cardamom (green, black), cloves, cinnamon sticks, bay leaves, mustard seeds, fenugreek seeds, fennel seeds, asafoetida (hing), nigella seeds (kalonji), carom seeds (ajwain), dry mango powder (amchur), chaat masala, garam masala, sambar powder, rasam powder, biryani masala, chicken masala, meat masala, pav bhaji masala, kitchen king, chana masala, tandoori masala, dried red chilies",
    pack_size_hint: "100g for most ground spices, 50g for premium like cardamom/cloves, 200g+ for whole cumin/coriander",
  },
  {
    category: "oils",
    count: 10,
    brand_hints: "Fortune, Saffola, Dhara, Sundrop, Figaro, Borges, Parachute, Nutriorg, Amul, Mother Dairy",
    example_items:
      "refined sunflower oil, refined soyabean oil, mustard oil (kacchi ghani), rice bran oil, groundnut oil, olive oil (extra virgin, pomace), virgin coconut oil, desi ghee (cow/buffalo), vanaspati",
    pack_size_hint: "500ml/1L/2L for cooking oils, 200ml for olive, 500g/1000g for ghee",
  },
  {
    category: "dairy",
    count: 18,
    brand_hints: "Amul, Mother Dairy, Heritage, Nestle a+, Milky Mist, Go, Britannia",
    example_items:
      "full cream milk, toned milk, double toned milk, A2 milk, buffalo milk, curd/dahi (pouch, cup), paneer (fresh, malai), butter (salted, unsalted), cheese slices, cheese cubes, processed cheese block, mozzarella, cream, khoya, fresh cream",
    pack_size_hint: "milk: 500ml/1L, curd: 400g cups, paneer: 200g, butter: 100g/500g, cheese: 200g",
  },
  {
    category: "vegetables",
    count: 25,
    brand_hints: "Fresh Produce (bulk), or branded like Vibrant Earth, Freshon, Leafy",
    example_items:
      "onion, tomato, potato, ginger, garlic, green chili, red chili (fresh), coriander leaves, mint leaves, curry leaves, spinach, methi/fenugreek leaves, cauliflower, cabbage, ladyfinger/okra, brinjal/eggplant, bottle gourd (lauki), bitter gourd (karela), ridge gourd (turai), pumpkin, capsicum (green/red/yellow), carrot, beetroot, radish, corn on cob, french beans, cucumber, drumstick, spring onion",
    pack_size_hint: "onion/potato: 1000g, ginger/garlic: 200g, leafy greens: 250g/bunch, chilies/corianders: 100g/bunch",
  },
  {
    category: "fruits",
    count: 10,
    brand_hints: "Fresh Produce, Freshon",
    example_items:
      "lemon, banana (regular yellow, robusta), apple (shimla, washington), mango (seasonal — alphonso, kesar, dasheri), pineapple, orange, pomegranate, papaya, guava, watermelon, coconut (dry whole, fresh)",
    pack_size_hint: "lemon/banana: 500g, apples: 1000g, seasonal fruits: 1000g, coconut: 1 piece",
  },
  {
    category: "condiments",
    count: 15,
    brand_hints: "Kissan, Maggi, Del Monte, Cremica, Fun Foods, Veeba, Wingreens Farms, Priya, Mother's Recipe, Patanjali",
    example_items:
      "tomato ketchup, green chili sauce, red chili sauce, schezwan sauce, soy sauce, vinegar, mayonnaise (veg/egg), mustard sauce, mango achar, lime achar, mixed achar, garlic achar, tamarind paste, mint chutney, coriander chutney, instant ready-to-cook gravies",
    pack_size_hint: "ketchup: 200g/500g/1kg, sauces: 200g/500g, achar: 400g/1kg, chutneys: 200g",
  },
  {
    category: "dry-goods",
    count: 12,
    brand_hints: "Happilo, Nutraj, True Elements, Farmley, Tata Sampann, Wonderland",
    example_items:
      "almonds (California, Mamra), cashews (whole, broken), raisins (green, black), walnut kernels, pistachios (salted, unsalted), dates (kimia, medjool, deglet noor), figs (anjeer), apricots, dry coconut, peanuts (raw, roasted), sesame seeds (white, black), flax seeds, chia seeds, pumpkin seeds, sunflower seeds, poppy seeds (khus khus)",
    pack_size_hint: "nuts: 200g/500g, seeds: 100g/200g",
  },
  {
    category: "beverages",
    count: 8,
    brand_hints: "Tata Tea, Brooke Bond (Red Label, Taj Mahal, 3 Roses), Society, Wagh Bakri, Nescafe, Bru, Horlicks, Bournvita, Complan, Coca-Cola, Pepsi, Sprite, Frooti, Maaza, Real, Tropicana",
    example_items:
      "black tea (CTC, leaf), green tea, masala chai, assam tea, instant coffee (classic, sunrise), filter coffee, hot chocolate, malt drinks, packaged juices, soft drinks",
    pack_size_hint: "tea: 250g/500g/1kg, coffee: 50g/100g/200g, juices/drinks: 1L/2L",
  },
  {
    category: "frozen",
    count: 8,
    brand_hints: "Safal, McCain, ID, iD Fresh, Kawan, Sumeru, Godrej Yummiez, ITC Master Chef",
    example_items:
      "green peas, mixed veg, sweet corn, paratha (aloo, plain, malabar), french fries, potato smileys, hash browns, spring rolls, samosas, momos, kebabs, nuggets, tikki, parotta",
    pack_size_hint: "veg: 500g/1000g, snacks/breads: 400g/500g packs",
  },
  {
    category: "bakery",
    count: 5,
    brand_hints: "Britannia, Modern, Bonn, Harvest Gold, English Oven",
    example_items:
      "white bread, brown bread, multigrain bread, whole wheat bread, pav, burger buns, hot dog buns, rusks (plain, elaichi), khari, atta bread",
    pack_size_hint: "bread: 400g/800g loaves, pav/buns: 300g pack of 6",
  },
  {
    category: "snacks",
    count: 5,
    brand_hints: "Haldiram's, Bikaji, Lays, Kurkure, Parle, Britannia, Sunfeast, Good Day",
    example_items:
      "classic namkeen (aloo bhujia, moong dal, mixture), chips, extruded snacks, biscuits (Parle-G, Marie, Bourbon, Good Day), cream biscuits, cookies",
    pack_size_hint: "namkeen: 200g/400g, chips: 52g/90g/180g, biscuits: 200g/300g",
  },
];

async function generateCategory(spec: CategorySpec): Promise<DraftSku[]> {
  const { object } = await generateObject({
    model: MODEL,
    schema: z.object({ items: z.array(draftSkuSchema) }),
    system: `You are generating realistic SKUs for an Indian online grocery catalog (Swiggy Instamart style).

Hard rules:
- Use real, well-known Indian grocery brands. Never invent brand names.
- Use pack sizes that match how Indian retailers actually sell the product.
- MRP is in INR (whole rupees, no decimals). Be approximately correct — slightly off is fine, wildly wrong is not.
- is_veg: most groceries are true. Eggs, meat, fish are false.
- aliases: include 2-4 regional names, Hinglish spellings, or common alternate names. For spices include Hindi and one South Indian name if widely used. Empty array if genuinely no aliases exist.
- No duplicates across pack sizes — pick the single most common pack size per product.

Return the requested count exactly.`,
    prompt: `Generate ${spec.count} SKUs for the category "${spec.category}".

Brands to draw from (use these, don't invent): ${spec.brand_hints}

Example product types (cover a diverse spread, not necessarily all of these):
${spec.example_items}

Typical pack sizes: ${spec.pack_size_hint}`,
  });

  return object.items;
}

function makeId(category: Category, draft: DraftSku, index: number): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `${slug(category)}-${slug(draft.brand)}-${slug(draft.name)}-${draft.pack_size}${draft.pack_unit}-${index}`;
}

async function main() {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set. Run with: npx tsx --env-file=.env.local scripts/generate-catalog.ts"
    );
  }

  console.log(`Generating catalog across ${SPECS.length} categories...`);
  const all: Sku[] = [];
  const seen = new Set<string>();

  for (const spec of SPECS) {
    process.stdout.write(`  ${spec.category.padEnd(14)} (${spec.count} items)... `);
    const start = Date.now();
    try {
      const drafts = await generateCategory(spec);
      let added = 0;
      drafts.forEach((draft, i) => {
        const key = `${spec.category}|${draft.brand.toLowerCase()}|${draft.name.toLowerCase()}|${draft.pack_size}${draft.pack_unit}`;
        if (seen.has(key)) return;
        seen.add(key);

        const sku: Sku = skuSchema.parse({
          id: makeId(spec.category, draft, i),
          category: spec.category,
          ...draft,
        });
        all.push(sku);
        added++;
      });
      console.log(`${added} ok (${Date.now() - start}ms)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`failed: ${msg}`);
    }
  }

  const outPath = join(process.cwd(), "src/lib/instamart/catalog.json");
  writeFileSync(outPath, JSON.stringify(all, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${all.length} SKUs to ${outPath}`);

  const byCategory = all.reduce<Record<string, number>>((acc, sku) => {
    acc[sku.category] = (acc[sku.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\nBy category:");
  for (const [cat, n] of Object.entries(byCategory).sort()) {
    console.log(`  ${cat.padEnd(14)} ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
