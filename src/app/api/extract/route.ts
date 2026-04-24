import { NextResponse } from "next/server";
import { z } from "zod";
import { scrapeRecipe } from "@/lib/recipe/scrape";
import { extractIngredients } from "@/lib/recipe/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
  servings: z.number().int().positive().max(50).optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const scraped = await scrapeRecipe(body.url);
    const recipe = await extractIngredients(scraped, { servings: body.servings });
    return NextResponse.json({ recipe });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
