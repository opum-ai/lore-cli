import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { BacklogAdapter } from "../src/adapters/backlog";
import {
  createRealPrompter,
  type InitOptions,
  type InitPrompter,
  type InitResult,
  runInit,
} from "../src/commands/init";
import { loadBundle } from "../src/core/bundle";
import { parseConcept } from "../src/core/concept";
import { EXIT_CODES, LoreError, reportError, WarningCollector } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, expectError, fakeAdapter } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const FIXED_CLOCK = (): Date => new Date("2026-06-25T12:00:00Z");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-init-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Run `init` in JSON mode and return the parsed `data` payload, exit code, and captured stderr.
 * Every field beyond `clock` is optional so the vast majority of tests (the pre-LORE-260 bare-init
 * behavior) read exactly as before; the wizard/flags/backlog-check tests pass the rest.
 */
async function init(
  extra: {
    clock?: () => Date;
    args?: string[];
    stdinIsTTY?: boolean;
    stderrIsTTY?: boolean;
    jsonRequested?: boolean;
    prompter?: InitPrompter;
    adapter?: BacklogAdapter;
  } = {},
): Promise<{ code: number; result: InitResult; stderr: string }> {
  const stdout = capture();
  const stderr = capture();
  const options: InitOptions = {
    root,
    output: JSON_CTX,
    stdout,
    stderr,
    clock: extra.clock ?? FIXED_CLOCK,
    args: extra.args,
    stdinIsTTY: extra.stdinIsTTY,
    // NOT derived from `output: JSON_CTX` above (review round 2): this helper always renders JSON
    // purely so tests can parse `result` — that is unrelated to whether the wizard should be
    // reachable, which is what `jsonRequested` (a real `--json` flag, per `InitOptions`'s own doc)
    // gates. Only a test that explicitly opts in (`jsonRequested: true`) exercises that veto.
    stderrIsTTY: extra.stderrIsTTY,
    jsonRequested: extra.jsonRequested,
    prompter: extra.prompter,
    adapter: extra.adapter,
  };
  const code = await runInit(options);
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: InitResult };
  expect(envelope.kind).toBe("init");
  return { code, result: envelope.data, stderr: stderr.text() };
}

/** A scripted {@link InitPrompter}: `agents`/`obsidian` answer the wizard's two confirms (in that call order), `site` answers the "which docs site" choice. Omitted answers fall through to the wizard's own default. */
function scriptedPrompter(answers: { agents?: boolean; site?: string; obsidian?: boolean }): InitPrompter {
  const confirmAnswers = [answers.agents, answers.obsidian];
  let confirmCalls = 0;
  return {
    confirm: async (_question, defaultValue) => confirmAnswers[confirmCalls++] ?? defaultValue,
    choose: async (_question, _choices, defaultValue) => answers.site ?? defaultValue,
    close: () => {},
  };
}

/** A prompter that fails the test if the wizard ever touches it — proves a flag-driven run bypasses the wizard entirely. */
function forbiddenPrompter(): InitPrompter {
  const fail = (method: string) => (): never => {
    throw new Error(`InitPrompter.${method} should not have been called — the wizard must not run`);
  };
  return { confirm: fail("confirm"), choose: fail("choose"), close: fail("close") };
}

