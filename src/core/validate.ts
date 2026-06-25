/**
 * validate.ts — the **pure**, aggregating engine behind `lore validate`.
 *
 * Where {@link parseConcept}/{@link validateFrontmatter} are *fail-fast* (they throw the
 * first error-tier problem they hit, which is right for the write path — lore must never
 * emit bytes it would refuse to read back), `lore validate` is a **reporter**: it must
 * surface *every* file's findings in one pass, tiered error/warning, so an author or a
 * pre-commit hook sees the whole picture rather than only the first failure (cli-surface
 * §validate, ADR-0007). This module turns that fail-fast machinery into an aggregator: it
 * runs the existing frontmatter engine per file under a try/catch, collects what it throws
 * or warns as {@link Finding}s, and layers the two checks ADR-0007 adds on top —
 * **per-type required sections** and **frontmatter quote-safety**.
 *
 * It stays within the core contract (lore-design §2.1): pure, filesystem-free, no printing
 * or `process.exit`. The command layer (`commands/validate.ts`) owns file discovery and I/O
 * and hands raw text here; this module owns the *judgement* and returns structured data.
 *
 * The tiers (ADR-0007 "How lore checks conformance"):
 *
 * - **Tier 1 — OKF §9 (error):** frontmatter parses and `type` is present/non-empty. Reuses
 *   {@link parseConcept}, whose thrown `validation` {@link LoreError} becomes one finding.
 * - **Tier 2 — per-type shape (error):** a *known* type's strict Zod schema (surfaced through
 *   the same {@link parseConcept} throw) **plus** its {@link requiredSectionsFor required body
 *   sections} (this module).
 * - **Tier 3 — extensions (warning):** an unknown `type`, an extra key on a known type, or a
 *   missing/over-long `summary` — collected from the {@link WarningCollector}.
 * - **Cross-cutting — quote-safety:** unquoted frontmatter scalars that a YAML-1.1 consumer
 *   would coerce to a non-string (or that carry a YAML indicator), so the value is
 *   parser-dependent across the bundle's target renderers ({@link quoteSafetyFindings}).
 *
 * A file that is **not a concept** (no frontmatter, an empty/`null` fence, or a bare
 * scalar/list — e.g. a hand-written `index.md`/`log.md`) is **skipped**, not failed: exactly
 * the {@link tryParseConcept} distinction {@link loadBundle} draws, so a pre-commit hook that
 * globs `*.md` does not trip over a non-concept file.
 */

import type { Nodes } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { LoreError, WarningCollector } from "../errors";
import { parseConcept, tryParseConcept } from "./concept";
import { requiredSectionsFor } from "./schema";

/** The two finding tiers (cli-contract §4.1): an `error` fails the file, a `warning` never does. */
export type Severity = "error" | "warning";

/** Which check produced a {@link Finding}, for machine consumers and grouped display. */
export type FindingRule = "frontmatter" | "required-section" | "quote-safety";

/** One tiered problem found in a single file. */
export interface Finding {
  /** `error` (fails the file / exit 6) or `warning` (advisory; fails only under `--strict`). */
  readonly severity: Severity;
  /** The check that raised it. */
  readonly rule: FindingRule;
  /** A single-line, actionable description. */
  readonly message: string;
}

/** The validation outcome for one file. */
export interface FileReport {
  /** The file's repo-relative POSIX path, as given to {@link validateConceptText}. */
  readonly path: string;
  /** The resolved concept `type`, or `undefined` for a skipped non-concept or an unparseable file. */
  readonly type?: string;
  /** Every finding for this file, in tier order (frontmatter → sections → quote-safety). */
  readonly findings: readonly Finding[];
  /** `true` when the file is not a concept and was not validated (no findings contributed). */
  readonly skipped: boolean;
  /** `true` when the file carries no error-severity finding (a warning-only or clean/skipped file). */
  readonly ok: boolean;
}

/** The aggregate report across every validated file — the `validate.report` payload. */
export interface ValidateReport {
  /** Per-file reports, in the order the files were supplied. */
  readonly files: readonly FileReport[];
  /** Total error-severity findings across all files. */
  readonly errorCount: number;
  /** Total warning-severity findings across all files. */
  readonly warningCount: number;
  /** Files skipped as non-concepts. */
  readonly skippedCount: number;
}

