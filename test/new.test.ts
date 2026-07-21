import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { runInit } from "../src/commands/init";
import { type NewResult, runNew } from "../src/commands/new";
import { loadBundle } from "../src/core/bundle";
import { LoreError, WarningCollector } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-new-"));
  // `new` is run inside an initialized bundle: `init` creates `.lore/schemas/` (so a known
  // type gets its editor modeline) and `.lore/templates/` (where user-template tests drop files).
  runInit({ root, output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run `new` in JSON mode and return the parsed `data` payload plus the exit code. */
function newCmd(args: string[]): { code: number; result: NewResult; stderr: ReturnType<typeof capture> } {
  const stdout = capture();
  const stderr = capture();
  const code = runNew({ root, output: JSON_CTX, args, clock: FIXED_CLOCK, stdout, stderr });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: NewResult };
  expect(envelope.kind).toBe("new");
  return { code, result: envelope.data, stderr };
}

/** Run `new` expecting a thrown {@link LoreError}, returning it for assertions. */
function expectError(args: string[]): LoreError {
  try {
    runNew({ root, output: JSON_CTX, args, clock: FIXED_CLOCK, stdout: capture(), stderr: capture() });
  } catch (err) {
    expect(err).toBeInstanceOf(LoreError);
    return err as LoreError;
  }
  throw new Error("expected a LoreError, but runNew returned");
}

describe("lore new — scaffolding a known type", () => {
  test("writes to the conventional per-type path and returns id/path/type", () => {
    const { code, result } = newCmd(["adr", "Use soft deletes"]);
    expect(code).toBe(0);
    expect(result).toEqual({ id: "adr/use-soft-deletes", path: "docs/adr/use-soft-deletes.md", type: "ADR" });
    expect(existsSync(join(root, "docs/adr/use-soft-deletes.md"))).toBe(true);
  });

  test("accepts a case-insensitive type token and writes the canonical type", () => {
    const { result } = newCmd(["STORY", "Bulk archive orders"]);
    expect(result.type).toBe("Story");
    expect(result.path).toBe("docs/stories/bulk-archive-orders.md");
    expect(readFileSync(join(root, result.path), "utf8")).toContain("type: Story");
  });

  test("the new doc loads cleanly: loadBundle yields no warnings (AC#1)", () => {
    newCmd(["reference", "Orders table"]);
    const warnings = new WarningCollector();
    const graph = loadBundle(join(root, "docs"), { warnings });
    expect(graph.concepts.has("reference/orders-table")).toBe(true);
    expect(warnings.list()).toEqual([]);
  });

  test("a multi-word profile-declared type (e.g. 'QA Plan') scaffolds under its slug directory", () => {
    // Regression: VALID_TYPE forbids spaces, but a profile-declared multi-word type must scaffold —
    // landing under docs/<slug>/ and rendering its declared template (LORE-46 AC#7).
    writeFileSync(
      join(root, ".lore/profile.toml"),
      [
        "[profile]",
        'name = "demo"',
        'okf_version = "0.1"',
        "[base.fields]",
        "type = { required = true }",
        "title = {}",
        "summary = {}",
        'timestamp = { kind = "datetime" }',
        "[[types]]",
        'name = "QA Plan"',
        'template = "qa-plan.md"',
      ].join("\n"),
    );
    writeFileSync(join(root, ".lore/templates/qa-plan.md"), "\n# {{title}}\n\n## Coverage\n");
    const { code, result } = newCmd(["QA Plan", "Checkout suite"]);
    expect(code).toBe(0);
    expect(result.type).toBe("QA Plan");
    expect(result.path).toBe("docs/qa-plan/checkout-suite.md");
    const text = readFileSync(join(root, result.path), "utf8");
    expect(text).toContain("type: QA Plan");
    expect(text).toContain("## Coverage"); // the profile-declared template was rendered
  });

  test("--summary and --tags land on the frontmatter", () => {
    const { result } = newCmd([
      "story",
      "Bulk archive",
      "--summary",
      "Archive old orders.",
      "--tags",
      "retention,orders",
    ]);
    const raw = readFileSync(join(root, result.path), "utf8");
    expect(raw).toContain("summary: Archive old orders.");
    expect(raw).toContain("- retention");
    expect(raw).toContain("- orders");
  });

  test("--out overrides the computed path (inside the repo, .md appended)", () => {
    const { result } = newCmd(["reference", "Orders table", "--out", "docs/reference/custom"]);
    expect(result.path).toBe("docs/reference/custom.md");
    expect(existsSync(join(root, "docs/reference/custom.md"))).toBe(true);
  });

  test("the inline --flag=value form is accepted", () => {
    const { result } = newCmd(["reference", "Orders table", "--out=docs/reference/inline"]);
    expect(result.path).toBe("docs/reference/inline.md");
  });

  test("a `--` terminator lets a title begin with a dash", () => {
    const { result } = newCmd(["adr", "--", "-5 minute timeout"]);
    expect(result.path).toBe("docs/adr/5-minute-timeout.md");
    // The dash-leading title is YAML-quoted structurally (never corrupts the frontmatter).
    expect(readFileSync(join(root, result.path), "utf8")).toContain('title: "-5 minute timeout"');
  });

  test("a trimmed title: surrounding whitespace is dropped from frontmatter and slug alike", () => {
    const { result } = newCmd(["adr", "  Soft deletes  "]);
    expect(result.path).toBe("docs/adr/soft-deletes.md");
    expect(readFileSync(join(root, result.path), "utf8")).toContain("title: Soft deletes\n");
  });

  test("a --var shadowing an auto token is ignored with a warning, not silently dropped", () => {
    const { stderr } = newCmd(["adr", "Real Title", "--var", "title=Ignored"]);
    expect(stderr.text()).toContain("ignoring --var title");
    expect(readFileSync(join(root, "docs/adr/real-title.md"), "utf8")).toContain("title: Real Title");
  });
});

describe("lore new — stamps the OKF `resource` from the profile's resource_base (LORE-47 / AC#4)", () => {
  /** Overwrite the scaffolded profile with one declaring a resource_base and the story types under test. */
  function writeResourceProfile(resourceBase: string): void {
    writeFileSync(
      join(root, ".lore/profile.toml"),
      [
        "[profile]",
        'name = "demo"',
        'okf_version = "0.1"',
        `resource_base = "${resourceBase}"`,
        "[base.fields]",
        "type = { required = true }",
        "title = {}",
        "summary = {}",
        'timestamp = { kind = "datetime" }',
        "[[types]]",
        'name = "Reference"',
        "[[types]]",
        'name = "ADR"',
      ].join("\n"),
    );
  }

  test("stamps a `resource` link joining resource_base to the new doc's repo-relative path", () => {
    writeResourceProfile("https://docs.example.com/");
    const { result } = newCmd(["reference", "Orders table"]);
    const raw = readFileSync(join(root, result.path), "utf8");
    expect(raw).toContain("resource: https://docs.example.com/docs/reference/orders-table.md");
    // It loads back clean — `resource` is a recognized OKF key, not a warned extra.
    const warnings = new WarningCollector();
    loadBundle(join(root, "docs"), { warnings });
    expect(warnings.list()).toEqual([]);
  });

  test("with no resource_base set, `lore new` output is byte-identical to before (no resource line)", () => {
    // The scaffolded (commented) profile leaves resource_base empty → the default behavior.
    const { result } = newCmd(["adr", "Use soft deletes"]);
    expect(readFileSync(join(root, result.path), "utf8")).not.toContain("resource:");
  });
});

describe("lore new — user templates override built-ins (AC#2)", () => {
  test("a .lore/templates/<type>.md body is used instead of the built-in", () => {
    writeFileSync(join(root, ".lore/templates/reference.md"), "\n# {{title}}\n\nOwner: {{owner}}\n");
    const { result } = newCmd(["reference", "Orders table", "--var", "owner=payments"]);
    const raw = readFileSync(join(root, result.path), "utf8");
    expect(raw).toContain("Owner: payments");
    expect(raw).not.toContain("## Details"); // the built-in section is gone
    // lore still owns the frontmatter + modeline even when the body is user-supplied.
    expect(raw).toContain("type: Reference");
    expect(raw).toContain("yaml-language-server");
  });

  test("--template <name> selects a differently-named template file", () => {
    writeFileSync(join(root, ".lore/templates/rich.md"), "\n# {{title}}\n\nfrom rich template\n");
    const { result } = newCmd(["reference", "Orders table", "--template", "rich"]);
    expect(readFileSync(join(root, result.path), "utf8")).toContain("from rich template");
  });

  test("a canonical-case template file (Reference.md) is honored on case-sensitive filesystems", () => {
    // The default lookup tries the type's canonical case before lowercasing, so a user template
    // named with the documented `<type>` spelling overrides the built-in even on Linux/CI.
    writeFileSync(join(root, ".lore/templates/Reference.md"), "\n# {{title}}\n\ncanonical-case template\n");
    const { result } = newCmd(["reference", "Orders table"]);
    expect(readFileSync(join(root, result.path), "utf8")).toContain("canonical-case template");
  });

  test("an explicit mixed-case --template resolves its mixed-case file", () => {
    writeFileSync(join(root, ".lore/templates/Rich.md"), "\n# {{title}}\n\nfrom Rich\n");
    const { result } = newCmd(["reference", "Orders table", "--template", "Rich"]);
    expect(readFileSync(join(root, result.path), "utf8")).toContain("from Rich");
  });

  test("an explicit --template that does not exist is a not_found error", () => {
    const err = expectError(["reference", "Orders table", "--template", "missing"]);
    expect(err.type).toBe("not_found");
    expect(err.message).toContain("missing");
  });

  test("an unfilled {{var}} in a user template fails loud (validation, exit 6)", () => {
    writeFileSync(join(root, ".lore/templates/reference.md"), "\n# {{title}}\n\nOwner: {{owner}}\n");
    const err = expectError(["reference", "Orders table"]);
    expect(err.type).toBe("validation");
    expect(err.message).toContain("{{owner}}");
  });
});

describe("lore new — --template is confined to .lore/templates/ (LORE-72)", () => {
  test("regression: a `..`-traversal --template value is refused, never reads or embeds the outside file", () => {
    // Reproduces the task's own live repro shape (`--template ../../../../../../tmp/outside_secret`):
    // a relative path climbing out of .lore/templates/ to an arbitrary file elsewhere on disk.
    const outsideDir = mkdtempSync(join(tmpdir(), "lore-new-outside-"));
    const secretPath = join(outsideDir, "outside_secret.md");
    writeFileSync(secretPath, "SUPER SECRET DATA — must never leak into a generated concept\n");
    const traversal = relative(join(root, ".lore/templates"), secretPath).replace(/\.md$/, "");

    const err = expectError(["adr", "Test", "--template", traversal, "--out", "docs/adr/test.md"]);
    expect(err.type).toBe("usage");
    expect(err.message).toContain("escape");
    // No partial artifact was ever written — the traversal is refused before any file is created.
    expect(existsSync(join(root, "docs/adr/test.md"))).toBe(false);

    rmSync(outsideDir, { recursive: true, force: true });
  });

  test("an absolute-path --template value is refused", () => {
    const err = expectError(["adr", "Test", "--template", "/etc/passwd"]);
    expect(err.type).toBe("usage");
    expect(err.message).toContain("absolute");
  });

  test("a Windows-style absolute --template value is refused regardless of host platform", () => {
    const err = expectError(["adr", "Test", "--template", "C:\\Windows\\System32\\drivers\\etc\\hosts"]);
    expect(err.type).toBe("usage");
  });

  test("a name merely starting with `..` (not a real `..` segment) is a legitimate template, not a false escape", () => {
    // Mirrors the same distinction --out's own confinement guard already makes: `..custom` is one
    // real path segment, not a parent-directory escape.
    writeFileSync(join(root, ".lore/templates/..custom.md"), "\n# {{title}}\n\nfrom dotdot-prefixed template\n");
    const { result } = newCmd(["adr", "Title", "--template", "..custom"]);
    expect(readFileSync(join(root, result.path), "utf8")).toContain("from dotdot-prefixed template");
  });

  test("a nested traversal (subdir then climbing back out) is refused the same way", () => {
    const err = expectError(["adr", "Test", "--template", "sub/../../../outside"]);
    expect(err.type).toBe("usage");
    expect(err.message).toContain("escape");
  });
});

describe("lore new — unknown types are accepted (OKF tolerance)", () => {
  test("an unknown type scaffolds under its lowercased name, warns, and omits the modeline", () => {
    const { code, result, stderr } = newCmd(["Decision", "Pick a queue"]);
    expect(code).toBe(0);
    expect(result).toEqual({ id: "decision/pick-a-queue", path: "docs/decision/pick-a-queue.md", type: "Decision" });
    const raw = readFileSync(join(root, result.path), "utf8");
    expect(raw).not.toContain("yaml-language-server");
    expect(stderr.text()).toContain('unknown type "Decision"');
  });
});

describe("lore new — never clobbers an existing target (exit 5)", () => {
  test("a second run at the same path is a conflict, not an overwrite", () => {
    newCmd(["adr", "Use soft deletes"]);
    const before = readFileSync(join(root, "docs/adr/use-soft-deletes.md"), "utf8");

    const err = expectError(["adr", "Use soft deletes"]);
    expect(err.type).toBe("conflict");
    expect(readFileSync(join(root, "docs/adr/use-soft-deletes.md"), "utf8")).toBe(before);
  });

  test("a directory occupying the target path is a conflict, not a crash", () => {
    mkdirSync(join(root, "docs/adr/use-soft-deletes.md"), { recursive: true });
    expect(expectError(["adr", "Use soft deletes"]).type).toBe("conflict");
  });
});

describe("lore new — usage errors (exit 2)", () => {
  test("a missing type is a usage error", () => {
    expect(expectError([]).type).toBe("usage");
  });

  test("a missing title is a usage error", () => {
    expect(expectError(["adr"]).type).toBe("usage");
  });

  test("an extra positional is a usage error", () => {
    expect(expectError(["adr", "Title", "extra"]).type).toBe("usage");
  });

  test("a malformed --var (no key) is a usage error", () => {
    expect(expectError(["adr", "Title", "--var", "=value"]).type).toBe("usage");
  });

  test("a malformed --var (invalid key) is a usage error", () => {
    expect(expectError(["adr", "Title", "--var", "bad key=x"]).type).toBe("usage");
  });

  test("an unknown long flag is a usage error", () => {
    expect(expectError(["adr", "Title", "--bogus"]).type).toBe("usage");
  });

  test("an unknown short flag is a usage error", () => {
    expect(expectError(["adr", "Title", "-x"]).type).toBe("usage");
  });

  test("a value-taking flag with no value is a usage error", () => {
    expect(expectError(["adr", "Title", "--summary"]).type).toBe("usage");
  });

  test("a title with no slug-able content and no --out is a usage error", () => {
    expect(expectError(["adr", "!!! ---"]).type).toBe("usage");
  });

  test("an --out escaping the repo is a usage error", () => {
    expect(expectError(["adr", "Title", "--out", "../../etc/evil"]).type).toBe("usage");
  });

  test("a type containing path separators is a usage error (no bundle escape)", () => {
    expect(expectError(["../evil", "Title"]).type).toBe("usage");
  });

  test("a bare `-` type is a usage error", () => {
    expect(expectError(["-", "Title"]).type).toBe("usage");
  });

  test("a value-taking flag followed by another flag reports the missing value", () => {
    const err = expectError(["adr", "Title", "--summary", "--tags", "x"]);
    expect(err.type).toBe("usage");
    expect(err.message).toContain("--summary");
  });
});

describe("lore new — output path is confined to the bundle root", () => {
  test("--out outside docs/ is a usage error (no orphaned out-of-bundle file)", () => {
    const err = expectError(["adr", "Title", "--out", "src/notes.md"]);
    expect(err.type).toBe("usage");
    expect(existsSync(join(root, "src/notes.md"))).toBe(false);
  });

  test("--out onto the reserved root index docs/index.md is a usage error", () => {
    const before = readFileSync(join(root, "docs/index.md"), "utf8");
    expect(expectError(["reference", "Home", "--out", "docs/index.md"]).type).toBe("usage");
    // The init-owned root index (with okf_version) is untouched.
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toBe(before);
  });

  test("a path segment merely starting with `..` is confined by docs/, not the escape guard", () => {
    // `..notes` is a real segment, not a `..` parent escape: outside docs/ it fails the bundle
    // check (not a false 'escapes the repo'), and under docs/ it is a legitimate directory name.
    expect(expectError(["adr", "Title", "--out", "..notes/x"]).type).toBe("usage");
    const { result } = newCmd(["adr", "Title", "--out", "docs/..notes/x"]);
    expect(result.path).toBe("docs/..notes/x.md");
  });
});

describe("lore new — output rendering", () => {
  test("plain mode prints a single created line", () => {
    const stdout = capture();
    runNew({
      root,
      output: { mode: "plain", color: false },
      args: ["adr", "Use soft deletes"],
      clock: FIXED_CLOCK,
      stdout,
    });
    expect(stdout.lines()).toEqual(["created docs/adr/use-soft-deletes.md"]);
  });

  test("pretty mode summarizes the created concept", () => {
    const stdout = capture();
    runNew({
      root,
      output: { mode: "pretty", color: false },
      args: ["adr", "Use soft deletes"],
      clock: FIXED_CLOCK,
      stdout,
    });
    expect(stdout.text()).toContain("Created ADR adr/use-soft-deletes");
  });
});
