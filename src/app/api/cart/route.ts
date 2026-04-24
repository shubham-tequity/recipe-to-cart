import { NextResponse } from "next/server";
import { z } from "zod";
import { getInstamartClient, cartItemSchema } from "@/lib/instamart";

export const runtime = "nodejs";

const bodySchema = z.object({
  items: z.array(cartItemSchema),
});

export async function POST(req: Request) {
  try {
    const { items } = bodySchema.parse(await req.json());
    const client = getInstamartClient();
    const cart = await client.buildCart(items);
    return NextResponse.json({ cart });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
