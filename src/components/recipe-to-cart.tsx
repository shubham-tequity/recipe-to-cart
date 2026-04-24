"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ExternalLink,
  ShoppingCart,
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Recipe, Ingredient } from "@/lib/recipe/types";
import type { MatchResult } from "@/lib/matching/match";
import type { Cart, Sku } from "@/lib/instamart/types";

type Step = "scraping" | "extracting" | "matching" | "pricing";

type FlowState =
  | { status: "idle" }
  | { status: "loading"; step: Step; recipe?: Recipe; matches?: MatchResult[] }
  | { status: "done"; recipe: Recipe; matches: MatchResult[]; cart: Cart }
  | { status: "error"; message: string };

const STEPS: { key: Step; label: string }[] = [
  { key: "scraping", label: "Reading recipe" },
  { key: "extracting", label: "Extracting ingredients" },
  { key: "matching", label: "Matching products" },
  { key: "pricing", label: "Building cart" },
];

export function RecipeToCart() {
  const [url, setUrl] = useState("");
  const [servings, setServings] = useState<number | "">("");
  const [state, setState] = useState<FlowState>({ status: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      // Step 1 & 2: scrape + extract (single API call, but we show two visual steps)
      setState({ status: "loading", step: "scraping" });
      await new Promise((r) => setTimeout(r, 300)); // brief hold so user sees step 1
      setState({ status: "loading", step: "extracting" });

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          servings: typeof servings === "number" ? servings : undefined,
        }),
      });
      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({ error: "Extraction failed" }));
        throw new Error(err.error ?? "Extraction failed");
      }
      const { recipe } = (await extractRes.json()) as { recipe: Recipe };

      // Step 3: match
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

      // Step 4: price cart
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

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8">
      <HeroSection />

      <UrlForm
        url={url}
        setUrl={setUrl}
        servings={servings}
        setServings={setServings}
        disabled={loading}
        onSubmit={handleSubmit}
        showReset={state.status === "done" || state.status === "error"}
        onReset={reset}
      />

      {currentStepIndex >= 0 && <ProgressSteps currentIndex={currentStepIndex} />}

      {state.status === "error" && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">We couldn&apos;t process that recipe.</p>
              <p className="text-sm text-muted-foreground mt-1">{state.message}</p>
              <p className="text-xs text-muted-foreground mt-3">
                Try a different blog URL, a YouTube video with captions, or double-check the link.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(state.status === "loading" && state.recipe) || state.status === "done" ? (
        <RecipeCard
          recipe={state.status === "done" ? state.recipe : state.recipe!}
          url={url}
        />
      ) : null}

      {(state.status === "loading" && state.step === "matching" && state.recipe) ||
      (state.status === "loading" && state.step === "pricing") ||
      state.status === "done" ? (
        <IngredientsCard
          ingredients={state.status === "done" ? state.recipe.ingredients : state.recipe!.ingredients}
        />
      ) : null}

      {(state.status === "loading" && state.step === "pricing" && state.matches) ||
      state.status === "done" ? (
        <MatchesCard matches={state.status === "done" ? state.matches : state.matches!} />
      ) : null}

      {state.status === "done" && <CartCard cart={state.cart} matches={state.matches} />}
    </div>
  );
}

function HeroSection() {
  return (
    <section className="flex flex-col items-center text-center gap-4 pt-8">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary animate-pulse" />
        Swiggy Builders Club · Prototype
      </span>
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
        Paste a recipe.
        <br />
        <span className="text-primary">Get the cart.</span>
      </h1>
      <p className="max-w-xl text-base sm:text-lg text-muted-foreground leading-relaxed">
        Drop any cooking blog link or YouTube video — we&apos;ll extract ingredients, match them to
        Instamart products, and assemble your cart.
      </p>
    </section>
  );
}

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
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="url"
          required
          placeholder="https://hebbarskitchen.com/... or https://youtube.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={disabled}
          className="flex-1 h-12 text-base"
        />
        <Input
          type="number"
          min={1}
          max={50}
          placeholder="Servings (optional)"
          value={servings}
          onChange={(e) =>
            setServings(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))
          }
          disabled={disabled}
          className="h-12 sm:w-48"
        />
        <Button
          type="submit"
          disabled={disabled || !url.trim()}
          size="lg"
          className="h-12 px-6 text-base"
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
        </Button>
      </div>
      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="self-start text-xs text-muted-foreground hover:text-foreground transition inline-flex items-center gap-1"
        >
          <RotateCcw className="size-3" />
          Start over
        </button>
      )}
    </form>
  );
}

