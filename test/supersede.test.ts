import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { runSupersede, type SupersedeReport } from "../src/commands/supersede";
import { parseConcept, serializeConcept } from "../src/core/concept";
import { EXIT_CODES, EXIT_OK, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-supersede-"));
  mkdirSync(join(root, "docs"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a bundle file under `docs/` (path relative to `docs/`). */
function writeDoc(rel: string, contents: string): void {
  const abs = join(root, "docs", rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, contents);
}

/** Read a bundle file under `docs/`. */
function readDoc(rel: string): string {
  return readFileSync(join(root, "docs", rel), "utf8");
}

/** Run `supersede` in JSON mode and return the parsed `data` payload plus the exit code. */
function supersedeCmd(args: string[]): { code: number; report: SupersedeReport } {
  const stdout = capture();
  const code = runSupersede({ root, output: JSON_CTX, args, stdout, stderr: capture() });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: SupersedeReport };
  expect(envelope.kind).toBe("supersede.result");
  return { code, report: envelope.data };
}

/** Run `supersede` expecting a thrown {@link LoreError}, returned for assertions. */
function expectError(args: string[]): LoreError {
  try {
    runSupersede({ root, output: JSON_CTX, args, stdout: capture(), stderr: capture() });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runSupersede returned");
}

// ── AC#1: supersession frontmatter is wired both ways and round-trips byte-stably ──

describe("lore supersede — frontmatter wiring (AC#1)", () => {
  test("wires status/superseded_by on the old concept and supersedes on the new", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\ntitle: Old decision\n---\nThe old decision.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\ntitle: New decision\n---\nThe new decision.\n");

    const { code, report } = supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    expect(code).toBe(EXIT_OK);
    expect(report.old).toBe("docs/adr/0007-old.md");
    expect(report.new).toBe("docs/adr/0012-new.md");

    const old = parseConcept("adr/0007-old.md", readDoc("adr/0007-old.md"));
    expect(old.frontmatter.status).toBe("superseded");
    expect(old.frontmatter.superseded_by).toBe("adr/0012-new");
    const fresh = parseConcept("adr/0012-new.md", readDoc("adr/0012-new.md"));
    expect(fresh.frontmatter.supersedes).toBe("adr/0007-old");
  });

  test("preserves the old file (no move, no delete) — it is history", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    expect(existsSync(join(root, "docs/adr/0007-old.md"))).toBe(true);
  });

  test("the body is preserved verbatim; only frontmatter changes", () => {
    const body = "# Old decision\n\nA *careful*  paragraph with  double  spaces.\n\n- one\n- two\n";
    writeDoc("adr/0007-old.md", "---\ntype: ADR\ntitle: Old\n---\n" + body);
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    expect(readDoc("adr/0007-old.md").endsWith(body)).toBe(true);
  });

  test("the wired bytes are a serialization fixpoint (byte-stable round-trip)", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\ntitle: Old\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\ntitle: New\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    for (const rel of ["adr/0007-old.md", "adr/0012-new.md"]) {
      const bytes = readDoc(rel);
      expect(serializeConcept(parseConcept(rel, bytes))).toBe(bytes);
    }
  });
});

// ── supersedes append semantics ────────────────────────────────────────────────

describe("lore supersede — supersedes append (don't clobber)", () => {
  test("appends to an existing scalar supersedes, normalizing to a list", () => {
    writeDoc("adr/0001-a.md", "---\ntype: ADR\n---\nA.\n");
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\nsupersedes: adr/0001-a\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    const fresh = parseConcept("adr/0012-new.md", readDoc("adr/0012-new.md"));
    expect(fresh.frontmatter.supersedes).toEqual(["adr/0001-a", "adr/0007-old"]);
  });

  test("appends to an existing list supersedes, preserving prior entries", () => {
    writeDoc("adr/0001-a.md", "---\ntype: ADR\n---\nA.\n");
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\nsupersedes:\n  - adr/0001-a\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    const fresh = parseConcept("adr/0012-new.md", readDoc("adr/0012-new.md"));
    expect(fresh.frontmatter.supersedes).toEqual(["adr/0001-a", "adr/0007-old"]);
  });

  test("does not duplicate an old id already referenced in path form", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    // a path-form ref that already resolves to adr/0007-old — must not be duplicated as a bare id
    writeDoc("adr/0012-new.md", "---\ntype: ADR\nsupersedes:\n  - 0007-old.md\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    const fresh = parseConcept("adr/0012-new.md", readDoc("adr/0012-new.md"));
    expect(fresh.frontmatter.supersedes).toEqual(["0007-old.md"]); // unchanged, no bare-id duplicate
  });
});

