/**
 * replace.ts — the **pure** engine behind `lore replace`'s find-and-replace, with one
 * inviolable rule: a lore-**managed region is never touched** (cli-surface §replace, AC#1).
 *
 * `lore replace` is a refactoring convenience — literal or regex find/replace across one doc
 * or the whole bundle. The danger it must design around is that a doc is not all author prose:
 * parts of it are **machine-owned**, regenerated wholesale by `lore sync` from an external
 * source of truth. A blind text replace that edited inside such a region would either be
 * silently reverted on the next `sync` (at best) or corrupt the region's structure so that
 * regeneration's drift gate trips (at worst). So a match that overlaps a managed region is left
 * untouched and uncounted; only author-owned bytes are rewritten ({@link applyReplacement}).
 *
 * ### One pass over the whole document
 *
 * The matcher runs over the **entire** document and each match is kept or skipped by whether its
 * byte span overlaps a managed region. Running over the whole text (rather than over each
 * author-owned gap in isolation) is what makes regex anchors and zero-width assertions bind to the
 * real document — `^`/`$`/`\b`/lookaround see the true start/end and neighbors, not a gap boundary
 * next to a managed block. `$1`/`$&`/`` $` ``/`$'`/`$<name>` substitutions are expanded explicitly
 * ({@link expandTemplate}, byte-for-byte with `String.prototype.replace`) so the single pass keeps
 * full regex-replacement semantics; in literal mode the replacement is inserted verbatim ($ is not
 * special).
 *
 * ### What counts as a managed region
 *
 * The bundle has two kinds of in-file managed region, both registered in
 * {@link MANAGED_REGION_LOCATORS}: the `<!-- lore:index:begin -->` … `<!-- lore:index:end -->`
 * listing block that {@link generateIndexes} owns in every `index.md` (lore-design §6.2), and the
 * `<!-- lore:tasks:begin -->` … `<!-- lore:tasks:end -->` task table that `managed-block.ts` owns in
 * a `Story`/`Spec` doc (LORE-22). {@link managedRanges} locates each registered region with **that
 * region's own owner's** location logic — so `replace` protects exactly the span `lore sync` would
 * regenerate, and a refactor can never land in bytes `sync` later reverts. Each locator is a fail-loud
 * `validation` error on a malformed layout (a duplicated marker pair, or an unmatched/crossed begin)
 * rather than a guessed span (LORE-86) — `replace` never has to guess which bytes were meant to stay
 * protected either. A future managed-block kind is likewise a one-entry addition to the registry. The
 * fully machine-generated `log.md` has no in-file markers; it is excluded by the command layer's
 * discovery, not here (this engine sees only the bytes it is handed).
 *
 * Two different location strategies, deliberately not unified into one: `lore:index`'s
 * {@link locateManagedBlock} is a literal `indexOf` scan — safe there only because that marker text
 * never occurs outside a real index block in practice. `lore:tasks:begin`/`:end`, however, are
 * routinely *cited* in this project's own prose and fenced code examples documenting the format, so a
 * literal scan misfires on those (a false "duplicated"/"unmatched" error, or worse, silently
 * protecting prose that merely mentions the syntax); {@link locateTaskBlock} instead reuses
 * `managed-block.ts`'s structural, mdast-based marker location (the same one `lore sync`/`lore check`
 * already trust), where a sentinel inside a code fence or blockquote is never mistaken for a real
 * marker (LORE-73).
 *
 * Per the core contract (lore-design §2.1) everything here is pure: text in, `{ text, count }` out,
 * or a {@link LoreError} out — `usage` for an unusable pattern (empty, invalid regex, or one that
 * can match the empty string), or `validation` when a managed region's markers are malformed
 * (LORE-86, propagated from whichever locator owns that region) — no filesystem, no printing, no
 * flags, no `process.exit`. The command layer ({@link commands/replace}) discovers and reads the
 * files, compiles the pattern **once**, and applies it per file; a `validation` error aborts before
 * any file is written (`commands/replace.ts` only writes after every target has been read and
 * rewritten).
 */

import { LoreError } from "../errors";
import { INDEX_BLOCK_BEGIN, INDEX_BLOCK_END, locateManagedBlock } from "./indexes";
import { locateTaskBlock } from "./managed-block";

/**
 * A half-open `[start, end)` byte range within a file's text. Used for the spans
 * {@link managedRanges} protects from replacement.
 */
export interface TextRange {
  /** Inclusive start offset. */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
}

/** The result of applying a {@link Replacer} to one file. */
export interface ReplaceResult {
  /** The rewritten text (identical to the input when `count` is 0). */
  readonly text: string;
  /** How many matches were replaced — counted **only outside** managed regions. */
  readonly count: number;
}

