/**
 * LCLI-687 / DEC-167 (3): the built-in `Standard` document type. Additive — a lore-only producer
 * type on the story-convention profile, carrying the six-section engineering-standard format
 * DEC-167 (2) fixes (Purpose, Scope, Rules, Enforcement, Exceptions, Related).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../src/commands/init";
import { type NewResult, runNew } from "../src/commands/new";
import { defaultProfile, profileForBundle, STANDARD_TYPE } from "../src/core/profile";
import { requiredSectionsFor, typeDirectory } from "../src/core/schema";
import { builtinTemplateFor } from "../src/core/template";
import { buildTypeVocabulary } from "../src/core/type-vocabulary";
import { validateConceptText } from "../src/core/validate";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-10-06T12:00:00Z");

/** DEC-167 (2): the six required sections, in order. */
const SECTIONS = ["Purpose", "Scope", "Rules", "Enforcement", "Exceptions", "Related"];
/** Every `## ` heading in a markdown body, in order. */
const h2 = (markdown: string): string[] =>
  markdown
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-standard-"));
  runInit({ root, args: ["--allow-no-git"], output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the built-in Standard type (DEC-167 (3), LCLI-687)", () => {
  test("the profile declares Standard: slug standard, the six sections IN ORDER, no own fields", () => {
    const profile = defaultProfile();
    const standard = profile.types.get(STANDARD_TYPE);
    const epic = profile.types.get("Epic");
    expect(standard?.name).toBe("Standard");
    expect(standard?.slug).toBe("standard");
    expect(standard?.requiredSections).toEqual(SECTIONS);
    // No fields beyond the base set: Standard's field set equals Epic's, the type declaring none.
    expect([...(standard?.declaredFields ?? [])].sort()).toEqual([...(epic?.declaredFields ?? [])].sort());
    // No REQUIRED field beyond the base `type` either.
    expect([...(standard?.requiredFields ?? [])]).toEqual(["type"]);
    // A lore-only type like Constitution/Constants: declared on the 0.1 profile too.
    const legacy = profileForBundle(profile, { okfVersion: "0.1", source: "declared" });
    expect(legacy.types.has(STANDARD_TYPE)).toBe(true);
  });

  test("requiredSectionsFor resolves the canonical and lower-case spellings", () => {
    expect(requiredSectionsFor("Standard")).toEqual(SECTIONS);
    expect(requiredSectionsFor("standard")).toEqual(SECTIONS);
  });

  test("the built-in template carries the six headings, in order", () => {
    expect(h2(builtinTemplateFor("Standard"))).toEqual(SECTIONS);
  });

  test("`lore new Standard` scaffolds a six-heading doc under docs/standards/", () => {
    const stdout = capture();
    const code = runNew({
      root,
      output: JSON_CTX,
      args: ["Standard", "Secrets and credentials"],
      clock: FIXED_CLOCK,
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(0);
    const data = (JSON.parse(stdout.text()) as { data: NewResult }).data;
    expect(data.type).toBe("Standard");
    expect(data.path).toBe("docs/standards/secrets-and-credentials.md");
    expect(h2(readFileSync(join(root, data.path), "utf8"))).toEqual(SECTIONS);
  });

  test("`lore types` reports Standard with its slug and sections", () => {
    const standard = buildTypeVocabulary(defaultProfile()).types.find((t) => t.name === "Standard");
    expect(standard?.slug).toBe("standard");
    expect(standard?.requiredSections).toEqual(SECTIONS);
  });

  test("typeDirectory places it in standards/ (DEC-167 (2) keeps standards there)", () => {
    expect(typeDirectory("Standard")).toBe("standards");
  });

  test("a Standard missing a required section is a required-section error, by presence not order", () => {
    const report = validateConceptText(
      "docs/standards/x.md",
      "---\ntype: Standard\ntitle: X\n---\n# X\n\n## Purpose\n\n## Scope\n\n## Rules\n",
      defaultProfile(),
    );
    const missing = report.findings.filter((f) => f.rule === "required-section").map((f) => f.message);
    expect(missing).toEqual([
      'Standard is missing the required "## Enforcement" section',
      'Standard is missing the required "## Exceptions" section',
      'Standard is missing the required "## Related" section',
    ]);
  });
});
