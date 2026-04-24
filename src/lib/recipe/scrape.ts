import * as cheerio from "cheerio";
import { YoutubeTranscript } from "youtube-transcript";

export type ScrapedRecipe = {
  title: string;
  source_url: string;
  content: string;
  source_type: "blog" | "youtube";
  servings: number | null;
};

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const MAX_CONTENT_CHARS = 15_000;

export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const parsed = new URL(url);
  if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    return scrapeYoutube(url);
  }
  return scrapeBlog(url);
}

async function scrapeBlog(url: string): Promise<ScrapedRecipe> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Recipe-to-Cart/0.1; +https://github.com/shubham-tequity/recipe-to-cart)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch recipe page (${res.status}).`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  let title = "";
  let servings: number | null = null;
  let structuredContent = "";

  // 1. Prefer schema.org Recipe JSON-LD (Hebbars, Archana's, most big blogs publish this).
  $('script[type="application/ld+json"]').each((_, el) => {
    if (structuredContent) return;
    try {
      const parsed = JSON.parse($(el).text());
      const recipe = findRecipeNode(parsed);
      if (!recipe) return;
      title = recipe.name ?? "";
      servings = parseServings(recipe.recipeYield);
      const ingredients = Array.isArray(recipe.recipeIngredient)
        ? recipe.recipeIngredient
        : [];
      if (ingredients.length > 0) {
        structuredContent = `INGREDIENTS:\n${ingredients.join("\n")}`;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  if (!title) {
    title =
      $('meta[property="og:title"]').attr("content") ??
      $("h1").first().text().trim() ??
      $("title").text().trim();
  }

  // 2. Fallback: strip chrome, pull visible text.
  let content = structuredContent;
  if (!content) {
    $(
      "script, style, nav, footer, header, aside, noscript, iframe, .comments, .comment, .menu, .navigation, .sidebar"
    ).remove();
    content = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CONTENT_CHARS);
  }

  return {
    title: title || "Untitled Recipe",
    source_url: url,
    content,
    source_type: "blog",
    servings,
  };
}

async function scrapeYoutube(url: string): Promise<ScrapedRecipe> {
  let transcript = "";
  try {
    const segments = await YoutubeTranscript.fetchTranscript(url);
    transcript = segments.map((s: { text: string }) => s.text).join(" ");
  } catch {
    throw new Error(
      "Could not fetch YouTube captions. The video may not have captions available. Try a different video or a blog link."
    );
  }

  let title = "YouTube Recipe";
  try {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (oembed.ok) {
      const data = (await oembed.json()) as { title?: string };
      if (data.title) title = data.title;
    }
  } catch {
    // non-fatal
  }

  return {
    title,
    source_url: url,
    content: transcript.slice(0, MAX_CONTENT_CHARS),
    source_type: "youtube",
    servings: null,
  };
}

type JsonLdNode = {
  "@type"?: string | string[];
  "@graph"?: unknown[];
  name?: string;
  recipeYield?: unknown;
  recipeIngredient?: string[];
  [k: string]: unknown;
};

function findRecipeNode(data: unknown): JsonLdNode | null {
  let found: JsonLdNode | null = null;
  const visit = (node: unknown) => {
    if (found || !node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as JsonLdNode;
    const type = obj["@type"];
    const isRecipe =
      type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
    if (isRecipe) {
      found = obj;
      return;
    }
    if (Array.isArray(obj["@graph"])) {
      obj["@graph"].forEach(visit);
    }
  };
  visit(data);
  return found;
}

function parseServings(y: unknown): number | null {
  if (typeof y === "number" && Number.isFinite(y)) return y;
  if (typeof y === "string") {
    const m = y.match(/\d+/);
    return m ? Number.parseInt(m[0], 10) : null;
  }
  if (Array.isArray(y) && y.length > 0) return parseServings(y[0]);
  return null;
}