function ProgressSteps({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((step, i) => {
        const active = i === currentIndex;
        const done = i < currentIndex;
        return (
          <div key={step.key} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1 ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : done
                    ? "border-border bg-card text-foreground"
                    : "border-border bg-card text-muted-foreground"
              }`}
            >
              {done ? (
                <Check className="size-3" />
              ) : active ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <span className="size-1.5 rounded-full bg-muted-foreground" />
              )}
              <span>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && <ArrowRight className="size-3 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );
}

function RecipeCard({ recipe, url }: { recipe: Recipe; url: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-xl">{recipe.title || "Untitled Recipe"}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 text-xs">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-primary transition truncate max-w-xs"
              >
                {new URL(url).hostname.replace("www.", "")}
                <ExternalLink className="size-3" />
              </a>
            </CardDescription>
          </div>
          <div className="flex gap-2 shrink-0">
            {recipe.servings && (
              <Badge variant="secondary">Serves {recipe.servings}</Badge>
            )}
            <Badge variant="secondary">{recipe.ingredients.length} ingredients</Badge>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function IngredientsCard({ ingredients }: { ingredients: Ingredient[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ingredients</CardTitle>
        <CardDescription>Extracted from the recipe and normalized.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {ingredients.map((ing, i) => (
            <li key={i} className="py-2.5 flex items-baseline gap-3">
              <span className="font-medium">{ing.name}</span>
              {ing.original_name !== ing.name && (
                <span className="text-xs text-muted-foreground italic">
                  ({ing.original_name})
                </span>
              )}
              <span className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
                {formatQuantity(ing)}
              </span>
              {ing.optional && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  optional
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MatchesCard({ matches }: { matches: MatchResult[] }) {
  const matched = matches.filter((m) => m.best_match !== null);
  const unmatched = matches.filter((m) => m.best_match === null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Matched to Instamart</CardTitle>
            <CardDescription>
              {matched.length} matched · {unmatched.length} unmatched
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">Mock catalog</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {matches.map((m, i) => (
            <li key={i} className="py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium">{m.ingredient.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatQuantity(m.ingredient)}
                  </span>
                </div>
                {m.best_match ? (
                  <div className="mt-1 text-sm text-muted-foreground">
                    →{" "}
                    <span className="text-foreground">
                      {m.best_match.brand} {m.best_match.name}
                    </span>{" "}
                    <span className="text-xs">
                      ({m.best_match.pack_size}
                      {m.best_match.pack_unit})
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-muted-foreground">
                    → <span className="text-destructive">No match in catalog</span>
                  </div>
                )}
                {m.note && m.best_match && (
                  <p className="text-xs text-muted-foreground mt-1">{m.note}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {m.best_match && m.quantity_ordered > 0 && (
                  <span className="text-sm font-medium tabular-nums">
                    ₹{m.best_match.mrp * m.quantity_ordered}
                    {m.quantity_ordered > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        ({m.quantity_ordered}×)
                      </span>
                    )}
                  </span>
                )}
                <ConfidenceBadge confidence={m.confidence} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function CartCard({ cart, matches }: { cart: Cart; matches: MatchResult[] }) {
  const skuById = new Map<string, Sku>();
  matches.forEach((m) => {
    if (m.best_match) skuById.set(m.best_match.id, m.best_match);
  });

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary/15 flex items-center justify-center">
              <ShoppingCart className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Your cart</CardTitle>
              <CardDescription>
                {cart.items.length} items · ready to order
              </CardDescription>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              ₹{cart.subtotal.toLocaleString("en-IN")}
            </div>
            <div className="text-xs text-muted-foreground">subtotal</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border">
          {cart.items.map((item) => {
            const sku = skuById.get(item.sku_id);
            if (!sku) return null;
            return (
              <li key={item.sku_id} className="py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 truncate">
                  <span className="text-muted-foreground">{sku.brand}</span>{" "}
                  {sku.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({sku.pack_size}
                    {sku.pack_unit})
                  </span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  ×{item.quantity}
                </span>
                <span className="font-medium tabular-nums shrink-0 w-20 text-right">
                  ₹{sku.mrp * item.quantity}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="pt-2 border-t border-border flex items-center gap-3">
          <Button disabled className="flex-1" size="lg">
            Checkout on Instamart
          </Button>
          <span className="text-xs text-muted-foreground">
            requires Swiggy MCP access
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ confidence }: { confidence: MatchResult["confidence"] }) {
  const styles: Record<MatchResult["confidence"], { label: string; className: string }> = {
    high: { label: "high match", className: "bg-primary/15 text-primary border-primary/30" },
    medium: { label: "medium", className: "bg-accent/15 text-accent border-accent/30" },
    low: { label: "low", className: "bg-destructive/15 text-destructive border-destructive/30" },
  };
  const { label, className } = styles[confidence];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] ${className}`}
    >
      {label}
    </span>
  );
}

function formatQuantity(ing: Ingredient): string {
  if (ing.quantity == null || ing.unit === "to_taste") return "to taste";
  const q = Number.isInteger(ing.quantity) ? ing.quantity : Number(ing.quantity.toFixed(2));
  const unit = ing.unit === "piece" || ing.unit === "whole" ? "" : ` ${ing.unit}`;
  return `${q}${unit}`;
}

// Skeleton stays used for future streaming states; silence unused for now.
void Skeleton;
