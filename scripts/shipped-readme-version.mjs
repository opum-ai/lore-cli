#!/usr/bin/env node
/**
 * shipped-readme-version.mjs — generator AND release gate for the version-bearing lines of the
 * README that npm serves as this package's landing page (LCLI-510).
 *
 * THE DEFECT THIS EXISTS FOR, stated as the measurement rather than the lesson. On 2026-09-15,
 * `npm view @opum-ai/lore@0.7.0 readme` served a README asserting `0.6.2` on three lines. The
 * npm landing page for the current release told a reader the current release was the previous
 * one. The cause is ordering and not forgetfulness: a sentence saying "0.7.0 is released" cannot
 * honestly be written before 0.7.0 is released, so the bump lands after the tag and the tag
 * therefore always carries the prior version's README. `package.json`'s `files` list ships
 * `README.md`, so that file is what the registry serves. quest-cli had the identical defect from
 * a different cause, which is why the remedy is written as assertions about an artifact rather
 * than as a step in a runbook.
 *
 * THE CONTRACT. Five assertions agreed between lore-cli and quest-cli, recorded in opum-doc at
 * `docs/reference/shipped-readme-version-assertions.md`. Read it there, not here — this docblock
 * records only what THIS implementation does and why it diverges where it does. Cited SHA at the
 * time of writing: `opum-ai/opum-doc` main@ba3055d, superseding d56ea3f, b596ca5, 7af9f7d, 0708fe5 and 0af2525.
 *
 * WHICH CLAUSES THIS SCRIPT EXERCISES. A5 asks each implementation to say which clauses it
 * EXERCISES, not which it enforces, because "enforces A3" is a conjunction that hides a clause
 * passing vacuously. Per clause:
 *
 *   A1  exercised — `--tarball` reads README.md out of a real `npm pack` artifact. `--check`
 *                   reads the worktree and is explicitly NOT the gate; see its docblock.
 *   A2  exercised, GENERATED arm. quest-cli took the ABSENT arm. That difference is the whole
 *       reason A5 exists: quest's shipped README has zero version tokens, so its byte-equality
 *       clause is vacuous BY CONSTRUCTION — there is no generator there for it to guard. This
 *       repository is the only side of the contract that will ever exercise clause 2, so a
 *       byte-equality defect here is invisible in quest and quest going green says nothing
 *       about it either way. Two green repositories are COVERAGE, not corroboration.
 *   A3.1 exercised — every declared region is present. Per region, because this file has two.
 *   A3.2 exercised — each region's content is byte-equal to what `generate()` produces for
 *        `package.json`'s version. This is the clause a broken generator trips, which is the
 *        second job byte-equality does beyond catching a stale hand-edit.
 *   A3.3 exercised, as BLOCK-SCOPED adjacency rather than the line-scoped form the contract
 *        states as a floor. See "WHY BLOCK-SCOPED" below.
 *   A4  NOT exercised here. The post-publish read-back lives in the release workflow, which is
 *       where the registry is reachable; this script never talks to a registry.
 *
 * WHY TWO REGIONS AND NOT ONE. A3 is phrased in the singular ("a marked region ... outside it").
 * This README's stale sites are not contiguous: a bullet in the feature list, and a `Status:`
 * sentence in a blockquote six lines later. One region spanning both would swallow two
 * hand-written bullets, and extending it to the end of the blockquote would enclose "`0.7.0` was
 * therefore published with `scripts/publish-release.sh` and, like `0.6.2` and `0.6.1` but unlike
 * `0.6.0` ..." — honest narration of a PAST release, still true at the next version, and not
 * derivable from `package.json`. A generator would have to fabricate history to satisfy
 * byte-equality, which is a worse outcome than the defect. So: two regions, clauses 1 and 2
 * applied per region. Confirmed with opum-doc 2026-09-15; the singular is being corrected there.
 *
 * WHY BLOCK-SCOPED ADJACENCY, and why not the two alternatives. Clause 3 as the contract states
 * it — the package's own name adjacent to a version — catches exactly ONE of this README's three
 * stale sites, because the `Status:` line carries no package name at all; its nearest
 * `@opum-ai/lore*` is on the following line, inside the same blockquote. Any same-line window
 * misses it and any window wide enough to reach it is wide enough to mean nothing. So adjacency
 * is computed over the enclosing BLOCK: a maximal run of lines delimited by a blank line or by a
 * blockquote-internal blank (a line that is `>` alone). A block fails when it contains BOTH this
 * package's own npm name AND a version token.
 *
 *   NOT quest-cli's rule ("no version token anywhere outside a region"). It is free for them —
 *   their file has zero tokens — and unusable here: this README carries nine legitimate
 *   non-package version tokens (Backlog.md `>=1.49.0`, Bun `1.3.14`, historical `0.2.0`/`0.6.x`).
 *   The same rule is a clean check there and nine false positives here.
 *
 *   NOT a closed set of this package's own released values. That reads tighter and is wrong: it
 *   condemns the line narrating how `0.6.2` shipped, and every other honest citation of a past
 *   version. Withdrawn after opum-doc recounted the stale sites — the object being counted was
 *   "lines carrying the old string" when the claim needed "lines asserting a stale CURRENT
 *   version", and those differ by exactly the historical line.
 *
 * WHY REGIONS ARE MASKED BYTE-WISE AND NOT LINE-WISE. "Outside the region" means outside the
 * region's BYTES, not outside the lines it touches. Excising whole lines would let a stale
 * `@opum-ai/lore@0.6.2` hide by sitting on the same line as a region marker, which is the shape
 * most likely to occur because the generated text and the stale text are usually about the same
 * thing. So region content is overwritten with spaces, preserving line and column positions, and
 * clause 3 runs over the masked text. Block STRUCTURE is read from the original text so that
 * masking a whole line cannot silently split a block and let a pair escape across the seam.
 *
 * THE WINDOW THIS DOES NOT CLOSE, named so nobody re-derives it as a finding. Between `npm pack`
 * and `npm publish` the packed README says "<version> released" of a version that is not yet
 * published. No user ever reads that tarball — it is a dry-run artifact until publication — and
 * the alternative is prose that never states a release at all, which is a separate editorial
 * decision and not what A2 asks for. A2 asks that the NUMBER not be hand-maintained.
 *
 * MODES
 *   --write              rewrite every region in README.md from package.json. Markers must
 *                        already exist; this never invents them.
 *   --check              clauses 1-3 against the WORKTREE files. Cheap early feedback. NOT the
 *                        gate: A1's subject is the packed artifact, and a worktree check can
 *                        pass while the packed file is stale.
 *   --tarball <file>     clauses 1-3 against `package/README.md` and `package/package.json`
 *                        inside an `npm pack` tarball. THIS is the gate.
 *
 * Every mode also checks two things the shared contract does not have, both local to putting
 * generated regions in a RENDERED document: that no marker begins its line, and that clause 3's
 * escape hatch is used rather than the predicate widened. See `assertInlineMarkers` and
 * `ALLOW_BEGIN`.
 *
 * EXIT CODES
 *   0  every declared assertion held
 *   1  at least one assertion failed; every failure is printed, not just the first
 *   2  usage error, or an input that could not be read
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Markers are deliberately INLINE-CAPABLE: an HTML comment alone on a line starts a CommonMark
 * HTML block, which would break the bullet list and the blockquote these regions live in. Put at
 * the end of a line of prose, a comment is inline content and renders as nothing. That is why the
 * region is a byte span rather than a line range.
 */
