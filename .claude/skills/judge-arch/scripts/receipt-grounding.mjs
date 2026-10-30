// receipt-grounding - the one owner of skill-receipt grounding logic, shared by the PR-level gate
// (check-skill-receipt.mjs) and the per-task gate (task-receipt.mjs), so there is a single definition of what
// "grounded" means: a quote of at least 8 exact words that appears verbatim under a real heading of the cited
// skill file. Extracting it keeps the two checkers from drifting apart (one way to do one thing).
//
// Dependency-free, offline. Pure functions over text; no filesystem or process access lives here.

export const MIN_QUOTE_WORDS = 8;

// Collapse all runs of whitespace to a single space so a quote that wraps across lines in the source still
// matches. Used on both the section text (the haystack) and the quote (the needle).
export function norm(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

// A Markdown heading's slug: lower-case, drop backticks and punctuation, spaces to hyphens. Matches the anchor
// slugs used in the receipt (e.g. "The core rule" -> "the-core-rule").
export function slugify(text) {
  return String(text).toLowerCase().replace(/`/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

// The text under one heading: from the matched heading line to the next heading of equal-or-higher level (or
// end of file). Returns null if no heading slugifies to `slug`. Frontmatter sits before any heading, so it is
// never included; a quote must come from the cited section, not from the file at large or its description.
export function sectionText(md, slug) {
  const lines = String(md).split(/\r?\n/);
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
    if (m && slugify(m[2]) === slug) { start = i; level = m[1].length; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

// The high-level grounding check: does `quote` (>= MIN_QUOTE_WORDS words) appear verbatim under the heading
// whose slug is `headingSlug` in `fileText`? Returns { ok: true } or { ok: false, reason }. This is the whole
// "prove you read it" rule in one place, so both receipt checkers decide it the same way.
export function quoteUnderHeading(fileText, headingSlug, quote) {
  const slug = String(headingSlug).trim().toLowerCase();
  const section = sectionText(fileText, slug);
  if (section == null) return { ok: false, reason: `heading "#${slug}" is not a heading in the skill file` };
  const words = String(quote).trim().split(/\s+/).filter(Boolean);
  if (words.length < MIN_QUOTE_WORDS) {
    return { ok: false, reason: `quote is only ${words.length} word(s); at least ${MIN_QUOTE_WORDS} exact words are needed to ground it` };
  }
  if (!norm(section).includes(norm(quote))) {
    return { ok: false, reason: `quote does not appear verbatim under "#${slug}" (fabricated, misquoted, or from another section or the frontmatter)` };
  }
  return { ok: true };
}