/**
 * Validate one file's raw bytes into a {@link FileReport}, never throwing for a *content*
 * problem — every tier is collected as a {@link Finding}.
 *
 * The frontmatter tiers reuse {@link parseConcept}: a thrown `validation` {@link LoreError}
 * (missing/invalid `type`, a mistyped known field, unparseable YAML) becomes one error
 * finding; the {@link WarningCollector} it fills (unknown type/key, summary) becomes warning
 * findings. A non-concept (no usable frontmatter) is **skipped** via {@link tryParseConcept}.
 * On a clean parse the two ADR-0007 additions run: {@link requiredSectionFindings} and
 * {@link quoteSafetyFindings}.
 *
 * A non-{@link LoreError} (a genuine bug) is *not* swallowed — it propagates, so a crash is
 * never silently dressed up as a validation finding.
 */
export function validateConceptText(path: string, raw: string): FileReport {
  // Skip a non-concept the same way the bundle walk does: tryParseConcept returns null for a
  // file with no usable frontmatter mapping, and still *throws* for a real-but-malformed one.
  let probe: ReturnType<typeof tryParseConcept>;
  try {
    probe = tryParseConcept(path, raw);
  } catch {
    // A real-but-malformed concept threw: capture the precise diagnostic as an error finding.
    return frontmatterErrorReport(path, raw);
  }
  if (probe === null) {
    return { path, findings: [], skipped: true, ok: true };
  }

  // The file is a concept. Re-run the frontmatter engine with a collector so its warnings
  // (tier 3) are captured rather than dropped; the parse cannot throw now (the probe proved
  // it parses), but we keep the try for symmetry and to satisfy the type.
  const warnings = new WarningCollector();
  let concept: ReturnType<typeof parseConcept>;
  try {
    concept = parseConcept(path, raw, { warnings });
  } catch {
    return frontmatterErrorReport(path, raw);
  }

  const findings: Finding[] = [];
  for (const message of warnings.list()) {
    findings.push({ severity: "warning", rule: "frontmatter", message });
  }
  findings.push(...requiredSectionFindings(concept.type, concept.body));
  findings.push(...quoteSafetyFindings(raw));

  return finalize(path, concept.type, findings);
}

/**
 * Validate a list of `{ path, raw }` files into one aggregate {@link ValidateReport}, optionally
 * narrowed to a single `type`. Pure over its inputs (the command layer does the reading), so the
 * aggregation and the `--type` filter are testable without the filesystem.
 *
 * `type` (the `--type <T>` flag, already canonicalized by the caller) keeps only the files whose
 * resolved concept type matches case-insensitively; a skipped non-concept or an unparseable file
 * (neither of which has a confirmed type) is dropped from a type-filtered run, since its type
 * cannot be confirmed to match.
 */
export function validateFiles(files: readonly { path: string; raw: string }[], type?: string): ValidateReport {
  const wanted = type?.toLowerCase();
  const reports: FileReport[] = [];
  for (const file of files) {
    const report = validateConceptText(file.path, file.raw);
    if (wanted !== undefined && report.type?.toLowerCase() !== wanted) {
      continue;
    }
    reports.push(report);
  }
  return summarize(reports);
}

/** Tally per-file reports into the aggregate counts (errors, warnings, skips). */
export function summarize(files: readonly FileReport[]): ValidateReport {
  let errorCount = 0;
  let warningCount = 0;
  let skippedCount = 0;
  for (const file of files) {
    if (file.skipped) {
      skippedCount++;
    }
    for (const finding of file.findings) {
      if (finding.severity === "error") {
        errorCount++;
      } else {
        warningCount++;
      }
    }
  }
  return { files, errorCount, warningCount, skippedCount };
}

/**
 * Assemble a non-skipped {@link FileReport}, deriving `ok` from the absence of any error-severity
 * finding (a warning-only file is still `ok` — warnings never fail a file, cli-contract §4.1).
 */
function finalize(path: string, type: string, findings: readonly Finding[]): FileReport {
  const ok = !findings.some((finding) => finding.severity === "error");
  return { path, type, findings, skipped: false, ok };
}

/**
 * The error report for a malformed concept: re-run {@link parseConcept} to capture the precise
 * `validation` {@link LoreError} message as a single error finding. Reached only after a parse
 * is known to throw, so the catch's fallback message is defensive (it should never fire).
 */