const BEGIN = (id) => `<!--lore-version:${id}:begin-->`;
const END = (id) => `<!--lore-version:${id}:end-->`;

/** Every generated region this README declares. Order is the order failures are reported in. */
const REGION_IDS = ["published-bullet", "status"];

/**
 * THE SANCTIONED WAY PAST CLAUSE 3, and the reason nobody should ever loosen the matcher.
 *
 * Clause 3 refuses this package's own name next to a version outside a generated region. Some
 * day a legitimate sentence will need exactly that — "`@opum-ai/lore@0.6.0` was the last release
 * carrying a provenance attestation" is honest, is history, and is not derivable from
 * package.json, so it can never live in a generated region. Without a sanctioned exemption the
 * next person widens the predicate, and a predicate widened once measures less forever.
 *
 * An allow span is HAND-WRITTEN and deliberately NOT byte-checked — there is nothing to generate
 * it from. It is masked for clause 3 only. Byte-equality does not apply to it, and the
 * inline-marker rendering rule does, because it is still a marker in a rendered file.
 *
 * It is repeatable, unlike the generated regions, which are keyed by id and must appear once.
 */
const ALLOW_BEGIN = "<!--lore-version:allow:begin-->";
const ALLOW_END = "<!--lore-version:allow:end-->";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/**
 * A version token, matched loosely on purpose. Clause 3 is a floor and a floor that misses
 * `1.2.3-rc.1` is not one. Anchored on a digit boundary so `1.3.14` is one token rather than two
 * and so `v0.7.0` matches at the digits.
 */
