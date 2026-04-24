<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Recipe-to-Cart — project charter for AI agents

This file is the source of truth for any AI coding agent (Claude Code, Cursor, Copilot, etc.) working in this repo. `CLAUDE.md` imports this file via `@AGENTS.md`. **Read this before making changes.** It overrides default agent behavior where they conflict.

---

## What this project is

**Recipe-to-Cart** — paste a recipe URL (cooking blog or YouTube) and get a Swiggy Instamart cart pre-filled with every ingredient in the right quantity.

Built for the **Swiggy Builders Club MCP program** ([mcp.swiggy.com/builders](https://mcp.swiggy.com/builders/)) as a prototype of the "smart grocery agent" use case they call out. Authored by [Tequity](https://tequity.tech).

### Current stage

**Prototype. No Swiggy MCP access yet** (application pending; typical turnaround 4+ weeks). The app runs end-to-end against a **mock Instamart catalog** behind an `InstamartClient` interface — designed so the swap to real MCP is mechanical.

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
| YouTube scrape | `youtube-transcript` + oEmbed | Captions only — no Whisper fallback in v1. |
| Matching | `fuse.js` | Fuzzy over name / brand / aliases. |
| Hosting | **Vercel** | Single `vercel deploy`. |

**Default extraction model: `anthropic/claude-haiku-4-5`.** ~$0.005/recipe. Don't silently upgrade to Sonnet — A/B test on two recipes and discuss with the user first.

---

## Folder layout

```
src/
├── app/
│   ├── api/
│   │   ├── extract/route.ts     # URL → scrape → LLM → structured Recipe
│   │   ├── match/route.ts       # ingredients[] → SKU matches with quantities
│   │   └── cart/route.ts        # cart item list → priced cart payload
│   ├── globals.css              # theme — brand CSS vars live here, NOT in config
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── ui/                      # shadcn components — do not edit by hand
├── lib/
│   ├── instamart/               # all Instamart abstraction lives here
│   │   ├── client.ts            # InstamartClient interface — the boundary
│   │   ├── mock-client.ts       # local catalog.json implementation
│   │   ├── catalog.json         # seed SKUs (synthesized, clearly labelled)
│   │   ├── types.ts             # Zod schemas: Sku, CartItem, Cart
│   │   └── index.ts             # getInstamartClient() — resolves active client
│   ├── recipe/
│   │   ├── types.ts             # Zod: Ingredient, Recipe, Unit
│   │   ├── scrape.ts            # blog + YouTube ingestion
│   │   └── extract.ts           # LLM extraction via AI SDK
│   └── matching/
│       └── match.ts             # ingredient × catalog → MatchResult[]
```

### Rule: no cross-layer leakage

- **`lib/recipe/` must not import `lib/instamart/`** — recipes don't know about catalogs.
- **`lib/matching/` is the only place where recipes meet SKUs.** Keep it that way.
- **API routes are thin.** Validate → call lib function → return. No business logic in routes.

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

Zod-validated. The extraction prompt is bound to this schema — if you change the schema, update the prompt in `src/lib/recipe/extract.ts` to match. The unit enum is fixed; don't add new units without updating the matcher's `convertToBase`.

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

Fonts: Geist Sans + Geist Mono (loaded in `layout.tsx`).

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