// ── AC#2: --rewrite-links repoints inbound references to the successor ─────────────

describe("lore supersede — --rewrite-links (AC#2)", () => {
  test("repoints a third-party inbound body link to the successor", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    writeDoc("stories/use.md", "---\ntype: Story\n---\nPer [the decision](../adr/0007-old.md).\n");
    const { report } = supersedeCmd(["adr/0007-old", "adr/0012-new", "--rewrite-links"]);
    expect(report.rewroteLinks).toBe(true);
    expect(readDoc("stories/use.md")).toContain("[the decision](../adr/0012-new.md)");
  });

  test("without --rewrite-links, inbound links are left pointing at the old concept", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    writeDoc("stories/use.md", "---\ntype: Story\n---\nPer [the decision](../adr/0007-old.md).\n");
    const { report } = supersedeCmd(["adr/0007-old", "adr/0012-new"]);
    expect(report.rewroteLinks).toBe(false);
    expect(readDoc("stories/use.md")).toContain("[the decision](../adr/0007-old.md)"); // untouched
    expect(report.files.map((f) => f.path)).not.toContain("docs/stories/use.md");
  });

  test("does NOT self-redirect the successor's own link to its predecessor (the overlap)", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    // the new doc legitimately references the old one it supersedes — must stay pointing at old
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nSupersedes [the prior](0007-old.md).\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new", "--rewrite-links"]);
    expect(readDoc("adr/0012-new.md")).toContain("[the prior](0007-old.md)"); // not redirected to itself
  });

  test("does NOT redirect the old (preserved) doc's own self-link", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nSee [myself](0007-old.md).\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new", "--rewrite-links"]);
    expect(readDoc("adr/0007-old.md")).toContain("[myself](0007-old.md)"); // preserved history
  });

  test("repoints an inbound frontmatter ref to the successor", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    writeDoc("stories/use.md", "---\ntype: Story\nspecs:\n  - ../adr/0007-old.md\n---\nText.\n");
    supersedeCmd(["adr/0007-old", "adr/0012-new", "--rewrite-links"]);
    const fresh = parseConcept("stories/use.md", readDoc("stories/use.md"));
    expect(fresh.frontmatter.specs).toEqual(["adr/0012-new"]);
  });
});

// ── --dry-run ──────────────────────────────────────────────────────────────────

describe("lore supersede — --dry-run", () => {
  test("reports the plan but writes nothing", () => {
    const oldBytes = "---\ntype: ADR\n---\nOld.\n";
    const newBytes = "---\ntype: ADR\n---\nNew.\n";
    const useBytes = "---\ntype: Story\n---\nPer [it](../adr/0007-old.md).\n";
    writeDoc("adr/0007-old.md", oldBytes);
    writeDoc("adr/0012-new.md", newBytes);
    writeDoc("stories/use.md", useBytes);
    const { report } = supersedeCmd(["adr/0007-old", "adr/0012-new", "--rewrite-links", "--dry-run"]);
    expect(report.dryRun).toBe(true);
    expect(report.filesChanged).toBeGreaterThan(0);
    expect(readDoc("adr/0007-old.md")).toBe(oldBytes); // not wired
    expect(readDoc("adr/0012-new.md")).toBe(newBytes); // not wired
    expect(readDoc("stories/use.md")).toBe(useBytes); // not repointed
  });
});

// ── errors and arg parsing ────────────────────────────────────────────────────