function frontmatterErrorReport(path: string, raw: string): FileReport {
  let message = `${path}: frontmatter is invalid`;
  try {
    parseConcept(path, raw);
  } catch (err) {
    message = err instanceof LoreError ? err.message : message;
  }
  const findings: Finding[] = [{ severity: "error", rule: "frontmatter", message }];
  return { path, findings, skipped: false, ok: false };
}

// ── Tier 2: required body sections ─────────────────────────────────────────────—

/**
 * The required-section findings for a concept body: one **error** per
 * {@link requiredSectionsFor required `##` heading} the body does not carry. Matching is
 * case-insensitive on trimmed heading text, so `## status` satisfies a `Status` requirement.
 * A type with no required sections (every unknown type, and Epic/Spec/Runbook/Reference under
 * the minimal policy) yields nothing.
 */
function requiredSectionFindings(type: string, body: string): Finding[] {
  const required = requiredSectionsFor(type);
  if (required.length === 0) {
    return [];
  }
  const present = new Set(h2Headings(body).map((heading) => heading.trim().toLowerCase()));
  const findings: Finding[] = [];
  for (const section of required) {
    if (!present.has(section.toLowerCase())) {
      findings.push({
        severity: "error",
        rule: "required-section",
        message: `${type} is missing the required "## ${section}" section`,
      });
    }
  }
  return findings;
}

/**
 * The text of every depth-2 (`##`) heading in a markdown body, in document order. Extraction
 * defers to a CommonMark parser (`mdast-util-from-markdown`) so a `## ` that appears inside a
 * fenced/indented code block is **not** mistaken for a heading — matching how {@link loadBundle}
 * extracts links. The walk is iterative (an explicit stack) for the same reason bundle.ts's is:
 * a pathologically deep body must not overflow the call stack.
 */
function h2Headings(body: string): string[] {
  const headings: string[] = [];
  const stack: Nodes[] = [fromMarkdown(body)];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      break;
    }
    if (node.type === "heading" && node.depth === 2) {
      headings.push(nodeText(node));
    }
    if ("children" in node) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child !== undefined) {
          stack.push(child);
        }
      }
    }
  }
  return headings;
}

/** Concatenate the literal text of a heading's inline content (`text` + `inlineCode` values). */
function nodeText(node: Nodes): string {
  let text = "";
  const stack: Nodes[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    if (current.type === "text" || current.type === "inlineCode") {
      text += current.value;
    }
    if ("children" in current) {
      for (let i = current.children.length - 1; i >= 0; i--) {
        const child = current.children[i];
        if (child !== undefined) {
          stack.push(child);
        }
      }
    }
  }
  return text;
}

// ── Cross-cutting: frontmatter quote-safety ────────────────────────────────────—

/** YAML indicator characters that make an unquoted scalar parser-dependent or reserved. */
const INDICATOR_CHARS: ReadonlySet<string> = new Set(["@", "`", "!", "&", "*", "|", ">"]);

/** A bare YAML-1.1 boolean alias a non-1.2 consumer coerces away from a string. */
const YAML11_BOOLEAN = /^(yes|no|on|off|y|n)$/i;

/** A `|`/`>` block-scalar **header** (optional indent digit + chomping indicator), authored on purpose. */
const BLOCK_SCALAR_HEADER = /^[|>][1-9]?[+-]?$/;

/** A bare `YYYY-MM-DD` date a YAML-1.1 consumer parses as a timestamp. */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The quote-safety findings for a file's raw frontmatter (ADR-0007 "frontmatter quote-safety").
 * lore's *own* output is already safe — it serializes structurally and js-yaml quotes whatever
 * needs it ([ADR-0011](../../docs/adr/0011-frontmatter-serialization-stability.md)) — so this
 * check exists for **author-written** frontmatter, whose ambiguous scalars round-trip
 * differently across the bundle's target consumers (GitHub, Obsidian, MkDocs, Docusaurus), some
 * of which still parse YAML 1.1.
 *
 * It is a deliberately **best-effort line scan** over the raw fenced block, not a re-parse: by
 * the time js-yaml has parsed the value, the ambiguity is already resolved, so the raw token is
 * the only place the hazard is visible. To stay false-positive-free on real bundles it inspects
 * only **simple top-level `key: value` lines** with a single-line unquoted scalar value;
 * quoted values, block scalars (`|`/`>`), flow collections (`[`/`{`), list items, nested
 * (indented) lines, and empty values are left alone (a documented limitation — nested/list
 * scalars are not analyzed). Returns `[]` for a file with no frontmatter fence.
 */
