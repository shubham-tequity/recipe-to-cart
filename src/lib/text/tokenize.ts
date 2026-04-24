/**
 * Shared tokenizer used by catalog search and ingredient matching.
 *
 * Normalizes text into a comparable token set: lowercases, strips punctuation,
 * folds common British→US spellings (chilli→chili), and applies crude
 * singularization so "tomatoes" matches "tomato".
 *
 * Both the mock catalog search and the matching-layer confidence calculation
 * run text through this, so query tokens and SKU tokens are always stemmed
 * the same way.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/chilli(es)?/g, "chili")
    .replace(/pulses/g, "pulse")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map(singularize);
}

function singularize(w: string): string {
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("es") && w.length > 3) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 3) return w.slice(0, -1);
  return w;
}
