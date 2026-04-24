# Recipe-to-Cart

**Paste a recipe. Get the cart.**

Drop any cooking blog link or YouTube video into Recipe-to-Cart and get a ready-to-checkout Swiggy Instamart cart — every ingredient extracted, quantities normalized, and matched to real products in seconds.

Built for the [Swiggy Builders Club MCP program](https://mcp.swiggy.com/builders/) by [Tequity](https://tequity.tech).

---

## Why this exists

Cooking a new dish means reading an ingredient list, translating "½ kg onions / 2 tsp haldi / a handful of curry leaves" into grocery SKUs, remembering what's at home, and hunting each item down on Instamart one by one. It's the highest-friction step between *"I want to cook this"* and *"I have the groceries."*

Recipe-to-Cart turns that flow into **one URL → one-click cart.**

## How it works

```
  ┌─────────────────┐
  │   Recipe URL    │   Hebbar's Kitchen, Archana's, any blog, or YouTube
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │    Scrape       │   schema.org Recipe JSON-LD, or HTML fallback,
  │                 │   or YouTube captions via oEmbed + youtube-transcript
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  LLM extract    │   Vercel AI SDK v6 + generateObject
  │                 │   Zod-typed Ingredient[] with Hinglish → English:
  │                 │     haldi → turmeric powder
  │                 │     dhania → coriander
  │                 │     jeera → cumin seeds
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  Match to SKU   │   Fuzzy search (fuse.js) over the catalog,
  │                 │   unit conversion, pack-size rounding
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │      Cart       │   Assembled via InstamartClient interface —
  │                 │   mock today, real Swiggy MCP once access lands
  └─────────────────┘
```

## Status

**Prototype.** Runs end-to-end against a mock Instamart catalog, behind an `InstamartClient` interface. Applied for Swiggy Builders Club MCP access — when granted, the swap to the real client is a one-file change.

- [x] Scaffold & theme (Swiggy × Tequity hybrid, dark-first)
- [x] Blog + YouTube scraping
- [x] LLM ingredient extraction with Hinglish resolution
- [x] Catalog matching with pack-size rounding
- [x] Cart assembly (mock)
- [ ] Seed catalog expanded to ~200 real Indian grocery SKUs
- [ ] UI wired end-to-end
- [ ] Deployed to Vercel
- [ ] Swiggy MCP access granted
- [ ] `SwiggyMcpInstamartClient` live

## Stack

- **Next.js 16** (App Router, Turbopack) on **Vercel**
- **TypeScript** (strict) · **Tailwind v4** · **shadcn/ui** (Base UI)
- **Vercel AI SDK v6** via **Vercel AI Gateway** (`anthropic/claude-haiku-4-5` default)
- **Zod** · **cheerio** · **youtube-transcript** · **fuse.js**

## Local setup

```bash
# 1. Clone
git clone https://github.com/shubham-tequity/recipe-to-cart.git
cd recipe-to-cart

# 2. Install
npm install

# 3. Env — see .env.local.example for the full list
cp .env.local.example .env.local
# then fill in AI_GATEWAY_API_KEY

# 4. Run
npm run dev
# → http://localhost:3000
```

### Environment variables

| Var | Required | Description |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Yes | [Vercel AI Gateway](https://vercel.com/ai-gateway) key. One key, every provider. |
| `EXTRACTION_MODEL` | No | Override the default Haiku model. Use `anthropic/claude-sonnet-4-6` if Haiku mis-parses your recipes. |
| `USE_SWIGGY_MCP` | No | `1` once Swiggy MCP access is granted and `SwiggyMcpInstamartClient` is wired. Keep unset for the prototype. |

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── extract/route.ts     # URL → scraped → structured Recipe
│   │   ├── match/route.ts       # Ingredient[] → MatchResult[]
│   │   └── cart/route.ts        # CartItem[] → priced Cart
│   ├── globals.css              # theme — brand CSS vars
│   ├── layout.tsx
│   └── page.tsx
├── components/ui/               # shadcn
└── lib/
    ├── instamart/               # InstamartClient interface + mock impl
    ├── recipe/                  # scrape + LLM extract
    └── matching/                # ingredient × catalog → cart items
```

See [`AGENTS.md`](./AGENTS.md) for the full project charter — architecture rules, conventions, AI agent guardrails, and the theme spec.

## Deploy

```bash
vercel
```

That's it. Set `AI_GATEWAY_API_KEY` in the Vercel project settings and the preview URL works end-to-end.

---

Built by [Shubham Tequity](https://tequity.tech) for [Swiggy Builders Club](https://mcp.swiggy.com/builders/).