const VERSION_TOKEN = /(?<![\w.])\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?![\w.])/;

/** Narrow an unknown thrown value to something printable, without swallowing a non-Error. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function numberWord(n) {
  const word = NUMBER_WORDS[n];
  if (word === undefined) {
    throw new Error(`no spelled-out form for ${n}; extend NUMBER_WORDS or reword the template`);
  }
  return word;
}

/**
 * The generated content of every region, keyed by id, derived from package.json alone.
 *
 * WHY EACH REGION STARTS MID-SENTENCE, which looks arbitrary and is not. A CommonMark HTML
 * block (type 2) starts at any line whose content begins with `<!--`, and runs to the line
 * containing `-->` INCLUSIVE — so everything after a line-initial marker on that same line is
 * emitted as raw text. Measured against GitHub's own renderer (`POST /markdown`): with the
 * begin marker first in the line, the npm page showed a literal `**Status: 0.7.0 released.**`,
 * asterisks and all. Anchoring each marker AFTER some hand-written text on its line makes it
 * inline HTML, which renders as nothing. `assertInlineMarkers` keeps it that way.
 *
 * Line breaks inside a template are LITERAL and fixed. A generator that re-wraps to a column
 * would make byte-equality depend on the version string's length, so a two-digit minor would
 * reflow the paragraph and the diff would stop being about the version. Fixed break points keep
 * every release's diff to the numbers that actually changed.
 */
function generate(pkg) {
  const platforms = Object.keys(pkg.optionalDependencies ?? {});
  const platformCount = platforms.length;
  // Seven public packages = six platform packages plus the launcher itself.
  const publicCount = platformCount + 1;
  // Derived rather than asserted: the sentence is only true while win32-arm64 actually ships.
  const windowsArm = platforms.includes(`${pkg.name}-win32-arm64`) ? ", including Windows ARM64" : "";

  return new Map([
    [
      "published-bullet",
      ` **\`${pkg.name}@${pkg.version}\`** (bin \`lore\`) with ${numberWord(platformCount)}\n  exact-pinned platform packages${windowsArm}.`,
    ],
    [
      "status",
      ` ${pkg.version} released.** Tag \`v${pkg.version}\`, the qualified workflow artifacts,\n> all ${numberWord(publicCount)} public \`${pkg.name}*\` npm packages with \`latest\` moved on each,\n> and a clean-registry install agree on \`${pkg.version}\`.`,
    ],
  ]);
}

/**
 * Locate every declared region as a byte span.
 *
 * Returns `{ regions, problems }` rather than throwing, because clause 1 failures are findings to
 * report alongside the others, not crashes. A marker that appears twice is a finding too: a
 * duplicated BEGIN silently changes which bytes the next release regenerates.
 */
