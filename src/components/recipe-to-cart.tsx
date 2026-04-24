"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  ShoppingCart,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
  Link2,
  Lock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Recipe, Ingredient } from "@/lib/recipe/types";
import type { MatchResult } from "@/lib/matching/match";
import type { Cart, Sku, Category } from "@/lib/instamart/types";
import { shouldShowOriginalName } from "@/lib/text/similarity";

type Step = "scraping" | "extracting" | "matching" | "pricing";

type FlowState =
  | { status: "idle" }
  | { status: "loading"; step: Step; recipe?: Recipe; matches?: MatchResult[] }
  | { status: "done"; recipe: Recipe; matches: MatchResult[]; cart: Cart }
  | { status: "error"; message: string }
  | { status: "rate_limited"; resetsAt: string };

const STEPS: { key: Step; label: string }[] = [
  { key: "scraping", label: "Reading recipe" },
  { key: "extracting", label: "Extracting ingredients" },
  { key: "matching", label: "Matching products" },
  { key: "pricing", label: "Building cart" },
];

const CATEGORY_LABEL: Record<Category, string> = {
  staples: "Staples",
  flours: "Flours",
  pulses: "Pulses & Dals",
  spices: "Spices & Masalas",
  oils: "Oils & Ghee",
  dairy: "Dairy",
  vegetables: "Vegetables & Fresh Produce",
  fruits: "Fruits",
  condiments: "Condiments",
  "dry-goods": "Dry Fruits & Nuts",
  beverages: "Beverages",
  frozen: "Frozen",
  bakery: "Bakery",
  snacks: "Snacks",
  other: "Other",
};

const CATEGORY_ORDER: Category[] = [
  "vegetables",
  "fruits",
  "dairy",
  "pulses",
  "flours",
  "staples",
  "spices",
  "oils",
  "dry-goods",
  "condiments",
  "frozen",
  "bakery",
  "snacks",
  "beverages",
  "other",
];

export function RecipeToCart() {
  const [url, setUrl] = useState("");
  const [servings, setServings] = useState<number | "">("");
  const [state, setState] = useState<FlowState>({ status: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      setState({ status: "loading", step: "scraping" });
      await new Promise((r) => setTimeout(r, 250));
      setState({ status: "loading", step: "extracting" });

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          servings: typeof servings === "number" ? servings : undefined,
        }),
      });
      if (extractRes.status === 429) {
        const err = (await extractRes.json().catch(() => null)) as {
          resetsAt?: string;
        } | null;
        if (err?.resetsAt) {
          setState({ status: "rate_limited", resetsAt: err.resetsAt });
          return;
        }
      }
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ message: "Extraction failed" }));
        throw new Error(err.message ?? err.error ?? "Extraction failed");
      }
      const { recipe } = (await extractRes.json()) as { recipe: Recipe };

      setState({ status: "loading", step: "matching", recipe });
      const matchRes = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingredients: recipe.ingredients }),
      });
      if (!matchRes.ok) {
        const err = await matchRes.json().catch(() => ({ error: "Matching failed" }));
        throw new Error(err.error ?? "Matching failed");
      }
      const { matches } = (await matchRes.json()) as { matches: MatchResult[] };

      setState({ status: "loading", step: "pricing", recipe, matches });
      const cartItems = matches
        .filter((m) => m.best_match && m.quantity_ordered > 0)
        .map((m) => ({ sku_id: m.best_match!.id, quantity: m.quantity_ordered }));
      const cartRes = await fetch("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: cartItems }),
      });
      if (!cartRes.ok) {
        const err = await cartRes.json().catch(() => ({ error: "Cart build failed" }));
        throw new Error(err.error ?? "Cart build failed");
      }
      const { cart } = (await cartRes.json()) as { cart: Cart };

      setState({ status: "done", recipe, matches, cart });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setState({ status: "error", message });
      toast.error(message);
    }
  }

  function reset() {
    setState({ status: "idle" });
    setUrl("");
    setServings("");
  }

  const loading = state.status === "loading";
  const currentStepIndex = loading
    ? STEPS.findIndex((s) => s.key === state.step)
    : state.status === "done"
      ? STEPS.length
      : -1;

  const showRecipe = (state.status === "loading" && state.recipe) || state.status === "done";
  const showIngredients =
    (state.status === "loading" && (state.step === "matching" || state.step === "pricing")) ||
    state.status === "done";
  const showMatches =
    (state.status === "loading" && state.step === "pricing" && state.matches) ||
    state.status === "done";

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-10">
      <HeroSection />

      <UrlForm
        url={url}
        setUrl={setUrl}
        servings={servings}
        setServings={setServings}
        disabled={loading || state.status === "rate_limited"}
        onSubmit={handleSubmit}
        showReset={
          state.status === "done" ||
          state.status === "error" ||
          state.status === "rate_limited"
        }
        onReset={reset}
      />

      {currentStepIndex >= 0 && <ProgressStepper currentIndex={currentStepIndex} />}

      {state.status === "rate_limited" && (
        <RateLimitCard
          resetsAt={state.resetsAt}
          onExpire={() => setState({ status: "idle" })}
        />
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] px-5 py-4 flex items-start gap-3">
          <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-sm">We couldn&apos;t process that recipe.</p>
            <p className="text-sm text-muted-foreground mt-1">{state.message}</p>
            <p className="text-xs text-muted-foreground/70 mt-3">
              Try a different blog URL, a YouTube video with captions, or double-check the link.
            </p>
          </div>
        </div>
      )}

      {showRecipe && (
        <RecipeHeader
          recipe={state.status === "done" ? state.recipe : state.recipe!}
          url={url}
        />
      )}

      {showIngredients && (
        <IngredientsSection
          ingredients={state.status === "done" ? state.recipe.ingredients : state.recipe!.ingredients}
        />
      )}

      {showMatches && (
        <MatchesSection matches={state.status === "done" ? state.matches : state.matches!} />
      )}

      {state.status === "done" && <CartSection cart={state.cart} matches={state.matches} />}
    </div>
  );
}