describe("lore init — fresh bundle (AC#1)", () => {
  test("creates the full scaffold and exits 0", async () => {
    const { code, result } = await init();
    expect(code).toBe(0);
    expect(result.interactive).toBe(false);
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.backlog).toBeUndefined();
    expect(result.skipped).toEqual([]);
    expect(result.created).toEqual([
      ".lore/config.toml",
      ".lore/profile.toml",
      ".lore/.gitignore",
      ".lore/schemas/epic.schema.json",
      ".lore/schemas/story.schema.json",
      ".lore/schemas/spec.schema.json",
      ".lore/schemas/adr.schema.json",
      ".lore/schemas/runbook.schema.json",
      ".lore/schemas/reference.schema.json",
      ".lore/templates/.gitkeep",
      "docs/index.md",
    ]);
    for (const path of result.created) {
      expect(existsSync(join(root, path))).toBe(true);
    }
  });

  test("produces a conformant bundle: index.md parses and is the sole okf_version carrier", async () => {
    await init();
    const indexRaw = readFileSync(join(root, "docs/index.md"), "utf8");
    const concept = parseConcept("docs/index.md", indexRaw);
    expect(concept.type).toBe("Reference");
    expect(concept.frontmatter.okf_version).toBe("0.1");
    // No other emitted doc carries okf_version (reserved-root discipline).
    for (const path of [".lore/schemas/reference.schema.json", ".lore/config.toml"]) {
      expect(readFileSync(join(root, path), "utf8")).not.toContain("okf_version");
    }
  });

  test("loads cleanly: a freshly-initialized bundle yields no loadBundle warnings", async () => {
    await init();
    const warnings = new WarningCollector();
    const graph = loadBundle(join(root, "docs"), { warnings });
    expect(graph.concepts.has("index")).toBe(true);
    // The scaffolded index carries okf_version; lore must not warn about its own
    // conformant root index (the reserved-key exemption in schema.ts).
    expect(warnings.list()).toEqual([]);
  });

  test("stamps the index timestamp from the injected clock", async () => {
    await init({ clock: () => new Date("2026-01-02T03:04:05Z") });
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toContain("timestamp: 2026-01-02T03:04:05.000Z");
  });

  test("creates the gitignored cache directory", async () => {
    await init();
    expect(existsSync(join(root, ".lore/cache"))).toBe(true);
  });

  test("a pre-existing custom profile that retypes Reference does not crash init", async () => {
    // Regression: the reserved root index is lore's own structural file; it must serialize against
    // the built-in default, so a custom `Reference` adding a required field cannot abort init while
    // writing docs/index.md. The custom type's schema is still emitted under its slug.
    mkdirSync(join(root, ".lore"), { recursive: true });
    writeFileSync(
      join(root, ".lore/profile.toml"),
      [
        "[profile]",
        'name = "demo"',
        'okf_version = "0.1"',
        "[base.fields]",
        "type = { required = true }",
        "title = {}",
        "[[types]]",
        'name = "Reference"',
        "fields = { owner = { required = true } }",
      ].join("\n"),
    );
    const { code } = await init();
    expect(code).toBe(0);
    expect(existsSync(join(root, "docs/index.md"))).toBe(true);
    expect(existsSync(join(root, ".lore/schemas/reference.schema.json"))).toBe(true);
  });
});

describe("lore init — idempotent re-run (AC#2)", () => {
  test("a second run creates nothing, skips everything, and exits 0", async () => {
    await init();
    const before = readFileSync(join(root, "docs/index.md"), "utf8");

    // Re-run with a *different* clock: a write-if-absent re-run must not restamp.
    const { code, result } = await init({ clock: () => new Date("2030-12-31T23:59:59Z") });
    expect(code).toBe(0);
    expect(result.created).toEqual([]);
    expect(result.skipped.length).toBe(11);
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toBe(before);
  });

  test("never clobbers a user's existing index.md", async () => {
    mkdirSync(join(root, "docs"), { recursive: true });
    const custom = '---\ntype: Reference\ntitle: Mine\nokf_version: "0.1"\n---\n\n# Mine\n';
    writeFileSync(join(root, "docs/index.md"), custom);

    const { result } = await init();
    expect(result.skipped).toContain("docs/index.md");
    expect(result.created).not.toContain("docs/index.md");
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toBe(custom);
  });

  test("fills in only the missing pieces after a partial delete", async () => {
    await init();
    rmSync(join(root, ".lore/schemas/adr.schema.json"));

    const { code, result } = await init();
    expect(code).toBe(0);
    expect(result.created).toEqual([".lore/schemas/adr.schema.json"]);
    expect(result.skipped).toContain("docs/index.md");
    expect(existsSync(join(root, ".lore/schemas/adr.schema.json"))).toBe(true);
  });
});