function locateRegions(text) {
  const regions = new Map();
  const problems = [];

  for (const id of REGION_IDS) {
    const begin = BEGIN(id);
    const end = END(id);
    const beginAt = text.indexOf(begin);
    const endAt = text.indexOf(end);

    if (beginAt === -1 || endAt === -1) {
      problems.push(
        `A3.1 region "${id}": marker missing — ${beginAt === -1 ? begin : end} does not appear. ` +
          "Restore it; `--write` rewrites regions but never invents markers.",
      );
      continue;
    }
    if (text.indexOf(begin, beginAt + begin.length) !== -1 || text.indexOf(end, endAt + end.length) !== -1) {
      problems.push(`A3.1 region "${id}": a marker appears more than once, so the region's extent is ambiguous.`);
      continue;
    }
    if (endAt < beginAt) {
      problems.push(`A3.1 region "${id}": the end marker precedes the begin marker.`);
      continue;
    }
    regions.set(id, { start: beginAt + begin.length, end: endAt });
  }

  return { regions, problems };
}

/**
 * Every hand-written allow span, as byte ranges. Repeatable, so this walks rather than indexOf-ing
 * once. An unterminated span is a finding rather than a silent run-to-end-of-file: the difference
 * between "exempt this sentence" and "exempt the rest of the README" is the whole value of it.
 */
function locateAllowSpans(text) {
  const spans = [];
  const problems = [];
  let cursor = 0;
  while (true) {
    const begin = text.indexOf(ALLOW_BEGIN, cursor);
    if (begin === -1) break;
    const end = text.indexOf(ALLOW_END, begin + ALLOW_BEGIN.length);
    if (end === -1) {
      problems.push(
        `ALLOW span opened at offset ${begin} is never closed with ${ALLOW_END}. An unterminated ` +
          "exemption would silently exempt the rest of the file, so it is refused instead.",
      );
      break;
    }
    spans.push({ start: begin + ALLOW_BEGIN.length, end });
    cursor = end + ALLOW_END.length;
  }
  const stray = text.indexOf(ALLOW_END);
  if (stray !== -1 && spans.every((s) => s.end !== stray) && problems.length === 0) {
    problems.push(`ALLOW end marker at offset ${stray} has no matching ${ALLOW_BEGIN}.`);
  }
  return { spans, problems };
}

/**
 * Overwrite every region's bytes with spaces, preserving newlines so line and column numbers are
 * unchanged. Everything outside a region — including hand-written prose sharing a line with a
 * marker — survives verbatim, which is the point.
 */
function maskRegions(text, spans) {
  const chars = [...text];
  for (const { start, end } of spans) {
    for (let i = start; i < end; i += 1) {
      if (chars[i] !== "\n") chars[i] = " ";
    }
  }
  return chars.join("");
}

/**
 * Split into blocks: maximal runs of lines delimited by a blank line, or by a blockquote-internal
 * blank (`>` alone, optionally with trailing spaces), which is what separates paragraphs inside
 * one blockquote.
 *
 * Structure comes from the ORIGINAL lines. Reading it from the masked text instead would let a
 * fully-masked line read as blank and split a block that is really one paragraph, which would
 * hide a name/version pair straddling the seam.
 */
function splitBlocks(originalLines) {
  const blocks = [];
  let current = null;
  originalLines.forEach((line, index) => {
    const isBreak = /^\s*$/.test(line) || /^\s*>\s*$/.test(line);
    if (isBreak) {
      current = null;
      return;
    }
    if (current === null) {
      current = { first: index, last: index };
      blocks.push(current);
    } else {
      current.last = index;
    }
  });
  return blocks;
}