/* ---------- Hero ---------- */

function HeroSection() {
  return (
    <section className="flex flex-col items-center text-center gap-6 sm:gap-8 pt-8 sm:pt-14">
      <h1 className="text-7xl sm:text-8xl lg:text-9xl font-semibold tracking-tighter leading-[0.95] max-w-5xl">
        Paste a recipe.
        <br />
        <span className="bg-gradient-to-br from-[#ff9a3d] via-[#fc8019] to-[#e46a2c] bg-clip-text text-transparent">
          Get the cart.
        </span>
      </h1>
      <p className="max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
        Drop a cooking blog link and we&apos;ll extract every ingredient, match it to Instamart
        products, and assemble your cart in seconds.
      </p>
      <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground/70">
        <span className="size-1.5 rounded-full bg-primary/80" />
        YouTube support · coming soon
      </span>
    </section>
  );
}

/* ---------- URL form ---------- */

type UrlFormProps = {
  url: string;
  setUrl: (v: string) => void;
  servings: number | "";
  setServings: (v: number | "") => void;
  disabled: boolean;
  onSubmit: (e: FormEvent) => void;
  showReset: boolean;
  onReset: () => void;
};

function UrlForm({
  url,
  setUrl,
  servings,
  setServings,
  disabled,
  onSubmit,
  showReset,
  onReset,
}: UrlFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-border bg-card/60 p-2 backdrop-blur-sm shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]">
        <div className="relative flex-1">
          <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="url"
            required
            placeholder="https://hebbarskitchen.com/... or any cooking blog URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            className="h-14 !text-[15px] pl-11 pr-4 border-0 bg-transparent focus-visible:ring-0 focus-visible:border-0 shadow-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex gap-2">
          <Input
            type="number"
            min={1}
            max={50}
            placeholder="Servings"
            value={servings}
            onChange={(e) =>
              setServings(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))
            }
            disabled={disabled}
            className="h-14 w-32 bg-background/50 border-border/60 text-sm"
          />
          <button
            type="submit"
            disabled={disabled || !url.trim()}
            className="cta-primary inline-flex items-center justify-center gap-2 h-14 px-6 rounded-[calc(var(--radius)+2px)] text-[15px] font-semibold text-primary-foreground whitespace-nowrap disabled:cursor-not-allowed"
          >
            {disabled ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Building…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Build my cart
              </>
            )}
          </button>
        </div>
      </div>
      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="self-start text-xs text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1.5 px-1"
        >
          <RotateCcw className="size-3" />
          Start over
        </button>
      )}
    </form>
  );
}

