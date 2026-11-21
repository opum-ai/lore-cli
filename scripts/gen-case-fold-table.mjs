// scripts/gen-case-fold-table.mjs — regenerate src/adapters/case-fold-table.ts (LCLI-791, LCLI-807)
//
// WHY THIS TABLE EXISTS (DEC-282 (a12)). lore's one-list rollup index, `lore link`'s read path and
// Quest's own `findTask` must fold a task reference EXACTLY as quest-cli's `aliasKey` does --
// `caseFold(alias.normalize("NFC"))` (quest-cli src/domain/records.ts, unicode-case-folding@1.1.1) --
// or the same reference matches on one read path and misses (or fails to be ambiguous) on another.
//
// WHY THE FULL MAP, NOT A toLowerCase DELTA. An earlier revision carried only the 297 code points where
// Unicode DEFAULT case folding disagreed with `String.prototype.toLowerCase()`, and let `toLowerCase`
// fold every OTHER code point. CI then measured that `toLowerCase` itself differs by Bun generation
// (the pinned CI bun, Unicode 15.x, folds fewer code points than a local Bun on Unicode 17), so a
// binary built on an older Bun folded fewer characters than quest does. The table is now the FULL
// FOLDING_MAP from unicode-case-folding@1.1.1 -- every key the library maps, in ascending code point
// order -- and the reader folds each code point through it with NO `toLowerCase` fallback. A code
// point absent from the map folds to itself, which is the library's own semantics (`caseFold` pushes
// the char unchanged when the map has no entry). The pair shares one fold table; a change to it is a
// pair change. Only lore's half is pinned today (the digest test fails if lore's table moves); quest
// carries no pin yet, so a lag in quest's half is not caught by either repository's CI.
//
// SOURCE OF TRUTH: the `unicode-case-folding` package's FOLDING_MAP, the exact library quest-cli's
// `aliasKey` calls. This script reads that map out of the package's `index.js` and emits every entry
// as `<code point><folded output>`, one per line, ascending by code point. It does NOT execute the
// library -- it parses the `new Map([...])` literal, exactly as before.
//
// NOT WIRED INTO CI OR A RELEASE GATE, by design: it needs the package that lore deliberately does not
// depend on. Run it by hand only when the library quest pins moves. The committed table is pinned by
// test/lcli791-quest-rollup.test.ts (entry count + sha256 of the data, and a per-entry agreement
// check), so ordinary drift is caught without this script; the script is how the pinned bytes are
// (re)derived and differentially checked.
//
// USAGE
//   npm pack unicode-case-folding@1.1.1 --pack-destination /tmp
//   tar -xzf /tmp/unicode-case-folding-1.1.1.tgz -C /tmp
//   node scripts/gen-case-fold-table.mjs --lib /tmp/package/index.js
//       Print the generated module plus the entry count and sha256 to pin.
//   node scripts/gen-case-fold-table.mjs --lib /tmp/package/index.js --ts src/adapters/case-fold-table.ts
//       Differential CHECK: recompute from the library and compare with the committed table EXACTLY
//       (order and content); exit 1 on any missing, spurious or out-of-order entry, naming them.
//   node scripts/gen-case-fold-table.mjs --lib /tmp/package/index.js --ts src/adapters/case-fold-table.ts --write
//       Replace the committed module with the regenerated one (then let biome format the file).
//
// REPRODUCIBILITY: unicode-case-folding@1.1.1 tarball shasum 644d22adc0eb8ff806d6e34640f2ce6241853fcd,
// integrity sha512-ZAYziAnMTBisO2dT5tyGvBFMNsIfonOS/BZTd3UZaKWtXMOZqK8s8HRUCrlKxGCTeCxCuCjS/6HW+4a6G+rbzw==.
// Assert the bytes you run against by checking that shasum before trusting the output.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BLOCK_START = "export const CASE_FOLD_TABLE_DATA =";
// Wrap the emitted string literals at roughly this many UTF-16 code units of table per line.
const LINE_BUDGET = 110;

/** Read and parse the FOLDING_MAP literal from the unicode-case-folding `index.js`. */
function loadFoldingMap(libPath) {
  const source = readFileSync(libPath, "utf8");
  const match = /const FOLDING_MAP = new Map\(([\s\S]*?)\);/.exec(source);
  if (match === null) throw new Error(`no FOLDING_MAP literal found in ${libPath}`);
  const body = match[1];
  if (body === undefined) throw new Error(`no FOLDING_MAP body found in ${libPath}`);
  /** @type {[number, number[]][]} */
  const pairs = JSON.parse(body);
  return new Map(pairs);
}

/**
 * The FULL table: every entry of the library's FOLDING_MAP, `<code point><fold output>`, ascending by
 * code point. Code points the map omits need no entry -- the reader folds them to themselves.
 *
 * @param {Map<number, number[]>} foldingMap
 * @returns {string[]}
 */
function buildEntries(foldingMap) {
  const entries = [];
  for (const [codePoint, mapped] of foldingMap) {
    entries.push(String.fromCodePoint(codePoint) + String.fromCodePoint(...mapped));
  }
  // Ascending code point order, pinned so the committed bytes are deterministic.
  entries.sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));
  return entries;
}