export function quoteSafetyFindings(raw: string): Finding[] {
  const findings: Finding[] = [];
  for (const value of topLevelScalarValues(raw)) {
    const finding = quoteSafetyForValue(value);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

/** Judge one unquoted scalar value, or `null` when it is quote-safe. */
function quoteSafetyForValue(value: string): Finding | null {
  const first = value[0] ?? "";
  // An intentional block-scalar header (`|`, `>-`, `|2`, …) is safe; only `>foo`/`|foo` with
  // content abutting the indicator is suspect (it is not a valid header), so it falls through.
  if ((first === "|" || first === ">") && BLOCK_SCALAR_HEADER.test(value)) {
    return null;
  }
  if (INDICATOR_CHARS.has(first)) {
    return error(
      `unquoted value starts with the YAML indicator "${first}" ("${value}"); quote it so every consumer reads a string`,
    );
  }
  if (YAML11_BOOLEAN.test(value)) {
    return error(`unquoted "${value}" is a boolean to YAML 1.1 consumers; quote it to keep the string "${value}"`);
  }
  if (value.includes(": ")) {
    return error(
      `unquoted value contains a colon ("${value}"); YAML reads "key: a: b" as a nested mapping — quote the value`,
    );
  }
  if (BARE_DATE.test(value)) {
    return warning(`unquoted "${value}" parses as a date to YAML 1.1 consumers; quote it to keep it a string`);
  }
  return null;
}

/** Build an error-severity quote-safety {@link Finding}. */
function error(message: string): Finding {
  return { severity: "error", rule: "quote-safety", message };
}

/** Build a warning-severity quote-safety {@link Finding}. */
function warning(message: string): Finding {
  return { severity: "warning", rule: "quote-safety", message };
}

/**
 * The unquoted single-line scalar values of the top-level `key: value` lines in a file's raw
 * frontmatter fence, in order. Returns `[]` when the file has no leading `---` fence. Only the
 * lines this scan can judge safely are returned; everything else (see
 * {@link quoteSafetyFindings}) is skipped.
 */
function topLevelScalarValues(raw: string): string[] {
  const block = frontmatterBlock(raw);
  if (block === null) {
    return [];
  }
  const values: string[] = [];
  for (const line of block.split("\n")) {
    // Top-level only: a leading space/tab means a nested or list value, which this scan does
    // not analyze. A blank line or a YAML comment carries no scalar.
    if (line === "" || /^\s/.test(line) || line.startsWith("#")) {
      continue;
    }
    const match = /^[A-Za-z0-9_][\w.-]*:(?:[ \t]+(.*))?$/.exec(line);
    if (match === null) {
      continue; // not a simple `key:`/`key: value` line (e.g. a `- item`, or `?`-complex key)
    }
    const rawValue = (match[1] ?? "").trim();
    if (rawValue === "") {
      continue; // empty value (`key:`) — a null, or a block/list continued on following lines
    }
    const quote = rawValue[0];
    if (quote === '"' || quote === "'") {
      continue; // already quoted — explicitly a string, safe
    }
    if (rawValue.startsWith("[") || rawValue.startsWith("{")) {
      continue; // flow collection — a structured list/map, not a scalar string
    }
    values.push(rawValue);
  }
  return values;
}

/**
 * Extract the raw text **between** the opening and closing `---` fences, or `null` when the file
 * does not open with a frontmatter fence. Applies the same leading normalization
 * {@link parseConcept} does (strip BOM(s), CRLF/CR → LF, drop leading whitespace) so a
 * BOM/Windows/whitespace-padded concept is analyzed identically to how it is parsed, then takes
 * the lines up to the next line that is exactly `---`.
 */
function frontmatterBlock(raw: string): string | null {
  const normalized = raw
    .replace(/^\uFEFF+/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\s+/, "");
  if (!normalized.startsWith("---\n")) {
    return null;
  }
  const rest = normalized.slice(4);
  const end = rest.indexOf("\n---");
  if (end === -1) {
    return null; // no closing fence — not a well-formed concept; parse-tier handles it
  }
  return rest.slice(0, end);
}

// Re-export the collector type name used in signatures above without a second import line.
export type { WarningCollector };
