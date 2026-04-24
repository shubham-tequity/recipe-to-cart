import { NextResponse } from "next/server";
import { z } from "zod";
import { ingredientSchema } from "@/lib/recipe/types";
import { matchIngredientsToSkus } from "@/lib/matching/match";
import { getInstamartClient } from "@/lib/instamart";

export const runtime = "nodejs";

const bodySchema = z.object({
  ingredients: z.array(ingredientSchema),
});

export async function POST(req: Request) {
  try {
    const { ingredients } = bodySchema.parse(await req.json());
    const client = getInstamartClient();
    const matches = await matchIngredientsToSkus(ingredients, client);
    return NextResponse.json({ matches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