describe("lore supersede — errors and arg parsing", () => {
  test("a missing successor id is a usage error", () => {
    expect(expectError(["only-old"]).type).toBe("usage");
  });

  test("a third positional is a usage error", () => {
    expect(expectError(["a", "b", "c"]).type).toBe("usage");
  });

  test("an unknown flag is a usage error", () => {
    expect(expectError(["a", "b", "--bogus"]).type).toBe("usage");
  });

  test("a single-dash unknown flag is a usage error", () => {
    expect(expectError(["a", "b", "-x"]).type).toBe("usage");
  });

  test("superseding a concept by itself is a usage error", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    expect(expectError(["adr/0007-old", "adr/0007-old.md"]).type).toBe("usage"); // .md stripped → same id
  });

  test("an absent old id is not_found (exit 3)", () => {
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    const err = expectError(["adr/ghost", "adr/0012-new"]);
    expect(err.type).toBe("not_found");
  });

  test("an absent new id is not_found (exit 3) — the engine's move:false skips this check", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    const err = expectError(["adr/0007-old", "adr/ghost"]);
    expect(err.type).toBe("not_found");
  });

  test("superseding an already-superseded concept is a conflict (exit 5)", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\nstatus: superseded\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    expect(expectError(["adr/0007-old", "adr/0012-new"]).type).toBe("conflict");
  });

  test("re-superseding by the same successor is an idempotent conflict (exit 5)", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\nstatus: active\nsuperseded_by: adr/0012-new\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    expect(expectError(["adr/0007-old", "adr/0012-new"]).type).toBe("conflict");
  });

  test("accepts a -- options terminator before the ids", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    const { code } = supersedeCmd(["--", "adr/0007-old", "adr/0012-new"]);
    expect(code).toBe(EXIT_OK);
    expect(parseConcept("adr/0007-old.md", readDoc("adr/0007-old.md")).frontmatter.status).toBe("superseded");
  });
});

// ── output rendering ──────────────────────────────────────────────────────────

describe("lore supersede — rendering", () => {
  test("plain mode renders a supersession line, per-file updates, and a summary", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    writeDoc("stories/use.md", "---\ntype: Story\n---\n[it](../adr/0007-old.md)\n");
    const stdout = capture();
    runSupersede({
      root,
      output: { mode: "plain", color: false },
      args: ["adr/0007-old", "adr/0012-new", "--rewrite-links"],
      stdout,
      stderr: capture(),
    });
    const text = stdout.text();
    expect(text).toContain("superseded docs/adr/0007-old.md -> docs/adr/0012-new.md");
    expect(text).toContain("updated docs/stories/use.md");
    expect(text).toMatch(/\d+ files? changed/);
  });

  test("pretty (color) mode renders the same report body", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    const stdout = capture();
    runSupersede({
      root,
      output: { mode: "pretty", color: true },
      args: ["adr/0007-old", "adr/0012-new"],
      stdout,
      stderr: capture(),
    });
    expect(stdout.text()).toContain("superseded docs/adr/0007-old.md -> docs/adr/0012-new.md");
    expect(stdout.text()).toMatch(/\d+ files? changed/);
  });
});

// ── router integration ────────────────────────────────────────────────────────

describe("lore supersede — router integration", () => {
  test("`lore supersede` is dispatched and wires through the router", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    const code = run(["bun", "lore", "supersede", "adr/0007-old", "adr/0012-new", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_OK);
    expect(parseConcept("adr/0007-old.md", readDoc("adr/0007-old.md")).frontmatter.status).toBe("superseded");
  });

  test("a not_found surfaces exit 3 through the router", () => {
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    const code = run(["bun", "lore", "supersede", "adr/ghost", "adr/0012-new", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_CODES.not_found);
  });

  test("an already-superseded concept surfaces exit 5 through the router", () => {
    writeDoc("adr/0007-old.md", "---\ntype: ADR\nstatus: superseded\n---\nOld.\n");
    writeDoc("adr/0012-new.md", "---\ntype: ADR\n---\nNew.\n");
    const code = run(["bun", "lore", "supersede", "adr/0007-old", "adr/0012-new", "--json"], {
      cwd: root,
      stdout: capture(),
      stderr: capture(),
    });
    expect(code).toBe(EXIT_CODES.conflict);
  });
});
