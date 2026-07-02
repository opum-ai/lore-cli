/**
 * okf-fixture.test.ts — LORE-13 AC#1: a sample OKF bundle fixture that exercises **every known
 * concept type** (valid concepts) plus deliberately-broken concepts that trip representative
 * `lore validate` / `lore check` findings.
 *
 * The fixture lives on disk under `test/fixtures/okf-bundle/` — a real, walkable OKF bundle rather
 * than inline strings — so it doubles as a conformance example and can be pointed at by future
 * command-level tests. This suite reads it and drives the same pure engines the `lore validate` and
 * `lore check` commands run ({@link validateConceptText}, {@link checkBundle}), asserting:
 *
 * - **Coverage (AC#1)** — the valid wing carries exactly one clean concept per type in the built-in
 *   {@link defaultProfile}; a new type without a fixture fails the coverage assertion.
 * - **Broken concepts trip findings** — each file under `broken/` produces its intended finding:
 *   a missing/mistyped `type` and a missing required section are validate **errors**; a missing
 *   `summary` and an unknown `type` are non-fatal **warnings**; a dangling internal link is a check
 *   **error** and Obsidian-isms are check **portability warnings**.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CheckInputFile, checkBundle } from "../src/core/check";
import { defaultProfile } from "../src/core/profile";
import { validateConceptText } from "../src/core/validate";

/** The fixture bundle root. */
const BUNDLE = join(import.meta.dir, "fixtures", "okf-bundle");

/** A bundle file as the engines consume it: bundle-relative POSIX path + raw bytes. */
interface BundleFile {
  readonly path: string;
  readonly raw: string;
}

/** Walk the fixture bundle, returning every `.md` file with its bundle-relative POSIX path. */
function readBundle(): BundleFile[] {
  return readdirSync(BUNDLE, { recursive: true })
    .map(String)
    .filter((rel) => rel.endsWith(".md"))
    .map((rel) => ({ path: rel.split("\\").join("/"), raw: readFileSync(join(BUNDLE, rel), "utf8") }));
}

const FILES = readBundle();

/** The clean concepts (everything outside the `broken/` wing). */
const VALID = FILES.filter((f) => !f.path.startsWith("broken/"));

/** Look up one broken fixture by its basename. */
function broken(name: string): BundleFile {
  const file = FILES.find((f) => f.path === `broken/${name}`);
  if (!file) {
    throw new Error(`fixture broken/${name} not found`);
  }
  return file;
}

/** The `CheckInputFile[]` view of the whole bundle (valid + broken), for cross-link/portability checks. */
const CHECK_INPUT: CheckInputFile[] = FILES.map((f) => ({ path: f.path, raw: f.raw }));

// ── AC#1: the valid wing exercises every known type ──────────────────────────────────

describe("okf-bundle valid concepts — every known type, all clean (AC#1)", () => {
  test("each valid concept validates clean with no error-severity findings", () => {
    for (const file of VALID) {
      const report = validateConceptText(file.path, file.raw);
      expect(report.skipped).toBe(false);
      expect(report.ok).toBe(true);
      expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
  });

  test("the valid wing covers exactly the built-in profile's type vocabulary", () => {
    const fixtureTypes = new Set(VALID.map((f) => validateConceptText(f.path, f.raw).type));
    const knownTypes = new Set(defaultProfile().types.keys());
    expect(fixtureTypes).toEqual(knownTypes);
  });

  test("the whole valid wing has no broken internal links", () => {
    const validPaths = new Set(VALID.map((f) => f.path));
    const brokenOnValid = checkBundle(CHECK_INPUT).findings.filter(
      (f) => f.rule === "broken-link" && validPaths.has(f.file),
    );
    expect(brokenOnValid).toEqual([]);
  });
});

// ── Broken concepts trip representative validate findings ─────────────────────────────

describe("okf-bundle broken concepts — validate findings", () => {
  test("missing `type` is a frontmatter error (not a skip)", () => {
    const report = validateConceptText("broken/missing-type.md", broken("missing-type.md").raw);
    expect(report.skipped).toBe(false);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.severity === "error" && f.rule === "frontmatter")).toBe(true);
  });

  test("a mistyped known field is a frontmatter error", () => {
    const report = validateConceptText("broken/mistyped-field.md", broken("mistyped-field.md").raw);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.severity === "error" && f.rule === "frontmatter")).toBe(true);
  });

  test("a known type missing its required sections is a required-section error", () => {
    const report = validateConceptText("broken/missing-sections.md", broken("missing-sections.md").raw);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => f.severity === "error" && f.rule === "required-section")).toBe(true);
  });

  test("a missing summary is a non-fatal warning (file still ok)", () => {
    const report = validateConceptText("broken/missing-summary.md", broken("missing-summary.md").raw);
    expect(report.ok).toBe(true);
    expect(report.findings.some((f) => f.severity === "warning" && /summary/i.test(f.message))).toBe(true);
    expect(report.findings.some((f) => f.severity === "error")).toBe(false);
  });

  test("an unknown type is a non-fatal warning (OKF tolerance)", () => {
    const report = validateConceptText("broken/unknown-type.md", broken("unknown-type.md").raw);
    expect(report.ok).toBe(true);
    expect(report.findings.some((f) => f.severity === "warning" && /unknown type/i.test(f.message))).toBe(true);
  });
});

// ── Broken concepts trip representative check findings ────────────────────────────────

describe("okf-bundle broken concepts — check findings", () => {
  const report = checkBundle(CHECK_INPUT);

  test("a dangling internal link is a broken-link error on its file", () => {
    const broken = report.findings.filter((f) => f.rule === "broken-link" && f.file === "broken/dangling-link.md");
    expect(broken.length).toBeGreaterThan(0);
    expect(broken[0]?.severity).toBe("error");
  });

  test("Obsidian-isms are portability warnings on the non-portable file", () => {
    const portability = report.findings.filter((f) => f.rule === "portability" && f.file === "broken/non-portable.md");
    expect(portability.length).toBeGreaterThan(0);
    expect(portability.every((f) => f.severity === "warning")).toBe(true);
  });

  test("the only broken-link error in the bundle is the intended dangling link", () => {
    const brokenLinks = report.findings.filter((f) => f.rule === "broken-link");
    expect(brokenLinks.map((f) => f.file)).toEqual(["broken/dangling-link.md"]);
  });
});
