export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="w-full max-w-2xl flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted-foreground)]">
          <span className="size-1.5 rounded-full bg-[var(--primary)]" />
          Swiggy Builders Club · Prototype
        </span>

        <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          Paste a recipe.
          <br />
          <span className="text-[var(--primary)]">Get the cart.</span>
        </h1>

        <p className="mt-5 max-w-xl text-base sm:text-lg text-[var(--muted-foreground)] leading-relaxed">
          Drop in any cooking blog link or YouTube video — we&apos;ll extract
          ingredients, match them to Instamart products, and assemble your cart
          in seconds.
        </p>

        <form className="mt-10 w-full flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            placeholder="https://hebbarskitchen.com/... or https://youtube.com/..."
            className="flex-1 h-12 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--ring)] transition"
            disabled
          />
          <button
            type="submit"
            disabled
            className="h-12 rounded-[var(--radius)] bg-[var(--primary)] px-6 font-medium text-[var(--primary-foreground)] hover:bg-[var(--brand-swiggy-orange-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            Extract ingredients
          </button>
        </form>

        <p className="mt-4 text-xs text-[var(--muted-foreground)]">
          Extraction wiring in progress · UI is a preview
        </p>
      </div>

      <footer className="mt-24 text-xs text-[var(--muted-foreground)] flex items-center gap-2">
        Built by
        <a
          href="https://tequity.tech"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--foreground)] hover:text-[var(--primary)] transition"
        >
          Tequity
        </a>
        for
        <a
          href="https://mcp.swiggy.com/builders/"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--foreground)] hover:text-[var(--primary)] transition"
        >
          Swiggy Builders Club
        </a>
      </footer>
    </main>
  );
}