/**
 * Clause 3. A block outside the regions may not carry this package's own npm name alongside a
 * version token.
 *
 * The name pattern covers the launcher and its platform packages (`@opum-ai/lore`,
 * `@opum-ai/lore-darwin-arm64`, `@opum-ai/lore*`) but nothing wider: the bare word "lore" appears
 * on most lines of this README and matching it would make the clause unusable, which is how a
 * check gets loosened until it measures nothing.
 */
function checkAdjacency(text, regions, allowSpans, pkgName) {
  const originalLines = text.split("\n");
  const maskedLines = maskRegions(text, [...regions.values(), ...allowSpans]).split("\n");
  const namePattern = new RegExp(`${pkgName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-[a-z0-9]+(?:-[a-z0-9]+)*|\\*)?`);

  const problems = [];
  for (const { first, last } of splitBlocks(originalLines)) {
    let nameHit = null;
    let versionHit = null;
    for (let i = first; i <= last; i += 1) {
      const line = maskedLines[i] ?? "";
      if (nameHit === null && namePattern.test(line)) {
        nameHit = { line: i + 1, text: (originalLines[i] ?? "").trim() };
      }
      const version = versionHit === null ? line.match(VERSION_TOKEN) : null;
      if (version !== null) versionHit = { line: i + 1, match: version[0] };
    }
    if (nameHit && versionHit) {
      problems.push(
        `A3.3 clause 3: the block at lines ${first + 1}-${last + 1} carries this package's own name ` +
          `(line ${nameHit.line}) and the version token "${versionHit.match}" (line ${versionHit.line}) ` +
          "outside every generated region.\n" +
          `    line ${nameHit.line}: ${nameHit.text}\n` +
          `    line ${versionHit.line}: ${(originalLines[versionHit.line - 1] ?? "").trim()}\n` +
          "    Either move the claim inside a region so it is generated from package.json, or drop the " +
          "version from it. Adjacency is computed over the enclosing block, not the line.",
      );
    }
  }
  return problems;
}

/**
 * A marker may never be the first thing on its line.
 *
 * A CommonMark HTML block starts at a line whose content begins with `<!--` and swallows the
 * REST OF THAT LINE as raw text, so a line-initial begin marker makes the generated sentence
 * render as literal asterisks and backticks on the npm page. This is a RENDERING assertion
 * rather than a version one, and it is checked here because it is the failure mode a future
 * hand-edit or a re-wrapped template reintroduces silently: the version would still be correct,
 * and the page would still be wrong.
 *
 * "First thing on its line" means after any Markdown container prefix — list bullet, blockquote
 * `>`, indentation — because those are stripped before the HTML-block rule is applied.
 */
function assertInlineMarkers(text) {
  const problems = [];
  text.split("\n").forEach((line, index) => {
    const content = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)?(?:>\s?)*\s*/, "");
    if (!content.startsWith("<!--lore-version:")) return;
    problems.push(
      `RENDERING, line ${index + 1}: a region marker is the first content on its line, so ` +
        "CommonMark reads it as an HTML block and emits the rest of the line as RAW TEXT. On the " +
        "npm page the generated sentence renders as literal `**` and backticks.\n" +
        `    ${line.trim()}\n` +
        "    Anchor the marker after some hand-written text on the same line instead.",
    );
  });
  return problems;
}

