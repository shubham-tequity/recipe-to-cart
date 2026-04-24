import { RecipeToCart } from "@/components/recipe-to-cart";

export default function Home() {
  return (
    <>
      <main className="flex-1 flex flex-col px-6 py-12 sm:py-16">
        <RecipeToCart />
      </main>
      <footer className="mt-auto px-6 py-8 text-xs text-muted-foreground flex items-center justify-center gap-2 border-t border-border">
        Built by
        <a
          href="https://tequity.tech"
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:text-primary transition"
        >
          Tequity
        </a>
        for
        <a
          href="https://mcp.swiggy.com/builders/"
          target="_blank"
          rel="noreferrer"
          className="text-foreground hover:text-primary transition"
        >
          Swiggy Builders Club
        </a>
      </footer>
    </>
  );
}
