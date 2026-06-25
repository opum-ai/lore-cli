import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // `new` writes into docs/<dir>/; it does not require a full `init`, but the templates
  // directory is where user-template tests drop files, so ensure it exists up front.
  mkdirSync(join(root, ".lore/templates"), { recursive: true });
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
