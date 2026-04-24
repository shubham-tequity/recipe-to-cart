import Link from "next/link";
import { RecipeToCart } from "@/components/recipe-to-cart";

export default function Home() {
  return (
    <>
      <header className="w-full">
        <div className="max-w-5xl mx-auto px-6 pt-6 sm:pt-8">
          <Link
            href="/"
            className="inline-block text-xl sm:text-2xl font-semibold tracking-tight text-foreground hover:text-primary transition-colors"
          >
            Recipe to Cart
          </Link>
        </div>
      </header>
      <main className="flex-1 flex flex-col px-6 pt-8 sm:pt-10 pb-12 sm:pb-16">
        <RecipeToCart />
      </main>
      <footer className="mt-auto px-6 py-10 text-xs text-muted-foreground flex items-center justify-center gap-1.5 border-t border-border/60">
        Built by
        <a
          href="https://tequity.tech"
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:text-primary transition font-medium"
        >
          Shubham Tequity
        </a>
        for
        <a
          href="https://mcp.swiggy.com/builders/"
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:text-primary transition font-medium"
        >
          Swiggy Builders Club
        </a>
      </footer>
    </>
  );
}
