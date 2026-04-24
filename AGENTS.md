<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Recipe-to-Cart — project charter for AI agents

This file is the source of truth for any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repo. `CLAUDE.md` imports this file via `@AGENTS.md`. **Read this before making changes.** It overrides default agent behavior where they conflict.

---

## What this project is

**Recipe-to-Cart** — paste a cooking blog URL and get a Swiggy Instamart cart pre-filled with every ingredient in the right quantity.

Built for the **Swiggy Builders Club MCP program** ([mcp.swiggy.com/builders](https://mcp.swiggy.com/builders/)) as a prototype of the "smart grocery agent" use case they call out. Authored by [Shubham Tequity](https://tequity.tech).

### Current stage

**Prototype, deployed.** Live at [recipe-to-cart-alpha.vercel.app](https://recipe-to-cart-alpha.vercel.app). No Swiggy MCP access yet (application pending; typical turnaround 4+ weeks), so the app runs end-to-end against a **mock Instamart catalog** behind an `InstamartClient` interface — designed so the swap to real MCP is mechanical.

**YouTube caveat.** `src/lib/recipe/scrape.ts` has a working YouTube-captions path via `youtube-transcript` + oEmbed. It runs fine locally but YouTube blocks Vercel's datacenter IPs from transcript endpoints, so it's currently unreachable in prod. The hero subtitle advertises "YouTube support · coming soon"; re-enable when we route fetches through a residential proxy (`youtubei.js` is a likely next step). Don't rip the code out.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | Server routes live in the same project as the UI. |
| Language | **TypeScript (strict)** | |
| Styling | **Tailwind CSS v4** (CSS-based `@theme`) | No `tailwind.config.ts`. All tokens are CSS variables in `globals.css`. |
| UI kit | **shadcn/ui** (base-nova preset, Base UI primitives) | Components live in `src/components/ui/`. |
| LLM | **Vercel AI SDK v6** via **Vercel AI Gateway** | Provider-agnostic model strings: `"anthropic/claude-haiku-4-5"`. |
| Extraction schema | **Zod** + `generateObject` | See `src/lib/recipe/types.ts`. |
| Blog scrape | `cheerio` + schema.org JSON-LD | See `src/lib/recipe/scrape.ts`. |
| YouTube scrape | `youtube-transcript` + oEmbed | Captions only — no Whisper fallback. Disabled in prod (see caveat above). |
| Matching | **Custom IDF-weighted token scoring** | In `lib/instamart/mock-client.ts`. Rare tokens (fennel) outweigh common ones (seed, powder). Primary-noun + name-only extraneous-token tiebreakers. **No Fuse** — it was fuzzy-re-ranking correct results into wrong ones. |
| Rate limit | **In-memory sliding-window** | `lib/rate-limit.ts`, 10 req/hr/IP on `/api/extract`. Per-instance state; swap to Upstash Redis before going truly public. |
| Hosting | **Vercel** | Single `vercel --prod`. |

**Default extraction model: `anthropic/claude-haiku-4-5`.** ~$0.005/recipe. Don't silently upgrade to Sonnet — A/B test on two recipes and discuss with the user first.

---

## Folder layout

```
src/
├── app/
│   ├── api/
│   │   ├── extract/route.ts     # URL → scrape → LLM → structured Recipe (rate-limited)
│   │   ├── match/route.ts       # ingredients[] → SKU matches with quantities
│   │   └── cart/route.ts        # cart item list → priced cart payload
│   ├── globals.css              # theme — brand CSS vars live here, NOT in config
│   ├── icon.svg                 # RC favicon (Swiggy orange, system-ui text)
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── recipe-to-cart.tsx       # single-file orchestrator + all sub-components
│   └── ui/                      # shadcn components — do not edit by hand
├── lib/
│   ├── instamart/               # all Instamart abstraction lives here
│   │   ├── client.ts            # InstamartClient interface — the boundary
│   │   ├── mock-client.ts       # local catalog.json impl + IDF-weighted search
│   │   ├── catalog.json         # 208 seed SKUs across 14 categories
│   │   ├── types.ts             # Zod schemas: Sku, CartItem, Cart
│   │   └── index.ts             # getInstamartClient() — resolves active client
│   ├── recipe/
│   │   ├── types.ts             # Zod: Ingredient, Recipe, Unit
│   │   ├── scrape.ts            # blog + YouTube ingestion
│   │   ├── extract.ts           # LLM call (permissive schema) + pipeline orchestrator
│   │   ├── unit-normalize.ts    # exotic LLM units → canonical enum
│   │   ├── canonicalize.ts      # strip "fresh X paste" etc. — safety net for prompt
│   │   ├── filter.ts            # drop non-shoppable ingredients (water, ice)
│   │   └── dedupe.ts            # collapse same-name duplicates (marinade + curry)
│   ├── matching/
│   │   └── match.ts             # per-ingredient: search → pick → resolveQuantity → confidence
│   ├── text/
│   │   ├── tokenize.ts          # shared tokenizer used by search AND matcher
│   │   └── similarity.ts        # Levenshtein + shouldShowOriginalName display helper
│   └── rate-limit.ts            # in-memory sliding-window limiter
```

### Extraction pipeline order

When touching extraction, follow this order exactly. Each step assumes the prior step's output shape:

1. `scrape.ts` — fetch page, pull JSON-LD or HTML fallback (or YouTube captions locally).
2. `extract.ts` — LLM via `generateObject` against the permissive schema (`unit: z.string()`).
3. `unit-normalize.ts` — exotic units (`strand`, `blade`, `knob`) → canonical enum.
4. Strict `recipeSchema.parse` — enforce downstream contract.
5. `canonicalize.ts` — strip `fresh X paste/powder/sauce/puree/chutney/achar/ketchup`.
6. `filter.ts` — drop `water`, `ice`, and other non-shoppable liquids.
7. `dedupe.ts` — collapse same-name duplicates across recipe sections.
8. `matching/match.ts` — per ingredient: `client.searchProducts` → top result → `resolveQuantity` → combined confidence.

### Rule: no cross-layer leakage

- **`lib/recipe/` must not import `lib/instamart/`** — recipes don't know about catalogs.
- **`lib/matching/` is the only place where recipes meet SKUs.** Keep it that way.
- **`lib/text/` is framework-agnostic** — no React, no Next, no Instamart. Shared utilities only.
- **API routes are thin.** Validate → rate-limit (where applicable) → call lib function → return. No business logic in routes.

---

## Core contracts

### `InstamartClient` — [`src/lib/instamart/client.ts`](src/lib/instamart/client.ts)

```ts
interface InstamartClient {
  searchProducts(query: string, opts?: { limit?: number }): Promise<Sku[]>;
  getProduct(skuId: string): Promise<Sku | null>;
  buildCart(items: CartItem[]): Promise<Cart>;
}
```

This is the swap point. **Any new cart/catalog feature goes through this interface.** When Swiggy MCP access lands, `SwiggyMcpInstamartClient` implements the same three methods backed by `search_products`, `get_cart`, `update_cart` tool calls. Nothing else changes.

### `Recipe` / `Ingredient` — [`src/lib/recipe/types.ts`](src/lib/recipe/types.ts)

Zod-validated. The extraction prompt is bound to this schema — if you change the schema, update the prompt in `src/lib/recipe/extract.ts` to match.

The unit enum is fixed. The LLM is allowed to return any string for `unit` (we parse against a permissive mirror schema), and `lib/recipe/unit-normalize.ts` maps exotics (`strand`, `blade`, `knob`, `dash`) to the canonical enum before the strict `recipeSchema.parse`. If you add a new canonical unit, update **three** places: `unitSchema`, `convertToBase` (in `matching/match.ts`), and any exotic aliases in `unit-normalize.ts`.

---

## Conventions

- **Server Components are the default.** Add `"use client"` only when you need state, effects, or browser APIs.
- **API keys stay server-side.** Never touch `AI_GATEWAY_API_KEY` (or any key) from client code. If you're tempted, stop and move the call behind a route.
- **Validate every external input with Zod.** URLs, JSON bodies, LLM outputs (already via `generateObject`), scraped content shape. No raw `as T` on untrusted data.
- **No default exports** except `page.tsx` / `layout.tsx` / API route handlers where Next.js requires them.
- **Functional React.** Hooks, no classes.
- **Errors are messages, not stack traces.** API routes return `{ error: string }` with a human-readable message at 4xx; log details server-side.
- **Never commit `.env.local`.** If you see it staged, unstage it.

---

## Theme

**Dark-first, Swiggy × Tequity hybrid.** All colors live as CSS variables in `src/app/globals.css` — never hardcode hex in components, use `text-primary`, `bg-card`, etc.

| Token | Hex | Purpose |
|---|---|---|
| `--background` | `#0B0F1A` | Tequity navy base |
| `--card` | `#131824` | Elevated surface |
| `--primary` | `#FC8019` | Swiggy orange — CTAs, key accents |
| `--accent` | `#E23744` | Instamart magenta — badges, status |
| `--foreground` | `#F5F6FA` | Primary text |
| `--muted-foreground` | `#9CA3AF` | Secondary text |
| `--border` | `#1E2433` | |

**Radius default: `0.75rem` (rounded-lg).** Avoid sharp corners.

Fonts: **Inter** (UI) + **JetBrains Mono** (optional mono slot), loaded via `next/font/google` in `layout.tsx`. Inter uses OpenType features `cv11`, `ss01`, `ss03` for alternate `a`, `g`, `1` — tuned in `globals.css` under `html, body`.

Favicon: `src/app/icon.svg` — Swiggy-orange rounded square with white "RC" text. Next.js auto-wires it from the `app/` directory.

---

## AI agent guardrails

These apply to **every** coding agent working in this repo. Not optional.

### Cost discipline (LLM calls)
1. **Default model is Haiku.** Don't switch to Sonnet/Opus without explicit user approval.
2. **No batch scripts.** Never loop extraction over >5 URLs without asking.
3. **Cache during development.** If adding a dev-mode cache for extractions, key on URL hash; write to `.cache/` (gitignored).
4. **Kill stuck calls.** The extract route has `maxDuration = 60`. Don't raise it without reason.

### Git and GitHub authorship
- **NEVER add Claude as `Co-Authored-By` in commits, PRs, or PR replies.** Hard rule. The user owns all authorship on this repo.
- **NEVER append "Generated with Claude Code" footers** to commit messages or PR bodies.
- **Active GitHub account for this project: `shubham-tequity`.** Verify with `gh auth status` before any `gh` or `git push`. If wrong account is active, stop and tell the user.
- **Repo:** `shubham-tequity/recipe-to-cart` (public).

### Vercel
- **Active Vercel account for this project: `shubhamk-2676`** (Tequity).
- **AI Gateway spending cap: $5** for the prototype key. Don't remove it.
- **Never commit** `AI_GATEWAY_API_KEY` or any provider key.

### Scope discipline
- **No features not asked for.** If a task is "add Hinglish support," don't also refactor the matching algorithm.
- **No backwards-compat shims.** It's a prototype; if you change a schema, update every caller — don't leave two schemas coexisting.
- **Delete aggressively.** Dead code, unused exports, commented-out blocks. If it's not called, it doesn't exist.
- **No premature abstraction.** Three similar lines beats a helper that saves one line.

### Testing
There is no test framework yet. Verification means:
1. `npm run lint` — clean.
2. `npx tsc --noEmit` — clean.
3. `npm run build` — clean.
4. For UI changes: run `npm run dev`, open the feature in a browser, and try the golden path plus one edge case before claiming it works. If you can't run a browser, say so explicitly.

---

## Environment variables

`.env.local` (gitignored):

```
# Vercel AI Gateway (single key, provider-agnostic model strings)
AI_GATEWAY_API_KEY=vck_...

# Optional: override the default extraction model
# EXTRACTION_MODEL=anthropic/claude-haiku-4-5

# Future (once Swiggy MCP access lands)
# USE_SWIGGY_MCP=1
# SWIGGY_MCP_URL=...
# SWIGGY_MCP_API_KEY=...
```

---

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # production build
npm run start        # serve production build locally
npm run lint         # ESLint
npx tsc --noEmit     # type check
```

To add shadcn components:
```bash
npm exec -- shadcn add <component>   # e.g. dialog, tooltip, select
```

---

## Submission status (live state)

- [ ] Google Form submitted to Swiggy Builders Club (Developer track)
- [ ] Follow-up email sent to `builders@swiggy.in`
- [ ] MCP access granted
- [ ] `SwiggyMcpInstamartClient` implemented
- [ ] Production catalog live (mock removed)

Update this list as milestones land. Single source of truth for where we are with Swiggy.