/* ---------- Progress stepper ---------- */

function ProgressStepper({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex items-center gap-y-2 gap-x-2 sm:gap-x-3 flex-wrap">
      {STEPS.map((step, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`relative flex items-center justify-center size-6 rounded-full border transition-colors ${
                  done
                    ? "bg-primary border-primary"
                    : active
                      ? "border-primary bg-primary/15"
                      : "border-border bg-card"
                }`}
              >
                {done ? (
                  <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />
                ) : active ? (
                  <>
                    <span className="size-2 rounded-full bg-primary" />
                    <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                  </>
                ) : (
                  <span className="text-[10px] font-semibold text-muted-foreground/60">{i + 1}</span>
                )}
              </div>
              <span
                className={`text-xs sm:text-sm font-medium ${
                  active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground/60"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-px w-6 sm:w-8 ${done ? "bg-primary" : "bg-border"} transition-colors`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Rate limit card ---------- */

function RateLimitCard({
  resetsAt,
  onExpire,
}: {
  resetsAt: string;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);

  const resetMs = new Date(resetsAt).getTime();
  const remainingMs = Math.max(0, resetMs - now);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remainingMs <= 0) onExpireRef.current();
  }, [remainingMs]);

  const minutes = Math.ceil(remainingMs / 60_000);
  const seconds = Math.ceil(remainingMs / 1000);
  const display =
    remainingMs < 60_000 ? `${seconds}s` : `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const resetTime = new Date(resetMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-5 py-4 flex items-start gap-3">
      <Clock className="size-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="font-medium text-sm">You&apos;ve hit the demo limit.</p>
        <p className="text-sm text-muted-foreground mt-1">
          This prototype is budget-capped. You can extract another recipe in{" "}
          <span className="font-semibold text-foreground">{display}</span>
          <span className="text-muted-foreground/80"> (resets at {resetTime})</span>.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-3">10 recipes per hour · per IP</p>
      </div>
    </div>
  );
}

/* ---------- Recipe header ---------- */

function RecipeHeader({ recipe, url }: { recipe: Recipe; url: string }) {
  let hostname = "recipe";
  try {
    hostname = new URL(url).hostname.replace("www.", "");
  } catch {}

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-0">
        <div className="w-1 self-stretch bg-gradient-to-b from-primary via-primary to-accent" />
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight truncate">{recipe.title}</h2>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition"
            >
              {hostname}
              <ExternalLink className="size-3" />
            </a>
          </div>
          <div className="flex gap-2 shrink-0">
            {recipe.servings && <Pill>Serves {recipe.servings}</Pill>}
            <Pill>{recipe.ingredients.length} ingredients</Pill>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Ingredients ---------- */

function IngredientsSection({ ingredients }: { ingredients: Ingredient[] }) {
  const toTasteCount = ingredients.filter(
    (i) => i.quantity == null || i.unit === "to_taste"
  ).length;
  const mostlyUnquantified =
    ingredients.length >= 5 && toTasteCount / ingredients.length >= 0.5;

  return (
    <section className="rounded-2xl border border-border bg-card/60">
      <SectionHeader
        title="Ingredients"
        subtitle="Extracted from the recipe and normalized."
      />
      {mostlyUnquantified && (
        <div className="mx-5 sm:mx-6 mb-3 rounded-lg border border-border/60 bg-background/40 px-3.5 py-2.5 flex items-start gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center justify-center size-4 rounded-full bg-muted-foreground/15 text-muted-foreground shrink-0 mt-0.5 text-[10px] font-semibold">
            i
          </span>
          <span>
            The source didn&apos;t specify exact quantities for most ingredients — they&apos;re
            marked as <em className="italic">to taste</em>. For precise amounts, try a blog recipe
            like <span className="text-foreground/80">Hebbar&apos;s Kitchen</span>.
          </span>
        </div>
      )}
      <ul className="divide-y divide-border/50 px-5 sm:px-6 pb-2">
        {ingredients.map((ing, i) => {
          const unquantified = ing.quantity == null || ing.unit === "to_taste";
          return (
            <li key={i} className="py-3 flex items-baseline gap-3">
              <span className="font-medium text-[15px]">{ing.name}</span>
              {shouldShowOriginalName(ing.name, ing.original_name) && (
                <span className="text-xs text-muted-foreground italic truncate">
                  {ing.original_name}
                </span>
              )}
              {ing.optional && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border border-border rounded px-1.5 py-0.5 shrink-0">
                  optional
                </span>
              )}
              <span
                className={
                  "ml-auto tabular-nums whitespace-nowrap " +
                  (unquantified
                    ? "text-xs text-muted-foreground/60 italic"
                    : "text-sm text-muted-foreground")
                }
              >
                {formatQuantity(ing)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- Matches ---------- */

function MatchesSection({ matches }: { matches: MatchResult[] }) {
  const matched = matches.filter((m) => m.best_match !== null).length;
  return (
    <section className="rounded-2xl border border-border bg-card/60">
      <SectionHeader
        title="Matched to Instamart"
        subtitle={`${matched} of ${matches.length} ingredients matched · ${matches.length - matched} unmatched`}
        rightSlot={<Pill variant="muted">Mock catalog</Pill>}
      />
      <ul className="divide-y divide-border/50 px-5 sm:px-6 pb-2">
        {matches.map((m, i) => (
          <MatchRow key={i} match={m} />
        ))}
      </ul>
    </section>
  );
}

function MatchRow({ match }: { match: MatchResult }) {
  const { ingredient, best_match } = match;
  const display = best_match ? formatSkuDisplay(best_match) : null;

  return (
    <li className="py-4 grid grid-cols-[1fr_auto] gap-4 items-start">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium text-[15px]">{ingredient.name}</span>
          <span
            className={
              "tabular-nums " +
              (ingredient.quantity == null || ingredient.unit === "to_taste"
                ? "text-[11px] text-muted-foreground/60 italic"
                : "text-xs text-muted-foreground")
            }
          >
            {formatQuantity(ingredient)}
          </span>
        </div>
        {best_match && display ? (
          <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowRight className="size-3.5 shrink-0" />
            <span className="truncate">
              {display.brand && <span className="text-muted-foreground/80">{display.brand} </span>}
              <span className="text-foreground font-medium">{display.name}</span>{" "}
              <span className="text-xs text-muted-foreground/70">
                ({best_match.pack_size}
                {best_match.pack_unit})
              </span>
            </span>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-2 text-sm">
            <ArrowRight className="size-3.5 text-destructive/70" />
            <span className="text-destructive/90">No match in catalog</span>
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        {best_match && match.quantity_ordered > 0 && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tabular-nums">
              ₹{(best_match.mrp * match.quantity_ordered).toLocaleString("en-IN")}
            </span>
            {match.quantity_ordered > 1 && (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                ({match.quantity_ordered}×)
              </span>
            )}
          </div>
        )}
        <ConfidenceBadge confidence={match.confidence} />
      </div>
    </li>
  );
}

function ConfidenceBadge({ confidence }: { confidence: MatchResult["confidence"] }) {
  const styles: Record<MatchResult["confidence"], string> = {
    high: "bg-primary/12 text-primary border-primary/25",
    medium: "bg-accent/12 text-accent border-accent/25",
    low: "bg-destructive/12 text-destructive border-destructive/25",
  };
  const label: Record<MatchResult["confidence"], string> = {
    high: "high match",
    medium: "medium",
    low: "low",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${styles[confidence]}`}
    >
      {label[confidence]}
    </span>
  );
}

