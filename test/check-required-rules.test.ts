/**
 * `lore check` enforces `lore validate`'s required sections and required fields for EVERY type
 * (LCLI-606, opum-doc ADR "add Constitution and Constants document types", Amendment 1, R11).
 *
 * Every case runs the real `lore check --json` and the real `lore validate --json` over the same
 * bundle, and asserts two things: check fails with validate's own rule name, and check's findings
 * for the file are exactly validate's error findings under that rule name, so the two gates cannot
 * disagree about it (ADR-0007). The positive controls fix each defect and expect a clean check, and
 * a file with no frontmatter, which validate skips, must not be flagged by check either.
 *
 * The cases fall into two groups, named in each test title so a mutation of either half of the
 * enforcement can be predicted from this file alone: `[section]` cases fail only on
 * `required-section`, `[field]` cases only on `frontmatter`. The controls carry neither tag.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheck } from "../src/commands/check";
import { runValidate } from "../src/commands/validate";
import { EXIT_CODES, EXIT_OK } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };

interface FindingJson {
  readonly severity: string;
  readonly rule: string;
  readonly file?: string;
  readonly message: string;
}

/** An ADR carrying every section the built-in profile requires. */
const ADR_OK =
  "---\ntype: ADR\ntitle: Use soft deletes\n---\n# Use soft deletes\n\n## Status\n\nAccepted.\n\n## Context\n\nWhy.\n\n## Decision\n\nWhat.\n\n## Consequences\n\nSo.\n";
/** The same ADR without `## Consequences`. */
const ADR_NO_CONSEQUENCES = ADR_OK.replace("\n## Consequences\n\nSo.\n", "");

/** A Story (the built-in Arc alias) carrying its required `## Acceptance criteria`, with no `tasks:`. */
const STORY_OK =
  "---\ntype: Story\ntitle: Archive orders\n---\n# Archive orders\n\n## Acceptance criteria\n\n- Done.\n";
const STORY_NO_AC = "---\ntype: Story\ntitle: Archive orders\n---\n# Archive orders\n\nNo criteria here.\n";

/** A profile whose Reference type requires an `owner` field. */
const OWNER_PROFILE =
  '[profile]\nname = "custom"\nokf_version = "0.1"\n\n[base.fields]\ntype = { required = true }\n\n[[types]]\nname = "Reference"\nfields = { owner = { required = true } }\n';
const REFERENCE_OK = "---\ntype: Reference\ntitle: Orders table\nowner: payments\n---\n# Orders table\n\nBody.\n";
const REFERENCE_NO_OWNER = "---\ntype: Reference\ntitle: Orders table\n---\n# Orders table\n\nBody.\n";

/** Frontmatter present, `type` absent: validate's OKF conformance-floor error. */
const NO_TYPE = "---\ntitle: Untyped\n---\n# Untyped\n\nBody.\n";
const NO_TYPE_FIXED = "---\ntype: Reference\ntitle: Untyped\n---\n# Untyped\n\nBody.\n";

/** No frontmatter at all: not a concept, so validate skips it. */
const NO_FRONTMATTER = "# Just notes\n\nNo frontmatter, so not a concept.\n";

describe("lore check enforces validate's required sections and fields for every type (LCLI-606, R11)", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lore-check-required-"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "index.md"), "# Docs\n\nRoot.\n");
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeDoc(rel: string, contents: string): void {
    const abs = join(root, "docs", rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }

  function useOwnerProfile(): void {
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(join(root, ".lore", "profile.toml"), OWNER_PROFILE);
  }

  /** `lore check --json`: exit code and findings. Synchronous, since no fixture here links a task. */
  function check(): { code: number; findings: FindingJson[] } {
    const stdout = capture();
    const code = runCheck({ root, output: JSON_CTX, args: [], stdout, stderr: capture() });
    if (typeof code !== "number") {
      throw new Error("expected a synchronous check: no fixture in this file links a task");
    }
    return { code, findings: JSON.parse(stdout.text()).data.findings };
  }

  /** `lore validate --json`: the error findings for one repo-relative file. */
  function validateErrors(path: string): FindingJson[] {
    const stdout = capture();
    runValidate({ root, output: JSON_CTX, args: [], stdout, stderr: capture() });
    const files: { path: string; findings: FindingJson[] }[] = JSON.parse(stdout.text()).data.files;
    return (files.find((file) => file.path === path)?.findings ?? []).filter((f) => f.severity === "error");
  }

  /**
   * Check fails (exit 6) on `rel` with exactly validate's error findings under `rule`, and on
   * nothing else about that file.
   */
  function expectCheckMatchesValidate(rel: string, rule: string): FindingJson[] {
    const { code, findings } = check();
    expect(code).toBe(EXIT_CODES.validation);
    const mine = findings.filter((f) => f.file === rel);
    const validates = validateErrors(`docs/${rel}`).filter((f) => f.rule === rule);
    expect(validates.length).toBeGreaterThan(0); // positive control on the instrument: validate saw it
    // Each gate names a file by its own convention -- check bundle-relative, validate repo-relative --
    // and a frontmatter message embeds that name, so validate's is re-spelled in check's form.
    expect(mine.map(({ severity, rule: r, message }) => ({ severity, rule: r, message }))).toEqual(
      validates.map(({ severity, rule: r, message }) => ({
        severity,
        rule: r,
        message: message.replaceAll(`docs/${rel}`, rel),
      })),
    );
    return mine;
  }

  test("[section] an ADR missing `## Consequences` fails check with validate's required-section finding", () => {
    writeDoc("adr/soft-deletes.md", ADR_NO_CONSEQUENCES);
    const mine = expectCheckMatchesValidate("adr/soft-deletes.md", "required-section");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.message).toContain('"## Consequences"');
  });

  test("[section] a Story missing `## Acceptance criteria` fails check with validate's required-section finding", () => {
    writeDoc("stories/archive.md", STORY_NO_AC);
    const mine = expectCheckMatchesValidate("stories/archive.md", "required-section");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.message).toContain('"## Acceptance criteria"');
  });

  test("[field] a profile-required field missing on a document without tasks: fails check with validate's frontmatter finding", () => {
    useOwnerProfile();
    writeDoc("reference/orders.md", REFERENCE_NO_OWNER);
    const mine = expectCheckMatchesValidate("reference/orders.md", "frontmatter");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.message).toContain("owner");
  });

  test("[field] a frontmatter file with no `type` fails check with validate's frontmatter finding", () => {
    writeDoc("notes/untyped.md", NO_TYPE);
    const mine = expectCheckMatchesValidate("notes/untyped.md", "frontmatter");
    expect(mine).toHaveLength(1);
    expect(mine[0]?.message).toContain("type");
  });

  test("control: the fixed ADR, Story and typed file pass check with no finding at all", () => {
    writeDoc("adr/soft-deletes.md", ADR_OK);
    writeDoc("stories/archive.md", STORY_OK);
    writeDoc("notes/untyped.md", NO_TYPE_FIXED);
    expect(check()).toEqual({ code: EXIT_OK, findings: [] });
  });

  test("control: the Reference carrying its profile-required field passes check with no finding at all", () => {
    useOwnerProfile();
    writeDoc("reference/orders.md", REFERENCE_OK);
    expect(check()).toEqual({ code: EXIT_OK, findings: [] });
  });

  test("control: a file without frontmatter is skipped by validate and not flagged by check", () => {
    writeDoc("notes/plain.md", NO_FRONTMATTER);
    expect(validateErrors("docs/notes/plain.md")).toEqual([]);
    expect(check()).toEqual({ code: EXIT_OK, findings: [] });
  });
});
