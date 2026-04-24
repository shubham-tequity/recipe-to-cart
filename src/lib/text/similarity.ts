/**
 * Text similarity helpers for display cleanup.
 *
 * Hebbar's Kitchen and other blogs are full of typos ("panerr", "coriadner",
 * "dride red chilli") that the LLM faithfully preserves in `original_name`.
 * Showing those next to the clean canonical `name` is visual noise. This
 * helper decides whether `original_name` adds real information — regional
 * translations (haldi, kasuri methi) stay visible; typos and word-order
 * shuffles hide.
 */
import { tokenize } from "./tokenize";

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    prev = curr;
  }

  return prev[n];
}

export function shouldShowOriginalName(name: string, original: string): boolean {
  const a = name.trim().toLowerCase();
  const b = original.trim().toLowerCase();
  if (!b || a === b) return false;

  // Use the shared tokenizer so punctuation (hyphens, parens) doesn't prevent
  // subsume detection: "ginger-garlic paste" and "ginger garlic paste" should
  // tokenize identically.
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  // Same tokens in a different order? "cloves garlic" ↔ "garlic cloves".
  const sortedA = [...new Set(aTokens)].sort().join(" ");
  const sortedB = [...new Set(bTokens)].sort().join(" ");
  if (sortedA === sortedB) return false;

  // Every original-token is close (exact or 1-2 edits) to some name-token?
  // Then original is effectively a typo-tolerant subset of name:
  //   "coriadner" vs "fresh coriander" — "coriadner" ≈ "coriander" (lev 2)
  //   "pepper" vs "black pepper" — "pepper" ⊂ name tokens
  //   "dride red chilli" vs "dried red chilli" — every token has a close match
  const allSubsumed = bTokens.every((bt) =>
    aTokens.some((at) => at === bt || levenshtein(at, bt) <= 2)
  );
  if (allSubsumed) return false;

  // Small whole-string edit distance → typo at the outer level.
  if (levenshtein(a, b) <= 2) return false;

  return true;
}