/** Clauses 1, 2 and 3 over one README/package.json pair. Returns every problem found. */
function assertAll(readmeText, pkg, subject) {
  const { regions, problems } = locateRegions(readmeText);
  const { spans: allowSpans, problems: allowProblems } = locateAllowSpans(readmeText);
  problems.push(...allowProblems);
  const expected = generate(pkg);

  for (const id of REGION_IDS) {
    const region = regions.get(id);
    if (!region) continue; // clause 1 already reported it
    const actual = readmeText.slice(region.start, region.end);
    const want = expected.get(id);
    if (actual !== want) {
      problems.push(
        `A3.2 region "${id}": content is not byte-equal to what the generator produces for ` +
          `${pkg.name}@${pkg.version}.\n` +
          `    packed:    ${JSON.stringify(actual)}\n` +
          `    generated: ${JSON.stringify(want)}\n` +
          "    Run `node scripts/shipped-readme-version.mjs --write` and commit the result.",
      );
    }
  }

  problems.push(...checkAdjacency(readmeText, regions, allowSpans, pkg.name));
  problems.push(...assertInlineMarkers(readmeText));

  if (problems.length > 0) {
    console.error(`::error::${subject}: ${problems.length} shipped-README version assertion(s) failed`);
    for (const problem of problems) console.error(`\n${problem}`);
    return 1;
  }
  console.log(
    `${subject}: README version assertions hold for ${pkg.name}@${pkg.version} ` +
      `(${REGION_IDS.length} generated regions byte-equal, ${allowSpans.length} hand-written allow ` +
      "span(s), no name/version pair outside any of them).",
  );
  return 0;
}

/**
 * Read `package/<path>` out of an npm tarball.
 *
 * RUN FROM THE TARBALL'S OWN DIRECTORY, passing a bare filename. GNU tar — which is what is on
 * PATH on a Windows runner — reads `C:\\...` as a `host:path` remote spec and fails with
 * "Cannot connect to C: resolve failed". `--force-local` fixes that and does not exist in the
 * bsdtar macOS ships, so there is no flag that is right on both. A relative name has no colon,
 * which is right everywhere and needs no platform branch.
 */
function readFromTarball(tarball, path) {
  const absolute = resolve(tarball);
  try {
    return execFileSync("tar", ["-xzOf", basename(absolute), `package/${path}`], {
      cwd: dirname(absolute),
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`could not read package/${path} from ${tarball}: ${messageOf(error)}`);
  }
}

function writeRegions(root) {
  const readmePath = join(root, "README.md");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const original = readFileSync(readmePath, "utf8");
  const { regions, problems } = locateRegions(original);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    return 1;
  }

  const expected = generate(pkg);
  // Apply last region first so earlier offsets stay valid.
  const ordered = [...regions.entries()].sort((a, b) => b[1].start - a[1].start);
  let text = original;
  for (const [id, { start, end }] of ordered) {
    text = text.slice(0, start) + expected.get(id) + text.slice(end);
  }

  if (text === original) {
    console.log(`README.md regions already match ${pkg.name}@${pkg.version}; nothing to write.`);
    return 0;
  }
  writeFileSync(readmePath, text);
  console.log(`README.md regions rewritten for ${pkg.name}@${pkg.version}.`);
  return 0;
}

function parseArgs(argv) {
  if (argv.length === 2 && argv[0] === "--tarball") return { mode: "tarball", tarball: argv[1] };
  // `--dir` exists so the tests can drive both modes against a fixture tree. Without it the
  // round-trip test would have to restate the generator, and a test carrying its own copy of the
  // thing it checks passes happily while the two drift apart.
  const mode = argv[0] === "--write" ? "write" : argv[0] === "--check" ? "check" : null;
  if (mode === null) return null;
  if (argv.length === 1) return { mode };
  if (argv.length === 3 && argv[1] === "--dir") return { mode, dir: argv[2] };
  return null;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options === null) {
    console.error("usage: shipped-readme-version.mjs (--write | --check [--dir <path>] | --tarball <file.tgz>)");
    return 2;
  }

  try {
    if (options.mode === "tarball") {
      const readme = readFromTarball(options.tarball, "README.md");
      const pkg = JSON.parse(readFromTarball(options.tarball, "package.json"));
      return assertAll(readme, pkg, `packed ${options.tarball}`);
    }

    const root = options.dir ? resolve(options.dir) : REPO_ROOT;
    if (options.mode === "write") return writeRegions(root);
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return assertAll(readme, pkg, `worktree ${root}`);
  } catch (error) {
    console.error(`::error::${messageOf(error)}`);
    return 2;
  }
}

process.exit(main());
