// scripts/gen-case-fold-table.mjs — regenerate FOLD_OVERRIDE_DATA in src/adapters/quest.ts (LCLI-791)
//
// WHY THIS TABLE EXISTS. lore's one-list rollup index must fold a task reference EXACTLY as
// quest-cli's `aliasKey` does -- `caseFold(alias.normalize("NFC"))` (quest-cli src/domain/records.ts)
// -- or the same reference can match on the per-task `task view` path and miss (or fail to be
// ambiguous) on the one-list path. JavaScript has no built-in case fold, so lore starts from
// `String.prototype.toLowerCase()` (lowercase MAPPING) and carries only the code points where Unicode
// DEFAULT case folding DISAGREES with it: the multi-code-point full foldings (ss, Greek iota
// subscript, Armenian ligatures, ...), the single-code-point foldings whose target is not their
// lowercase (final sigma, micro sign, Cherokee, ...), and the REVERSE direction -- a code point JS
// lowercases but the fold map leaves alone (the Cherokee uppercase block) is an IDENTITY override so
// lore does not lowercase what quest does not.
//
// SOURCE OF TRUTH: the `unicode-case-folding` package's FOLDING_MAP, the exact library quest-cli's
// `aliasKey` calls. This script reads that map out of the package's `index.js` and, for every code
// point U+0000..U+10FFFF, emits an override `<code point><folded output>` when `caseFold(cp)` differs
// from `cp.toLowerCase()`.
//
// A few emitted code points (U+1FBE, U+1FD3, U+1FE3 today) are CANONICALLY DECOMPOSED by NFC, and the
// reader normalizes before consulting the table, so it reaches their folded form through NFC rather
// than through the entry. The entry is still correct and is kept so the committed table stays the
// library's raw difference set byte for byte -- which is exactly what the committed-table pin checks.
//
// NOT WIRED INTO CI OR A RELEASE GATE, by design: it needs the package that lore deliberately does not
// depend on. Run it by hand only when the library quest pins moves. The committed table is pinned by
// test/lcli791-quest-rollup.test.ts (entry count + sha256 of the data), so ordinary drift is caught
// without this script; the script is how the pinned bytes are (re)derived and differentially checked.
//
// USAGE
//   npm pack unicode-case-folding@1.1.1 --pack-destination /tmp
//   tar -xzf /tmp/unicode-case-folding-1.1.1.tgz -C /tmp
//   node scripts/gen-case-fold-table.mjs --lib /tmp/package/index.js
//       Print the FOLD_OVERRIDE_DATA block plus the entry count and sha256 to pin.
//   node scripts/gen-case-fold-table.mjs --lib /tmp/package/index.js --ts src/adapters/quest.ts
//       Differential CHECK: recompute from the library and compare with the committed table; exit 1 on
//       any missing or spurious entry, naming them.
//   node scripts/gen-case-fold-table.mjs --lib /tmp/package/index.js --ts src/adapters/quest.ts --write
//       Replace the committed table with the regenerated block (then let biome format the file).
//
// REPRODUCIBILITY: unicode-case-folding@1.1.1 tarball shasum 644d22adc0eb8ff806d6e34640f2ce6241853fcd,
// integrity sha512-ZAYziAnMTBisO2dT5tyGvBFMNsIfonOS/BZTd3UZaKWtXMOZqK8s8HRUCrlKxGCTeCxCuCjS/6HW+4a6G+rbzw==.
// Assert the bytes you run against by checking that shasum before trusting the output.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const BLOCK_START = "const FOLD_OVERRIDE_DATA =";
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
 * The override entries, ascending by code point: `<code point><fold output>` when the fold differs
 * from that code point's lowercase mapping. Code points where they agree need no entry, because the
 * reader falls back to `.toLowerCase()`.
 *
 * @param {Map<number, number[]>} foldingMap
 * @returns {string[]}
 */
function buildEntries(foldingMap) {
  const entries = [];
  for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
    const char = String.fromCodePoint(codePoint);
    const lower = char.toLowerCase();
    const mapped = foldingMap.get(codePoint);
    const folded = mapped === undefined ? char : String.fromCodePoint(...mapped);
    if (folded !== lower) entries.push(char + folded);
  }
  return entries;
}

/** Render the entries as the `const FOLD_OVERRIDE_DATA = ...;` TypeScript block. */
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

/** Read the committed table out of the TypeScript source, with the span the block occupies. */
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
    throw new Error("usage: gen-case-fold-table.mjs --lib <unicode-case-folding/index.js> [--ts <quest.ts> [--write]]");
  }
  const entries = buildEntries(loadFoldingMap(libPath));
  const data = entries.join("\n");
  const block = formatBlock(entries);
  const digest = sha256(data);
  const tsPath = argument(args, "--ts");

  if (tsPath === undefined) {
    process.stdout.write(`${block}\n\n// entries: ${entries.length}\n// sha256: ${digest}\n`);
    return;
  }

  const committed = readCommitted(tsPath);
  const expected = new Set(entries);
  const actual = new Set(committed.data.split("\n").filter((line) => line !== ""));
  const missing = [...expected].filter((entry) => !actual.has(entry));
  const extra = [...actual].filter((entry) => !expected.has(entry));

  if (args.includes("--write")) {
    writeFileSync(tsPath, committed.source.slice(0, committed.start) + block + committed.source.slice(committed.end));
    process.stdout.write(`wrote ${entries.length} entries (sha256 ${digest}) to ${tsPath}\n`);
    return;
  }

  process.stdout.write(
    `committed ${actual.size} entries (sha256 ${sha256(committed.data)})\n` +
      `expected  ${entries.length} entries (sha256 ${digest})\n`,
  );
  for (const entry of missing) process.stdout.write(`  MISSING ${JSON.stringify(entry)}\n`);
  for (const entry of extra) process.stdout.write(`  EXTRA   ${JSON.stringify(entry)}\n`);
  if (missing.length > 0 || extra.length > 0) {
    process.exitCode = 1;
    process.stdout.write("the committed table disagrees with unicode-case-folding; re-run with --write\n");
  }
}

main();