/** Options for {@link compileReplacer}/{@link replaceInText}. */
export interface ReplaceOptions {
  /** Treat `find` as a JavaScript regular expression (with `$1`/`$&` substitution in `replace`). */
  readonly regex?: boolean;
}

/**
 * A compiled find-and-replace, ready to apply to any number of files. `compile once, apply per file`
 * is what lets the command validate the pattern a **single** time up front (so a bad pattern fails
 * even when discovery finds zero files) instead of only when the per-file loop happens to run.
 */
export type Replacer = (text: string) => ReplaceResult;

/**
 * The location functions that find each kind of lore-managed region, one per marker pair. The single
 * registry every managed-region consumer skips, so a new managed block is protected by adding one
 * entry rather than threading a new special case through `replace`. Each locator is owned by (and
 * imported from) the module that owns that region's markers ({@link indexes}, {@link managed-block}),
 * so `replace` always agrees with `lore sync`/`lore check` on a region's exact extent — including
 * which location *strategy* (literal scan vs. structural) is safe for that marker pair.
 */
const MANAGED_REGION_LOCATORS: ReadonlyArray<(text: string) => TextRange | null> = [
  (text) => locateManagedBlock(text, INDEX_BLOCK_BEGIN, INDEX_BLOCK_END),
  (text) => locateTaskBlock(text),
];

/** A representative probe carrying word boundaries, line ends, digits, and punctuation, for the zero-width guard. */
const ZERO_WIDTH_PROBE = "a b1\n.x-_/2";

/**
 * Every lore-managed region in `text`, as merged, ascending `[start, end)` ranges. Each registered
 * locator finds its own region kind ({@link MANAGED_REGION_LOCATORS}) so `replace` and `lore
 * sync`/`check` agree byte-for-byte on a region's extent. Ranges from different marker kinds are
 * merged so any overlap/touch collapses, leaving a clean ordered partition for
 * {@link applyReplacement}.
 *
 * @throws LoreError `validation` when a registered region's markers are malformed (duplicated,
 *   unmatched, or crossed) — propagated from whichever locator owns that region, rather than
 *   guessing which bytes to protect (LORE-86).
 */
export function managedRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (const locate of MANAGED_REGION_LOCATORS) {
    const bounds = locate(text);
    if (bounds !== null) {
      ranges.push(bounds);
    }
  }
  return mergeRanges(ranges);
}

/**
 * Compile a find/replace into a reusable {@link Replacer}, validating the pattern up front: an empty
 * `find`, an invalid regex, or a pattern that can match the **empty string** (`x*`, `a?`, `.*`,
 * `\b`, `^`, `(?:)`) is a `usage` {@link LoreError} — a zero-width global match would otherwise
 * "replace" between every character and mass-corrupt a file. Literal mode matches `find` as plain
 * text and inserts `replace` verbatim ($ is not special); regex mode honors `$1`/`$&`/`` $` ``/`$'`/
 * `$<name>` substitutions.
 */
export function compileReplacer(find: string, replace: string, options: ReplaceOptions = {}): Replacer {
  if (find === "") {
    throw new LoreError("usage", "the find pattern is empty", "pass a non-empty string (or regex) to search for");
  }
  const matcher = options.regex ? compileRegex(find) : new RegExp(escapeRegExp(find), "g");
  assertNonEmptyMatching(matcher);
  const expand: (match: RegExpMatchArray, source: string) => string = options.regex
    ? (match, source) => expandTemplate(replace, match, source)
    : () => replace;
  return (text: string): ReplaceResult => applyReplacement(text, matcher, expand);
}

/**
 * Find-and-replace within `text` (a single-shot {@link compileReplacer} + apply), returning the
 * rewritten text and the count of matches replaced **outside** managed regions (AC#1). Equivalent to
 * `String.prototype.replace` over the whole document, except matches overlapping a managed region are
 * left untouched and uncounted.
 */
export function replaceInText(
  text: string,
  find: string,
  replace: string,
  options: ReplaceOptions = {},
): ReplaceResult {
  return compileReplacer(find, replace, options)(text);
}

/**
 * Apply a compiled `matcher` to the whole `text`, splicing in `expand(match)` for each match whose
 * byte span does **not** overlap a managed region and leaving every other byte verbatim. Because the
 * matcher runs over the full document, anchors/assertions bind to the real document; because skipped
 * matches simply fall inside the verbatim slices, managed regions pass through untouched.
 */