/* ---------- Cart ---------- */

function CartSection({ cart, matches }: { cart: Cart; matches: MatchResult[] }) {
  const skuById = new Map<string, Sku>();
  matches.forEach((m) => {
    if (m.best_match) skuById.set(m.best_match.id, m.best_match);
  });

  // Group items by category, using CATEGORY_ORDER.
  const byCategory = new Map<Category, { sku: Sku; qty: number }[]>();
  for (const item of cart.items) {
    const sku = skuById.get(item.sku_id);
    if (!sku) continue;
    const arr = byCategory.get(sku.category) ?? [];
    arr.push({ sku, qty: item.quantity });
    byCategory.set(sku.category, arr);
  }

  return (
    <section className="rounded-2xl border border-primary/25 bg-card overflow-hidden shadow-[0_20px_60px_-24px_rgba(252,128,25,0.25)]">
      <div className="px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-border/60">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/12 flex items-center justify-center">
              <ShoppingCart className="size-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Your cart</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cart.items.length} items · ready to order
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold tracking-tight tabular-nums">
              ₹{cart.subtotal.toLocaleString("en-IN")}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">
              Subtotal
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-7 py-4 space-y-6">
        {CATEGORY_ORDER.map((cat) => {
          const items = byCategory.get(cat);
          if (!items || items.length === 0) return null;
          return (
            <div key={cat}>
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">
                  {CATEGORY_LABEL[cat]}
                </h4>
                <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </span>
              </div>
              <ul className="divide-y divide-border/40">
                {items.map(({ sku, qty }) => {
                  const display = formatSkuDisplay(sku);
                  return (
                    <li key={sku.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0 truncate">
                        {display.brand && (
                          <span className="text-muted-foreground/80">{display.brand} </span>
                        )}
                        <span>{display.name}</span>
                        <span className="text-xs text-muted-foreground/70 ml-1.5">
                          ({sku.pack_size}
                          {sku.pack_unit})
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                        ×{qty}
                      </span>
                      <span className="font-medium tabular-nums shrink-0 w-20 text-right">
                        ₹{(sku.mrp * qty).toLocaleString("en-IN")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="px-5 sm:px-7 py-5 border-t border-border/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <button
          type="button"
          disabled
          className="cta-primary flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-[var(--radius)] text-[15px] font-semibold text-primary-foreground"
        >
          <Lock className="size-4" />
          Checkout on Instamart
        </button>
        <span className="text-xs text-muted-foreground flex items-center gap-1.5 sm:whitespace-nowrap">
          Requires Swiggy MCP access — pending approval
        </span>
      </div>
    </section>
  );
}

/* ---------- Shared bits ---------- */

function SectionHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
  );
}

function Pill({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "muted";
}) {
  const cls =
    variant === "muted"
      ? "border-border bg-muted/60 text-muted-foreground"
      : "border-border bg-card text-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

/* ---------- Helpers ---------- */

function formatQuantity(ing: Ingredient): string {
  if (ing.quantity == null || ing.unit === "to_taste") return "to taste";
  const q = Number.isInteger(ing.quantity) ? ing.quantity : Number(ing.quantity.toFixed(2));
  const unit = ing.unit === "piece" || ing.unit === "whole" ? "" : ` ${ing.unit}`;
  return `${q}${unit}`;
}

/**
 * Strip duplicated brand name from the SKU display name.
 * Catalog sometimes has entries like "Fortune Green Peas Dry" with brand="Fortune",
 * which naively prints as "Fortune Fortune Green Peas Dry".
 */
function formatSkuDisplay(sku: Sku): { brand: string; name: string } {
  const brandLower = sku.brand.toLowerCase();
  const nameLower = sku.name.toLowerCase();
  if (nameLower.startsWith(brandLower + " ")) {
    return { brand: "", name: sku.name };
  }
  if (nameLower === brandLower) {
    return { brand: "", name: sku.name };
  }
  return { brand: sku.brand, name: sku.name };
}
