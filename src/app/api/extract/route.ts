import { NextResponse } from "next/server";
import { z } from "zod";
import { scrapeRecipe } from "@/lib/recipe/scrape";
import { extractIngredients } from "@/lib/recipe/extract";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
  servings: z.number().int().positive().max(50).optional(),
});

// 10 extractions per hour per IP — each call costs ~$0.005 via the AI Gateway.
const RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = checkRateLimit(`extract:${ip}`, RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "rate_limit",
        message: "You've hit the demo limit.",
        retryAfter: rl.retryAfterSeconds,
        resetsAt: rl.resetsAt,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const scraped = await scrapeRecipe(body.url);
    const recipe = await extractIngredients(scraped, { servings: body.servings });
    return NextResponse.json({ recipe });
  } catch (err) {
    console.error("[api/extract] failed for", body.url, ":", err);
    const message =
      err instanceof Error ? err.message : "Something went wrong processing the recipe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