function applyReplacement(
  text: string,
  matcher: RegExp,
  expand: (match: RegExpMatchArray, source: string) => string,
): ReplaceResult {
  const ranges = managedRanges(text);
  const overlapsManaged = (start: number, length: number): boolean =>
    ranges.some((r) => start < r.end && start + length > r.start);

  let result = "";
  let last = 0;
  let count = 0;
  for (const match of text.matchAll(matcher)) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (matched.length === 0) {
      // A zero-width pattern that slipped past the compile-time probe (rare): refuse rather than
      // loop forever or splice between characters. Validation up front makes this practically dead.
      throw zeroWidthError();
    }
    if (overlapsManaged(start, matched.length)) {
      continue; // a match inside (or crossing into) a managed region — leave it, don't count it
    }
    result += text.slice(last, start) + expand(match, text);
    last = start + matched.length;
    count++;
  }
  result += text.slice(last);
  return count === 0 ? { text, count } : { text: result, count };
}

/** Compile a user regex as global, mapping a syntax error to a `usage` {@link LoreError} (exit 2). */
function compileRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, "g");
  } catch (cause) {
    throw new LoreError(
      "usage",
      `invalid regex "${pattern}": ${cause instanceof Error ? cause.message : String(cause)}`,
      "fix the regular expression, or drop --regex to match it as a literal string",
    );
  }
}

/**
 * Reject a pattern that can match the empty string, before it is ever applied. A global zero-width
 * match would make `replace` insert the replacement between every character (mass corruption), which
 * the empty-`find` guard exists to prevent but a regex like `x*`/`\b` slips past. Detected by probing
 * the matcher against the empty string and a representative {@link ZERO_WIDTH_PROBE} (word
 * boundaries, a line end, digits, punctuation); a zero-length match in either is fatal. `matchAll`
 * clones the regex, so probing does not disturb the matcher's later use.
 */
function assertNonEmptyMatching(matcher: RegExp): void {
  for (const probe of ["", ZERO_WIDTH_PROBE]) {
    for (const match of probe.matchAll(matcher)) {
      if (match[0].length === 0) {
        throw zeroWidthError();
      }
    }
  }
}

/** The `usage` {@link LoreError} for a pattern that can match the empty string. */
function zeroWidthError(): LoreError {
  return new LoreError(
    "usage",
    "the pattern can match an empty string, which would replace between every character",
    "refine the pattern so every match has length (e.g. require at least one character)",
  );
}

/**
 * Expand a regex replacement `template` against one `match` exactly as `String.prototype.replace`
 * does: `$$`→`$`, `$&`→the match, `` $` ``→the prefix, `$'`→the suffix, `$<name>`→a named group, and
 * `$n`/`$nn`→a numbered group (greedy two digits when that group exists, else one digit plus the
 * literal digit; an out-of-range number is left literal). This is what lets the single whole-document
 * pass keep native substitution semantics while still skipping managed regions.
 */
function expandTemplate(template: string, match: RegExpMatchArray, source: string): string {
  const groups = match.length - 1;
  const index = match.index ?? 0;
  return template.replace(/\$(\$|&|`|'|<[^>]*>|\d\d?)/g, (whole, selector: string): string => {
    if (selector === "$") {
      return "$";
    }
    if (selector === "&") {
      return match[0];
    }
    if (selector === "`") {
      return source.slice(0, index);
    }
    if (selector === "'") {
      return source.slice(index + match[0].length);
    }
    if (selector.startsWith("<")) {
      return match.groups?.[selector.slice(1, -1)] ?? "";
    }
    // Numeric: greedily prefer the two-digit group, then fall back to one digit + the literal digit.
    const n = Number.parseInt(selector, 10);
    if (n >= 1 && n <= groups) {
      return match[n] ?? "";
    }
    if (selector.length === 2) {
      const first = Number.parseInt(selector[0] as string, 10);
      if (first >= 1 && first <= groups) {
        return `${match[first] ?? ""}${selector[1]}`;
      }
    }
    return whole; // an out-of-range group number is left literal, as String.replace does
  });
}

/** Escape a literal string for use as a `RegExp` source (every regex metacharacter neutralized). */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge overlapping/touching ranges into a sorted, non-overlapping list (ascending by start).
 * Exported because it is the general invariant {@link managedRanges} relies on now that the marker
 * registry holds more than one kind: two different managed blocks (e.g. a `lore:tasks` block
 * adjacent to an `index` block) can produce ranges that touch or nest, and a clean partition for
 * {@link applyReplacement} needs them collapsed. A nested range (fully inside another) is absorbed; a
 * touching one (`start === prev.end`) is joined so no zero-width author gap is left between them.
 */
export function mergeRanges(ranges: TextRange[]): TextRange[] {
  if (ranges.length <= 1) {
    return ranges;
  }
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: TextRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      if (range.end > last.end) {
        merged[merged.length - 1] = { start: last.start, end: range.end };
      }
    } else {
      merged.push(range);
    }
  }
  return merged;
}