describe("lore init — output rendering", () => {
  test("plain mode lists created paths, one per line", async () => {
    const stdout = capture();
    await runInit({ root, output: { mode: "plain", color: false }, stdout, clock: FIXED_CLOCK });
    const lines = stdout.lines();
    expect(lines).toContain("created docs/index.md");
    expect(lines).toContain("created .lore/schemas/adr.schema.json");
  });

  test("plain mode marks already-present paths as exists on re-run", async () => {
    await runInit({ root, output: { mode: "plain", color: false }, stdout: capture(), clock: FIXED_CLOCK });
    const stdout = capture();
    await runInit({ root, output: { mode: "plain", color: false }, stdout, clock: FIXED_CLOCK });
    expect(stdout.lines()).toContain("exists docs/index.md");
  });

  test("pretty mode summarizes the run and, on re-run, says nothing to create", async () => {
    const first = capture();
    await runInit({ root, output: { mode: "pretty", color: false }, stdout: first, clock: FIXED_CLOCK });
    expect(first.text()).toContain("Initialized lore bundle at");
    expect(first.text()).toContain("+ docs/index.md");

    const second = capture();
    await runInit({ root, output: { mode: "pretty", color: false }, stdout: second, clock: FIXED_CLOCK });
    expect(second.text()).toContain("already initialized");
  });

  test("pretty mode emits ANSI only when color is enabled", async () => {
    const colored = capture();
    await runInit({ root, output: { mode: "pretty", color: true }, stdout: colored, clock: FIXED_CLOCK });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting an ANSI escape is present.
    expect(colored.text()).toMatch(/\x1b\[/);
  });

  test("--agents/--obsidian actions show up in plain mode as their own lines", async () => {
    const stdout = capture();
    await runInit({
      root,
      output: { mode: "plain", color: false },
      stdout,
      clock: FIXED_CLOCK,
      args: ["--agents", "--obsidian"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const lines = stdout.lines();
    expect(lines.some((l) => /^agents-(created|updated) \.claude\/skills\/lore\/SKILL\.md$/.test(l))).toBe(true);
    expect(lines).toContain("scaffold-obsidian-created docs/.obsidian/app.json");
  });

  test("NIT-1: a second --scaffold mkdocs run reports up-to-date in plain mode instead of printing nothing", async () => {
    // `--scaffold` implies the backlog check; a fake adapter keeps this hermetic (never reaches a
    // real, host-dependent `backlog` subprocess).
    const adapter = fakeAdapter([], { probe: "ok" });
    await runInit({
      root,
      output: { mode: "plain", color: false },
      stdout: capture(),
      clock: FIXED_CLOCK,
      args: ["--scaffold", "mkdocs"],
      adapter,
    });
    const stdout = capture();
    await runInit({
      root,
      output: { mode: "plain", color: false },
      stdout,
      clock: FIXED_CLOCK,
      args: ["--scaffold", "mkdocs"],
      adapter,
    });
    expect(stdout.lines()).toContain("scaffold-mkdocs up-to-date");
  });

  test("NIT-1: pretty mode's own 'already up to date' wording is unchanged", async () => {
    const adapter = fakeAdapter([], { probe: "ok" });
    await runInit({
      root,
      output: { mode: "pretty", color: false },
      stdout: capture(),
      clock: FIXED_CLOCK,
      args: ["--scaffold", "mkdocs"],
      adapter,
    });
    const stdout = capture();
    await runInit({
      root,
      output: { mode: "pretty", color: false },
      stdout,
      clock: FIXED_CLOCK,
      args: ["--scaffold", "mkdocs"],
      adapter,
    });
    expect(stdout.text()).toContain("Scaffold (mkdocs):");
    expect(stdout.text()).toContain("already up to date");
  });

  test("MINOR-4: a hand-edited SKILL.md is reported `protected` (not green) with agents.ts's own actionable trailer reused verbatim", async () => {
    // Write a SKILL.md that differs from what `lore agents`/`lore init --agents` would generate, so
    // `applyAgentsBridge` (force:false) reports it `protected` rather than `created`/`updated` —
    // mirrors agents.test.ts's own "hand-edited SKILL.md" setup.
    mkdirSync(join(root, ".claude/skills/lore"), { recursive: true });
    writeFileSync(join(root, ".claude/skills/lore/SKILL.md"), "hand-edited, not lore-generated\n");

    const plainStdout = capture();
    await runInit({
      root,
      output: { mode: "plain", color: false },
      stdout: plainStdout,
      clock: FIXED_CLOCK,
      args: ["--agents"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const plainLines = plainStdout.lines();
    expect(plainLines).toContain("agents-protected .claude/skills/lore/SKILL.md");
    // LORE-129's trailer, reused from agents.ts's own renderTrailer -- previously dropped entirely
    // by init's fold-in, leaving no remedy visible to a --plain consumer.
    expect(plainLines.some((l) => l.includes("hand-edited") && l.includes("lore agents --force"))).toBe(true);

    const prettyStdoutColored = capture();
    await runInit({
      root,
      output: { mode: "pretty", color: true },
      stdout: prettyStdoutColored,
      clock: FIXED_CLOCK,
      args: ["--agents"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const prettyText = prettyStdoutColored.text();
    // "protected" must be painted yellow (a warning), never green (which would read as success) --
    // ANSI.yellow is \x1b[33m, ANSI.green is \x1b[32m.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence.
    expect(prettyText).toMatch(/\x1b\[33mprotected\x1b\[0m/);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence is ABSENT.
    expect(prettyText).not.toMatch(/\x1b\[32mprotected\x1b\[0m/);
    expect(prettyText).toContain("hand-edited");
    expect(prettyText).toContain("lore agents --force");
  });
});

describe("lore init — filesystem conflicts (a non-regular entry blocks the scaffold)", () => {
  /** Run init and assert it rejects with a `conflict` {@link LoreError}, returning it for further checks. */
  async function expectConflict(): Promise<LoreError> {
    try {
      await runInit({ root, output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
      return err as LoreError;
    }
    throw new Error("expected a conflict LoreError, but init returned");
  }

  test("a regular file where the `.lore` directory must go is a conflict, not an uncaught crash", async () => {
    // `mkdir -p` over a regular file fails with EEXIST — a user-fixable structural
    // conflict (exit 5 with a hint), not a mislabeled permission error or a raw crash.
    writeFileSync(join(root, ".lore"), "not a directory");
    const err = await expectConflict();
    expect(err.hint).toContain("remove or rename");
  });

  test("a directory where a scaffold file must go is a conflict, not a silent skip", async () => {
    // A directory occupying `docs/index.md` makes the `wx` write fail with EEXIST. It
    // must NOT be reported as a normally-existing file (which would claim success on a
    // malformed bundle) — it is surfaced as a conflict.
    mkdirSync(join(root, "docs", "index.md"), { recursive: true });
    await expectConflict();
  });

  // POSIX-only: Windows symlink creation needs privilege and its `wx`-over-a-symlink
  // semantics differ (the dangling link does not surface EEXIST the same way), so this
  // case is unreliable there. The non-regular-entry conflict path itself is covered
  // cross-platform by the directory test above (same lstat → not-a-regular-file branch).
  test.skipIf(process.platform === "win32")(
    "a symlink where a scaffold file must go is a conflict (lstat, not followed)",
    async () => {
      // A symlink (here dangling) occupying a scaffold file path also yields EEXIST on
      // the `wx` write; lstat sees the link itself, so it is treated as the non-regular
      // conflict it is rather than silently honored via its target.
      mkdirSync(join(root, ".lore"), { recursive: true });
      symlinkSync("nowhere", join(root, ".lore", ".gitignore"));
      await expectConflict();
    },
  );
});

describe("lore init — refuses to write through a pre-existing symlinked scaffold directory (LORE-77)", () => {
  /** Run init and assert it rejects with a `conflict` {@link LoreError}, returning it for further checks. */
  async function expectConflict(): Promise<LoreError> {
    try {
      await runInit({ root, output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
    } catch (err) {
      expect(err).toBeInstanceOf(LoreError);
      expect((err as LoreError).type).toBe("conflict");
      return err as LoreError;
    }
    throw new Error("expected a conflict LoreError, but init returned");
  }

  let outside: string;

  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), "lore-init-outside-"));
  });
  afterEach(() => {
    rmSync(outside, { recursive: true, force: true });
  });

  // POSIX-only, matching this file's existing symlink test's own skip guard above.
  test.skipIf(process.platform === "win32")(
    "docs already existing as a symlink is refused, not followed — nothing is written outside the repo",
    async () => {
      // The task's own repro: docs -> an external location, pre-existing when init runs.
      symlinkSync(outside, join(root, "docs"));
      const err = await expectConflict();
      expect(err.message).toContain("docs");
      expect(err.message.toLowerCase()).toContain("symlink");
      expect(existsSync(join(outside, "index.md"))).toBe(false);
    },
  );

  test.skipIf(process.platform === "win32")(
    ".lore already existing as a symlink is refused, not followed — nothing is written outside the repo",
    async () => {
      symlinkSync(outside, join(root, ".lore"));
      const err = await expectConflict();
      expect(err.message).toContain(".lore");
      expect(err.message.toLowerCase()).toContain("symlink");
      expect(existsSync(join(outside, "config.toml"))).toBe(false);
    },
  );

  test.skipIf(process.platform === "win32")(
    ".lore/schemas already existing as a symlink (a NESTED scaffold dir) is refused, not followed",
    async () => {
      // Confirms the guard walks every ancestor segment, not just the top-level names the task's
      // own description happens to list — `.lore/schemas` is itself one of `buildScaffold`'s planned
      // directories, nested one level under `.lore`.
      mkdirSync(join(root, ".lore"), { recursive: true });
      symlinkSync(outside, join(root, ".lore", "schemas"));
      const err = await expectConflict();
      expect(err.message).toContain(".lore/schemas");
      expect(err.message.toLowerCase()).toContain("symlink");
      expect(existsSync(join(outside, "epic.schema.json"))).toBe(false);
    },
  );
});

describe("lore init — flags run non-interactively with zero prompts (AC#2/AC#4)", () => {
  test("no flags at all: byte-identical to pre-LORE-260 behavior, no consumer folded in, no backlog check", async () => {
    const { result, stderr } = await init();
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.backlog).toBeUndefined();
    expect(stderr).toBe("");
  });

  test("--agents sets up the Claude Code agent bridge (SKILL.md + CLAUDE.md nudge)", async () => {
    // `--agents` implies the backlog check (below), so every flag test that includes it (or a
    // scaffold flag) injects a fake adapter — a real, host-dependent `backlog` subprocess must
    // never be reachable from a hermetic unit test.
    const { code, result } = await init({ args: ["--agents"], adapter: fakeAdapter([], { probe: "ok" }) });
    expect(code).toBe(0);
    expect(result.interactive).toBe(false);
    expect(result.agents?.files.map((f) => f.path).sort()).toEqual(
      [".claude/skills/lore/SKILL.md", "CLAUDE.md"].sort(),
    );
    expect(existsSync(join(root, ".claude/skills/lore/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(true);
  });

  test("--obsidian scaffolds the Obsidian vault config", async () => {
    const { code, result } = await init({ args: ["--obsidian"], adapter: fakeAdapter([], { probe: "ok" }) });
    expect(code).toBe(0);
    expect(result.scaffolds).toHaveLength(1);
    expect(result.scaffolds[0]?.target).toBe("obsidian");
    expect(existsSync(join(root, "docs/.obsidian/app.json"))).toBe(true);
  });

  test("--scaffold mkdocs --scaffold docusaurus scaffolds both, in the order given", async () => {
    const { result } = await init({
      args: ["--scaffold", "mkdocs", "--scaffold", "docusaurus"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.scaffolds.map((s) => s.target)).toEqual(["mkdocs", "docusaurus"]);
    expect(existsSync(join(root, "mkdocs.yml"))).toBe(true);
    expect(existsSync(join(root, "website/docusaurus.config.js"))).toBe(true);
  });

  test("--scaffold obsidian and --obsidian dedupe to a single scaffold run", async () => {
    const { result } = await init({
      args: ["--obsidian", "--scaffold", "obsidian"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.scaffolds.map((s) => s.target)).toEqual(["obsidian"]);
  });

  test("--scaffold with an unknown target is a usage error (exit 2)", () => {
    const err = expectError("usage", () =>
      runInit({ root, output: JSON_CTX, stdout: capture(), args: ["--scaffold", "bogus"] }),
    );
    expect(err.message).toContain("bogus");
  });

  test("--scaffold with no value is a usage error", () => {
    expectError("usage", () => runInit({ root, output: JSON_CTX, stdout: capture(), args: ["--scaffold"] }));
  });

  test("an unknown flag is a usage error, matching the pre-existing `lore init --bogus` contract", () => {
    const err = expectError("usage", () => runInit({ root, output: JSON_CTX, stdout: capture(), args: ["--bogus"] }));
    expect(err.message).toContain('unknown option "--bogus"');
  });

  test("a bare positional is still a usage error (init takes none), matching the pre-existing wording", () => {
    const err = expectError("usage", () => runInit({ root, output: JSON_CTX, stdout: capture(), args: ["extra"] }));
    expect(err.message).toContain("takes no arguments");
    expect(err.input).toEqual({ command: "init", unexpected: ["extra"] });
  });

  test("--check-backlog runs the check even with no other flag, reporting a capable binary", async () => {
    const { code, result, stderr } = await init({
      args: ["--check-backlog"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(code).toBe(0);
    expect(result.backlog).toEqual({ checked: true, capable: true, version: "1.47.1" });
    expect(stderr).toBe("");
  });

  test("--agents implies the backlog check, warning on stderr when backlog is absent (advisory only, exit stays 0)", async () => {
    const { code, result, stderr } = await init({
      args: ["--agents"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "`backlog` was not found on PATH.", "install it") }),
    });
    expect(code).toBe(0);
    expect(result.agents).toBeDefined();
    expect(result.backlog?.capable).toBe(false);
    expect(result.backlog?.warning).toContain("not found on PATH");
    expect(stderr).toContain("warning:");
    expect(stderr).toContain("backlog coupling unavailable");
  });

  test("--no-backlog skips the check even when --agents would otherwise imply it", async () => {
    const { result, stderr } = await init({
      args: ["--agents", "--no-backlog"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "should never be reached", "") }),
    });
    expect(result.agents).toBeDefined();
    expect(result.backlog).toBeUndefined();
    expect(stderr).toBe("");
  });

  test("--no-backlog and --check-backlog together is a usage error", () => {
    expectError("usage", () =>
      runInit({ root, output: JSON_CTX, stdout: capture(), args: ["--no-backlog", "--check-backlog"] }),
    );
  });
});

describe("lore init — idempotent re-run with flags (AC#3)", () => {
  const okAdapter = () => fakeAdapter([], { probe: "ok" });

  test("a second --agents run reports every bridge file unchanged", async () => {
    await init({ args: ["--agents"], adapter: okAdapter() });
    const { result } = await init({ args: ["--agents"], adapter: okAdapter() });
    expect(result.agents?.files.length).toBeGreaterThan(0);
    expect(result.agents?.files.every((f) => f.action === "unchanged")).toBe(true);
  });

  test("a second --scaffold mkdocs run writes nothing (mirrors LORE-263's no-op re-run)", async () => {
    await init({ args: ["--scaffold", "mkdocs"], adapter: okAdapter() });
    const { result } = await init({ args: ["--scaffold", "mkdocs"], adapter: okAdapter() });
    expect(result.scaffolds[0]?.files).toEqual([]);
  });

  test("a second --obsidian run writes nothing", async () => {
    await init({ args: ["--obsidian"], adapter: okAdapter() });
    const { result } = await init({ args: ["--obsidian"], adapter: okAdapter() });
    expect(result.scaffolds[0]?.files).toEqual([]);
  });
});

describe("lore init — the interactive wizard is TTY-gated (AC#1/AC#2, the locked design decision)", () => {
  test("a bare invocation on a TTY runs the wizard and applies every 'yes' answer, in order", async () => {
    const prompter = scriptedPrompter({ agents: true, site: "mkdocs", obsidian: true });
    const { code, result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(code).toBe(0);
    expect(result.interactive).toBe(true);
    expect(result.agents).toBeDefined();
    expect(result.scaffolds.map((s) => s.target)).toEqual(["mkdocs", "obsidian"]);
    expect(result.backlog).toEqual({ checked: true, capable: true, version: "1.47.1" });
    expect(existsSync(join(root, "mkdocs.yml"))).toBe(true);
    expect(existsSync(join(root, "docs/.obsidian/app.json"))).toBe(true);
  });

  test("declining every wizard question sets up nothing beyond the base scaffold, but backlog is still (always) checked", async () => {
    const prompter = scriptedPrompter({ agents: false, site: "none", obsidian: false });
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.backlog?.checked).toBe(true);
  });

  test("an empty answer (bare Enter) falls through to each question's own default", async () => {
    // scriptedPrompter with no answers at all -> every confirm/choose returns undefined,
    // which the prompter contract says means "use defaultValue": true for the agents bridge
    // question, "none" for the docs-site choice, false for Obsidian (matching the wizard's own docs).
    const prompter = scriptedPrompter({});
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.agents).toBeDefined(); // agents bridge defaults to "yes"
    expect(result.scaffolds).toEqual([]); // docs-site defaults to "none", Obsidian defaults to "no"
  });

  test("ANY flag bypasses the wizard even on a TTY — the prompter is never touched (AC#2)", async () => {
    // `--agents` implies the backlog check (see the flags describe block above), so a fake adapter
    // is injected here too — a real, host-dependent `backlog` subprocess must never be reachable
    // from a hermetic unit test.
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: forbiddenPrompter(),
      args: ["--agents"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.interactive).toBe(false);
    expect(result.agents).toBeDefined();
  });

  test("--yes alone on a TTY skips the wizard and applies the bare non-interactive defaults", async () => {
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: forbiddenPrompter(),
      args: ["--yes"],
    });
    expect(result.interactive).toBe(false);
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.backlog).toBeUndefined();
  });

  test("--non-interactive is a plain alias for --yes (NIT-2)", async () => {
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: forbiddenPrompter(),
      args: ["--non-interactive"],
    });
    expect(result.interactive).toBe(false);
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.backlog).toBeUndefined();
  });

  test("a non-TTY stdin never enters the wizard, no matter what — the non-negotiable off-TTY guarantee (AC#2)", async () => {
    // stderrIsTTY:true proves stdin's own state is still load-bearing on its own — a TTY stderr
    // does not compensate for a non-TTY stdin.
    const { result } = await init({ stdinIsTTY: false, stderrIsTTY: true, prompter: forbiddenPrompter() });
    expect(result.interactive).toBe(false);
  });

  test("omitting stdinIsTTY altogether defaults to non-interactive (never assumes a TTY by surprise)", async () => {
    const { result } = await init({ prompter: forbiddenPrompter() });
    expect(result.interactive).toBe(false);
  });

  test("BLOCKING-1: a TTY stdin with a non-TTY stderr never enters the wizard — every wizard question is written to stderr, so a redirected stderr would leave the wizard blocked on an invisible prompt", async () => {
    // stdinIsTTY:true alone used to be sufficient to enter the wizard (the exact bug reproduced
    // live against `lore-setup.sh`'s own `cmd >/dev/null 2>&1` idiom: stdin stays a readable TTY,
    // stderr is redirected, and every prompt is invisible while the process still blocks on it).
    const { result } = await init({ stdinIsTTY: true, stderrIsTTY: false, prompter: forbiddenPrompter() });
    expect(result.interactive).toBe(false);
  });

  test("omitting stderrIsTTY altogether defaults to non-interactive even with a TTY stdin (never assumes a TTY by surprise)", async () => {
    const { result } = await init({ stdinIsTTY: true, prompter: forbiddenPrompter() });
    expect(result.interactive).toBe(false);
  });

  test("BLOCKING-1's sibling: --json forces non-interactive even at a genuinely interactive terminal (both streams TTY) — a machine-readable run must never prompt", async () => {
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      jsonRequested: true,
      prompter: forbiddenPrompter(),
    });
    expect(result.interactive).toBe(false);
  });

  test("a scaffold conflict during the wizard surfaces as the same `conflict` error `lore scaffold` itself throws", async () => {
    mkdirSync(join(root, "docs/.obsidian"), { recursive: true });
    writeFileSync(join(root, "docs/.obsidian/app.json"), "{}");
    const prompter = scriptedPrompter({ agents: false, site: "none", obsidian: true });
    await expect(
      init({ stdinIsTTY: true, stderrIsTTY: true, prompter, adapter: fakeAdapter([], { probe: "ok" }) }),
    ).rejects.toThrow(LoreError);
  });
});

describe("lore init — EOF (Ctrl-D) mid-wizard is a `usage` error, not a silent exit 0 (BLOCKING-2, review round 2)", () => {
  test("a rejecting prompter (simulating a closed stdin) surfaces as a usage LoreError and still closes the prompter", async () => {
    // The wizard-level contract, independent of `createRealPrompter`'s own implementation: whatever
    // makes the injected InitPrompter reject (a closed real readline session, or here a scripted
    // stand-in) must propagate out of `runInit` as a thrown error rather than resolving with a
    // number, AND `runInteractiveWizard`'s `finally { prompter.close() }` must still run even though
    // the confirm/choose call it's waiting on never resolved cleanly.
    let closed = false;
    const eofError = new LoreError(
      "usage",
      "stdin closed before the init wizard finished (EOF/Ctrl-D)",
      "answer every prompt, or run prompt-free with `lore init --yes`",
    );
    const prompter: InitPrompter = {
      confirm: () => Promise.reject(eofError),
      choose: () => Promise.reject(eofError),
      close: () => {
        closed = true;
      },
    };
    await expect(
      runInit({ root, output: JSON_CTX, stdinIsTTY: true, stderrIsTTY: true, prompter, clock: FIXED_CLOCK }),
    ).rejects.toThrow(LoreError);
    expect(closed).toBe(true);
  });

  test("the closed-prompter rejection maps to exit 2 with a rendered --json error envelope on stderr, and stdout stays silent (no half-written envelope)", async () => {
    // Goes through the SAME seam `cli.ts` uses (`reportError`) rather than re-deriving the mapping,
    // proving the fix closes the exact gap BLOCKING-2 reported: exit 0 with zero stdout bytes under
    // `--json` (a parse error for a `| jq` consumer expecting either a valid envelope or a
    // classified failure).
    const eofError = new LoreError("usage", "stdin closed before the init wizard finished (EOF/Ctrl-D)", "hint");
    const prompter: InitPrompter = {
      confirm: () => Promise.reject(eofError),
      choose: () => Promise.reject(eofError),
      close: () => {},
    };
    const stdout = capture();
    const stderr = capture();
    let caught: unknown;
    try {
      await runInit({ root, output: JSON_CTX, stdinIsTTY: true, stderrIsTTY: true, prompter, stdout, stderr });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LoreError);
    const code = reportError(caught, { json: true, stderr });
    expect(code).toBe(EXIT_CODES.usage);
    expect(stdout.text()).toBe(""); // stdout stays silent -- never a half-written success envelope
    const envelope = JSON.parse(stderr.text()) as { error_type: string; message: string };
    expect(envelope.error_type).toBe("usage");
    expect(envelope.message).toContain("EOF");
  });

  describe("createRealPrompter's own EOF handling over real (fake) streams", () => {
    test("stdin ending while a question is pending rejects that question with a usage LoreError", async () => {
      const input = new PassThrough();
      const output = new PassThrough();
      // Swallow the prompt bytes so a slow CI runner never backs up the PassThrough's internal buffer.
      output.resume();
      const prompter = createRealPrompter({ input, output });
      const confirmPromise = prompter.confirm("Set up the Claude Code agent bridge?", true);
      input.end(); // simulate stdin EOF (Ctrl-D) while the question is still outstanding
      await expect(confirmPromise).rejects.toThrow(LoreError);
      await expect(confirmPromise).rejects.toThrow(/EOF|Ctrl-D/);
    });

    test("a normal answer still resolves, and close() afterward raises no unhandled rejection", async () => {
      const input = new PassThrough();
      const output = new PassThrough();
      output.resume();
      const prompter = createRealPrompter({ input, output });
      const confirmPromise = prompter.confirm("Set up the Claude Code agent bridge?", true);
      input.write("y\n"); // stdin stays open -- this answers the question before any EOF
      expect(await confirmPromise).toBe(true);
      // The wizard's own `finally` always calls close() after a successful run too; this must not
      // throw or produce an unhandled rejection now that a real `close` event fires from OUR OWN
      // call rather than from stdin's EOF.
      prompter.close();
      input.end();
    });
  });
});