/** Render the entries as the `export const CASE_FOLD_TABLE_DATA = ...;` TypeScript block. */
function formatBlock(entries) {
  const chunks = [];
  let current = [];
  let budget = 0;
  for (const entry of entries) {
    // +1 for the "\n" that separates this entry from the previous one in the same chunk.
    const cost = entry.length + (current.length === 0 ? 0 : 1);
    if (current.length > 0 && budget + cost > LINE_BUDGET) {
      chunks.push(`${current.join("\n")}\n`);
      current = [];
      budget = 0;
    }
    current.push(entry);
    budget += cost;
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  const literals = chunks.map((chunk) => JSON.stringify(chunk));
  return `${BLOCK_START}\n  ${literals.join(" +\n  ")};`;
}

/** The whole generated module: header, the data block with its entry count, and the parsed map. */
function formatModule(entries, digest) {
  const header = [
    "// GENERATED FILE -- do not edit by hand. Regenerate with scripts/gen-case-fold-table.mjs.",
    "//",
    "// The FULL Unicode DEFAULT case-fold map from `unicode-case-folding@1.1.1`, the exact library",
    "// quest-cli's `aliasKey` calls. Each line is one entry, `<code point><fold output>`, ascending by",
    "// code point; a newline separates entries, and a fold output may be several code points (`ss`, a",
    "// Greek iota subscript, an Armenian ligature, ...). A code point ABSENT from the table folds to",
    "// itself, which is the library's own semantics -- the reader applies NO `String.prototype.toLowerCase`",
    "// fallback, so the result does not vary by Bun generation (DEC-282 (a12)). lore and quest share this",
    "// one fold table; a change to it is a pair change. Only lore's half is pinned today: the digest pin",
    "// in test/lcli791-quest-rollup.test.ts fails if lore's table moves, and quest carries no pin of its",
    "// own yet, so a lag in quest's half is not caught by either repository's CI.",
    "//",
    `// entries: ${entries.length}`,
    `// sha256 of the newline-joined data below: ${digest}`,
    "",
  ].join("\n");
  return (
    `${header}${formatBlock(entries)}\n\n` +
    "/** One entry per line in {@link CASE_FOLD_TABLE_DATA}; pinned by the digest test. */\n" +
    `export const CASE_FOLD_TABLE_ENTRY_COUNT = ${entries.length};\n\n` +
    "/**\n" +
    " * The table parsed: the first code point of each line is the key, the remainder its replacement\n" +
    " * (one or more code points). A code point the map does not hold folds to itself.\n" +
    " */\n" +
    "export const CASE_FOLD_MAP: ReadonlyMap<string, string> = new Map(\n" +
    '  CASE_FOLD_TABLE_DATA.split("\\n").map((line) => {\n' +
    "    const key = String.fromCodePoint(line.codePointAt(0) as number);\n" +
    "    return [key, line.slice(key.length)] as const;\n" +
    "  }),\n" +
    ");\n"
  );
}

/** Read the committed table out of the generated module, with the span the data block occupies. */
function readCommitted(tsPath) {
  const source = readFileSync(tsPath, "utf8");
  const start = source.indexOf(BLOCK_START);
  if (start === -1) throw new Error(`no ${BLOCK_START} in ${tsPath}`);
  // Anchor on `;` NEWLINE, not the first `;`: the block is a run of string literals, and a `;` inside
  // one (or in a trailing comment on the same line) is not the statement terminator.
  const end = source.indexOf(";\n", start);
  if (end === -1) throw new Error(`unterminated ${BLOCK_START} in ${tsPath}`);
  const literals = source.slice(start, end).match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  const data = literals.map((literal) => JSON.parse(literal)).join("");
  return { source, start, end: end + 1, data };
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function argument(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function main() {
  const args = process.argv.slice(2);
  const libPath = argument(args, "--lib");
  if (libPath === undefined) {
    throw new Error(
      "usage: gen-case-fold-table.mjs --lib <unicode-case-folding/index.js> [--ts <case-fold-table.ts> [--write]]",
    );
  }
  const entries = buildEntries(loadFoldingMap(libPath));
  const data = entries.join("\n");
  const digest = sha256(data);
  const tsPath = argument(args, "--ts");

  if (tsPath === undefined) {
    process.stdout.write(`${formatModule(entries, digest)}\n// entries: ${entries.length}\n// sha256: ${digest}\n`);
    return;
  }

  if (args.includes("--write")) {
    writeFileSync(tsPath, formatModule(entries, digest));
    process.stdout.write(`wrote ${entries.length} entries (sha256 ${digest}) to ${tsPath}\n`);
    return;
  }

  // Differential CHECK: compare the committed full table with the library's map EXACTLY (order and
  // content), not as an unordered set.
  const committed = readCommitted(tsPath);
  const actual = committed.data.split("\n").filter((line) => line !== "");
  const missing = entries.filter((entry) => !actual.includes(entry));
  const extra = actual.filter((entry) => !entries.includes(entry));
  const inOrder = actual.length === entries.length && actual.every((entry, i) => entry === entries[i]);

  process.stdout.write(
    `committed ${actual.length} entries (sha256 ${sha256(committed.data)})\n` +
      `expected  ${entries.length} entries (sha256 ${digest})\n`,
  );
  for (const entry of missing) process.stdout.write(`  MISSING ${JSON.stringify(entry)}\n`);
  for (const entry of extra) process.stdout.write(`  EXTRA   ${JSON.stringify(entry)}\n`);
  if (!inOrder && missing.length === 0 && extra.length === 0)
    process.stdout.write("  OUT OF ORDER: the committed entries are not ascending by code point\n");
  if (!inOrder || missing.length > 0 || extra.length > 0) {
    process.exitCode = 1;
    process.stdout.write("the committed table disagrees with unicode-case-folding; re-run with --write\n");
  }
}

main();
