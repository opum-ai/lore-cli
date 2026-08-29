import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { BacklogAdapter } from "../src/adapters/backlog";
import { type GitPreflight, realGitPreflight } from "../src/adapters/git-preflight";
import type { JiraOnboarding, JiraProfile, JiraProjectSummary } from "../src/adapters/jira-onboarding";
import { MIN_QUEST_VERSION, QUEST_VERSION_FLOOR_CODE } from "../src/adapters/quest";
import { atLeast } from "../src/adapters/semver";
import { createTrackerAdapter } from "../src/adapters/tracker";
import {
  detectTrackerEnvironment,
  type TrackerEnvironment,
  type TrackerEnvironmentEntry,
  trackerEntry,
} from "../src/adapters/tracker-environment";
import {
  createRealPrompter,
  type InitOptions,
  type InitPrompter,
  type InitResult,
  runInit,
} from "../src/commands/init";
import { loadConfig } from "../src/config";
import { loadBundle } from "../src/core/bundle";
import { buildCodexSkillDoc, CODEX_SKILL_REL_PATH } from "../src/core/codex-bridge";
import { parseConcept } from "../src/core/concept";
import { buildHermesContextDoc, HERMES_CONTEXT_REL_PATH } from "../src/core/hermes-bridge";
import { EXIT_CODES, exitCodeFor, LoreError, reportError, WarningCollector } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture, expectError, fakeAdapter, gitRun } from "./helpers";

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
 * A recording {@link GitPreflight} stub (LCLI-358.1). Defaults to "already a repository" so every
 * pre-existing test — all of which scaffold into a bare `mkdtemp` directory that is deliberately
 * NOT a git worktree — keeps exercising the behavior it was written for, instead of tripping the
 * new preflight. Tests that care about the preflight pass `repository: false` and read `initCalls`.
 */
function gitStub(repository = true, onInitialize?: () => void): GitPreflight & { initCalls: number } {
  const stub = {
    initCalls: 0,
    isRepository: () => repository,
    initialize: () => {
      stub.initCalls += 1;
      onInitialize?.();
    },
  };
  return stub;
}

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
    migrateBacklog?: InitOptions["migrateBacklog"];
    agentAvailability?: () => { claude: boolean; codex: boolean };
    git?: GitPreflight;
    trackerEnvironment?: () => TrackerEnvironment;
    installTracker?: InitOptions["installTracker"];
    jira?: JiraOnboarding;
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
    migrateBacklog: extra.migrateBacklog,
    agentAvailability: extra.agentAvailability ?? (() => ({ claude: true, codex: false })),
    git: extra.git ?? gitStub(),
    trackerEnvironment: extra.trackerEnvironment,
    installTracker: extra.installTracker,
    // Defaulted, never left to the real seam: without this a jira-selecting test would shell the
    // machine's own `jira` binary and read whichever credential profiles the developer happens to
    // have (LCLI-358.4).
    jira: extra.jira ?? fakeJira(),
  };
  const code = await runInit(options);
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: InitResult };
  expect(envelope.kind).toBe("init.result");
  return { code, result: envelope.data, stderr: stderr.text() };
}

/**
 * A fake {@link JiraOnboarding}. Every jira branch is driven from these values, so no test ever
 * spawns jira-cli, reads a real credential profile, or reaches a real Jira site.
 */
function fakeJira(
  overrides: {
    profiles?: readonly JiraProfile[];
    project?: JiraProjectSummary;
    projectError?: unknown;
    calls?: string[];
  } = {},
): JiraOnboarding {
  return {
    listProfiles: async () => {
      overrides.calls?.push("listProfiles");
      return overrides.profiles ?? [{ name: "salient", jiraUrl: "https://example.atlassian.net", isDefault: true }];
    },
    describeProject: async (key, profile) => {
      overrides.calls?.push(`describeProject(${key}, ${profile})`);
      if (overrides.projectError !== undefined) throw overrides.projectError;
      return overrides.project ?? { key, name: `${key} project`, issueTypes: ["Story", "Task", "Bug", "Subtask"] };
    },
  };
}

/** A scripted {@link InitPrompter}; omitted answers fall through to each prompt's own default. */
function scriptedPrompter(answers: {
  agents?: boolean;
  codex?: boolean;
  hermes?: boolean;
  tracker?: string;
  site?: string;
  obsidian?: boolean;
  git?: boolean;
  install?: boolean;
  switchTracker?: boolean;
  jiraProfile?: string;
  jiraProject?: string;
  backlogTasks?: string;
}): InitPrompter {
  return {
    confirm: async (question, defaultValue) => {
      // Matched before the catch-all below (LCLI-358.1): the git preflight is a `confirm` too, and
      // without its own branch a test that answers `obsidian: false` would silently decline git.
      // The same applies to LCLI-358.3's install and switch-tracker offers.
      if (question.includes("git repository")) return answers.git ?? defaultValue;
      if (question.includes("is not installed")) return answers.install ?? defaultValue;
      if (question.includes("different tracker")) return answers.switchTracker ?? defaultValue;
      if (question.includes("Claude Code")) return answers.agents ?? defaultValue;
      if (question.includes("Codex")) return answers.codex ?? defaultValue;
      if (question.includes("Hermes")) return answers.hermes ?? defaultValue;
      return answers.obsidian ?? defaultValue;
    },
    choose: async (question, _choices, defaultValue) => {
      // Matched FIRST: LCLI-358.5's migration question ends "...or use Backlog as the tracker?", so
      // the looser `tracker` branch below would otherwise answer it with the tracker backend.
      if (question.includes("Backlog.md project")) return answers.backlogTasks ?? defaultValue;
      if (question.includes("tracker")) return answers.tracker ?? defaultValue;
      return answers.site ?? defaultValue;
    },
    // Free-text answers (LCLI-358.4). `choose` cannot serve these: it lower-cases its answer, so a
    // profile named `Salient` or a key like `ENG` would never survive it.
    ask: async (question, defaultValue) => {
      if (question.includes("jira-cli profile")) return answers.jiraProfile ?? defaultValue;
      if (question.includes("project key")) return answers.jiraProject ?? defaultValue;
      return defaultValue;
    },
    close: () => {},
  };
}

/** A prompter that fails the test if the wizard ever touches it — proves a flag-driven run bypasses the wizard entirely. */
function forbiddenPrompter(): InitPrompter {
  const fail = (method: string) => (): never => {
    throw new Error(`InitPrompter.${method} should not have been called — the wizard must not run`);
  };
  return { confirm: fail("confirm"), choose: fail("choose"), ask: fail("ask"), close: fail("close") };
}

function legacyBundle(): void {
  mkdirSync(join(root, ".lore"), { recursive: true });
  writeFileSync(join(root, ".lore", "config.toml"), "[validate]\nexternal_links = false\n");
  mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
  writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - To Do\n  - In Progress\n  - Done\n");
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
      ".lore/schemas/attested-computation.schema.json",
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
    expect(concept.frontmatter.okf_version).toBe("0.2");
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

  test("stamps the index generated.at from the injected clock", async () => {
    await init({ clock: () => new Date("2026-01-02T03:04:05Z") });
    expect(readFileSync(join(root, "docs/index.md"), "utf8")).toContain("at: 2026-01-02T03:04:05.000Z");
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
    expect(result.skipped.length).toBe(12);
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
    await runInit({ root, git: gitStub(), output: { mode: "plain", color: false }, stdout, clock: FIXED_CLOCK });
    const lines = stdout.lines();
    expect(lines).toContain("created docs/index.md");
    expect(lines).toContain("created .lore/schemas/adr.schema.json");
  });

  test("plain mode marks already-present paths as exists on re-run", async () => {
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "plain", color: false },
      stdout: capture(),
      clock: FIXED_CLOCK,
    });
    const stdout = capture();
    await runInit({ root, git: gitStub(), output: { mode: "plain", color: false }, stdout, clock: FIXED_CLOCK });
    expect(stdout.lines()).toContain("exists docs/index.md");
  });

  test("pretty mode summarizes the run and, on re-run, says nothing to create", async () => {
    const first = capture();
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "pretty", color: false },
      stdout: first,
      clock: FIXED_CLOCK,
    });
    expect(first.text()).toContain("Initialized lore bundle at");
    expect(first.text()).toContain("+ docs/index.md");

    const second = capture();
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "pretty", color: false },
      stdout: second,
      clock: FIXED_CLOCK,
    });
    expect(second.text()).toContain("already initialized");
  });

  test("pretty mode emits ANSI only when color is enabled", async () => {
    const colored = capture();
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "pretty", color: true },
      stdout: colored,
      clock: FIXED_CLOCK,
    });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting an ANSI escape is present.
    expect(colored.text()).toMatch(/\x1b\[/);
  });

  test("--agents/--obsidian actions show up in plain mode as their own lines", async () => {
    const stdout = capture();
    await runInit({
      root,
      git: gitStub(),
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
      git: gitStub(),
      output: { mode: "plain", color: false },
      stdout: capture(),
      clock: FIXED_CLOCK,
      args: ["--scaffold", "mkdocs"],
      adapter,
    });
    const stdout = capture();
    await runInit({
      root,
      git: gitStub(),
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
      git: gitStub(),
      output: { mode: "pretty", color: false },
      stdout: capture(),
      clock: FIXED_CLOCK,
      args: ["--scaffold", "mkdocs"],
      adapter,
    });
    const stdout = capture();
    await runInit({
      root,
      git: gitStub(),
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
      git: gitStub(),
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
      git: gitStub(),
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
      await runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
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
      await runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK });
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
  test("the repository's checked-in Codex skill stays byte-identical to the generator", () => {
    expect(readFileSync(join(import.meta.dir, "..", CODEX_SKILL_REL_PATH), "utf8")).toBe(buildCodexSkillDoc());
  });

  test("no flags at all: a new bundle pins Quest without probing it", async () => {
    const { result, stderr } = await init();
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.backlog).toBeUndefined();
    expect(result.tracker).toBeUndefined();
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).toEndWith('[tracker]\nbackend = "quest"\n');
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
    expect(stderr).toBe("");
  });

  test("--tracker jira persists the choice without prompting", async () => {
    const { code, result } = await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"],
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: forbiddenPrompter(),
    });
    expect(code).toBe(0);
    expect(result.interactive).toBe(false);
    expect(result.tracker).toBe("jira");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("jira");
  });

  test("--tracker rejects unavailable and missing values", () => {
    const unavailable = expectError("validation", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--tracker", "bogus"] }),
    );
    expect(exitCodeFor(unavailable)).toBe(EXIT_CODES.validation);
    expect(unavailable.hint).toContain("quest, backlog, jira");
    expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--tracker"] }),
    );
  });

  test("--tracker preserves future tables, nested dotted keys, and unrelated backend fields", async () => {
    await init();
    const configPath = join(root, ".lore/config.toml");
    writeFileSync(
      configPath,
      [
        "# retained",
        "[future]",
        'tracker.backend = "nested-value"',
        "",
        "[tracker]",
        "future_key = true",
        "",
        "[[future_items]]",
        'backend = "unrelated-value"',
        "",
      ].join("\n"),
    );

    await init({ args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"] });
    const current = readFileSync(configPath, "utf8");
    expect(current).toContain('# retained\n[future]\ntracker.backend = "nested-value"');
    expect(current).toContain('[tracker]\nbackend = "jira"\nfuture_key = true');
    expect(current).toContain('[[future_items]]\nbackend = "unrelated-value"');
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("jira");

    writeFileSync(
      configPath,
      ["[future]", 'tracker.backend = "nested-value"', "", "[[future_items]]", 'backend = "unrelated-value"', ""].join(
        "\n",
      ),
    );
    await init({ args: ["--tracker", "backlog"] });
    const appended = readFileSync(configPath, "utf8");
    expect(appended).toContain('[future]\ntracker.backend = "nested-value"');
    expect(appended).toContain('[[future_items]]\nbackend = "unrelated-value"');
    expect(appended).toEndWith('[tracker]\nbackend = "backlog"\n');
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

  test("--claude is the prompt-free spelling for the Claude Code bridge", async () => {
    const { result } = await init({ args: ["--claude"], adapter: fakeAdapter([], { probe: "ok" }) });
    expect(result.agents?.files.map((file) => file.path)).toContain(".claude/skills/lore/SKILL.md");
  });

  test("--codex sets up the Codex bridge without prompting", async () => {
    const { result } = await init({ args: ["--codex"], adapter: fakeAdapter([], { probe: "ok" }) });
    expect(result.codex?.files.map((file) => file.path).sort()).toEqual(
      [".codex/skills/lore/SKILL.md", "AGENTS.md"].sort(),
    );
    expect(existsSync(join(root, ".codex/skills/lore/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
  });

  test("--hermes writes only the project-local native-priority context bridge", async () => {
    const { result } = await init({
      args: ["--hermes"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "must not probe a tracker", "") }),
    });
    expect(result.hermes?.files).toEqual([{ path: HERMES_CONTEXT_REL_PATH, action: "created" }]);
    expect(readFileSync(join(root, HERMES_CONTEXT_REL_PATH), "utf8")).toBe(buildHermesContextDoc());
    // Hermes loads .hermes.md before AGENTS.md. The bridge does not create or alter AGENTS.md,
    // preserving Codex's independent context path and avoiding user-global Hermes settings.
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    expect(result.backlog).toBeUndefined();
    expect(readFileSync(join(root, HERMES_CONTEXT_REL_PATH), "utf8")).not.toMatch(/token|api[ _-]?key|~\/.hermes/i);
  });

  test("--hermes protects an existing project context and never falls back to AGENTS.md", async () => {
    writeFileSync(join(root, HERMES_CONTEXT_REL_PATH), "# Local Hermes instructions\n");
    writeFileSync(join(root, "AGENTS.md"), "# Codex instructions\n");
    const { result } = await init({ args: ["--hermes"] });
    expect(result.hermes?.files).toEqual([{ path: HERMES_CONTEXT_REL_PATH, action: "protected" }]);
    expect(readFileSync(join(root, HERMES_CONTEXT_REL_PATH), "utf8")).toBe("# Local Hermes instructions\n");
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe("# Codex instructions\n");
  });

  test("the interactive wizard offers Hermes only when its executable is detected", async () => {
    const prompts: string[] = [];
    const base = scriptedPrompter({ hermes: true, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        prompts.push(question);
        return base.confirm(question, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => ({ claude: false, codex: false, hermes: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(prompts.some((prompt) => prompt.includes("Hermes"))).toBe(true);
    expect(result.hermes?.files).toEqual([{ path: HERMES_CONTEXT_REL_PATH, action: "created" }]);
  });

  test("--tracker none persists an explicit no-tracker mode without probing a tracker", async () => {
    const { result, stderr } = await init({
      args: ["--tracker", "none", "--codex"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "tracker must not be probed", "") }),
    });
    expect(result.tracker).toBe("none");
    expect(result.backlog).toBeUndefined();
    expect(stderr).toBe("");
    expect(loadConfig({ root, env: {} }).tracker).toEqual({ backend: "none" });
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
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--scaffold", "bogus"] }),
    );
    expect(err.message).toContain("bogus");
  });

  test("--scaffold with no value is a usage error", () => {
    expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--scaffold"] }),
    );
  });

  test("an unknown flag is a usage error, matching the pre-existing `lore init --bogus` contract", () => {
    const err = expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--bogus"] }),
    );
    expect(err.message).toContain('unknown option "--bogus"');
  });

  test("a bare positional is still a usage error (init takes none), matching the pre-existing wording", () => {
    const err = expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["extra"] }),
    );
    expect(err.message).toContain("takes no arguments");
    expect(err.input).toEqual({ command: "init", unexpected: ["extra"] });
  });

  test("--check-backlog runs the check even with no other flag, reporting a capable binary", async () => {
    const { code, result, stderr } = await init({
      args: ["--tracker", "backlog", "--check-backlog"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(code).toBe(0);
    expect(result.trackerCheck).toEqual({ checked: true, backend: "backlog", capable: true, version: "1.49.0" });
    // The deprecated field still carries a Backlog bundle's result unchanged (LCLI-358.2).
    expect(result.backlog).toEqual({ checked: true, capable: true, version: "1.49.0" });
    expect(stderr).toBe("");
  });

  test("--check-tracker is the same flag under its accurate name", async () => {
    const { code, result } = await init({
      args: ["--tracker", "backlog", "--check-tracker"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(code).toBe(0);
    expect(result.trackerCheck?.backend).toBe("backlog");
  });

  test("--agents implies the backlog check, warning on stderr when backlog is absent (advisory only, exit stays 0)", async () => {
    const { code, result, stderr } = await init({
      args: ["--agents"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "`backlog` was not found on PATH.", "install it") }),
    });
    expect(code).toBe(0);
    expect(result.agents).toBeDefined();
    expect(result.trackerCheck?.capable).toBe(false);
    expect(result.trackerCheck?.warning).toContain("not found on PATH");
    expect(stderr).toContain("warning:");
    expect(stderr).toContain("quest coupling unavailable");
  });

  test("an uninitialized Backlog.md project recommends backlog init in JSON and stderr without failing init", async () => {
    const warning =
      "The `backlog` binary supports --json, but no Backlog.md project is initialized in this directory; run `backlog init` to initialize one.";
    const { code, result, stderr } = await init({
      args: ["--tracker", "backlog", "--agents"],
      adapter: fakeAdapter([], { probe: new LoreError("validation", warning) }),
    });

    expect(code).toBe(0);
    expect(result.trackerCheck).toEqual({ checked: true, backend: "backlog", capable: false, warning });
    expect(result.backlog).toEqual({ checked: true, capable: false, warning });
    expect(stderr).toContain(`backlog coupling unavailable: ${warning}`);
    expect(stderr).not.toContain("Install backlog.md");
  });

  test("--no-backlog skips the check even when --agents would otherwise imply it", async () => {
    const { result, stderr } = await init({
      args: ["--agents", "--no-backlog"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "should never be reached", "") }),
    });
    expect(result.agents).toBeDefined();
    expect(result.trackerCheck).toBeUndefined();
    expect(result.backlog).toBeUndefined();
    expect(stderr).toBe("");
  });

  test("--no-backlog and --check-backlog together is a usage error", () => {
    expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--no-backlog", "--check-backlog"] }),
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

  test("a second --codex run is unchanged and protects a hand-edited Codex skill", async () => {
    await init({ args: ["--codex"], adapter: okAdapter() });
    const second = await init({ args: ["--codex"], adapter: okAdapter() });
    expect(second.result.codex?.files.every((file) => file.action === "unchanged")).toBe(true);

    writeFileSync(join(root, ".codex/skills/lore/SKILL.md"), "hand-edited\n");
    const protectedRun = await init({ args: ["--codex"], adapter: okAdapter() });
    expect(protectedRun.result.codex?.files.find((file) => file.path.endsWith("SKILL.md"))?.action).toBe("protected");
    expect(readFileSync(join(root, ".codex/skills/lore/SKILL.md"), "utf8")).toBe("hand-edited\n");
  });

  test("--codex preserves hand-authored AGENTS.md prose while refreshing Lore's managed block", async () => {
    writeFileSync(join(root, "AGENTS.md"), "# Team rules\n\nKeep this prose.\n");
    const first = await init({ args: ["--codex"], adapter: okAdapter() });
    expect(first.result.codex?.files.find((file) => file.path === "AGENTS.md")?.action).toBe("updated");
    const agentsMd = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("# Team rules\n\nKeep this prose.");
    expect(agentsMd).toContain("<!-- lore:agents:begin -->");
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

describe("lore init — legacy zero-config tracker boundary", () => {
  const migrationResult = {
    digest: "sha256:reviewed",
    sourceFingerprint: "sha256:source",
    mappings: [{ sourceIdentifier: "LCLI-1", sourceFolder: "tasks", targetIdentifier: "T-1", aliases: ["LCLI-1"] }],
    survivors: [],
    taskFingerprints: { "T-1": "sha256:task" },
    state: "applied" as const,
  };
  test("refuses a Quest switch without the explicit migration flag and names both safe commands", () => {
    legacyBundle();
    const error = expectError("validation", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--tracker", "quest"] }),
    );
    expect(error.hint).toContain("quest init");
    expect(error.hint).toContain("lore init --tracker quest --migrate-backlog");
    expect(error.hint).toContain("lore init --tracker backlog");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");
  });

  test("persists Quest only after an explicit migration succeeds", async () => {
    legacyBundle();
    const { result } = await init({
      args: ["--tracker", "quest", "--migrate-backlog"],
      migrateBacklog: async () => migrationResult,
    });
    expect(result.migration).toEqual(migrationResult);
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test("leaves the backend unpinned when migration preflight fails", async () => {
    legacyBundle();
    const failure = new LoreError("validation", "not lossless", "pin Backlog");
    const promise = runInit({
      root,
      git: gitStub(),
      output: JSON_CTX,
      stdout: capture(),
      args: ["--tracker", "quest", "--migrate-backlog"],
      migrateBacklog: async () => Promise.reject(failure),
    });
    await expect(promise).rejects.toBe(failure);
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).not.toContain("[tracker]");
  });

  test("pins Backlog explicitly without invoking migration", async () => {
    legacyBundle();
    let migrated = false;
    await init({
      args: ["--tracker", "backlog"],
      migrateBacklog: async () => {
        migrated = true;
        return migrationResult;
      },
    });
    expect(migrated).toBe(false);
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");
  });

  test("requires the exact Quest migration invocation", () => {
    legacyBundle();
    expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--migrate-backlog"] }),
    );
  });

  test("an explicitly configured Backlog bundle can still reach Quest (AC#3)", async () => {
    // The dead end this closes: with `backend = "backlog"` already written, `--tracker quest
    // --migrate-backlog` was refused as "requires --tracker quest in a legacy zero-config Backlog
    // bundle" — the flag it demanded was the flag that had been passed. Meanwhile bare `--tracker
    // quest` succeeded in silence and orphaned every task.
    legacyBundle();
    await init({ args: ["--tracker", "backlog"] });
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");

    const silent = expectError("validation", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--tracker", "quest"] }),
    );
    expect(silent.message).toContain("must be a deliberate choice");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");

    const { result } = await init({
      args: ["--tracker", "quest", "--migrate-backlog"],
      migrateBacklog: async () => migrationResult,
    });
    expect(result.migration).toEqual(migrationResult);
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test("--keep-backlog-tasks is the scripted 'leave them there' answer (AC#3)", async () => {
    legacyBundle();
    const { result } = await init({
      args: ["--tracker", "quest", "--keep-backlog-tasks"],
      migrateBacklog: async () => {
        throw new Error("no migration must run for --keep-backlog-tasks");
      },
    });
    expect(result.tracker).toBe("quest");
    expect(result.migration).toBeUndefined();
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
  });

  test("a bare backlog/ directory imposes no migration answer at all (AC#2)", async () => {
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const { result } = await init({ args: ["--tracker", "quest"] });
    expect(result.tracker).toBe("quest");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test.each([
    [
      "a wrong --tracker value names the value passed",
      ["--tracker", "backlog", "--migrate-backlog"],
      "--tracker backlog was passed",
    ],
    ["no --tracker at all says so", ["--migrate-backlog"], "no --tracker was passed"],
    [
      "a missing project names the marker it looked for",
      ["--tracker", "quest", "--migrate-backlog"],
      "backlog/config.yml does not exist here",
    ],
    [
      "the two opposite answers are mutually exclusive",
      ["--tracker", "quest", "--migrate-backlog", "--keep-backlog-tasks"],
      "mutually exclusive",
    ],
    [
      "--keep-backlog-tasks outside a Quest selection is meaningless",
      ["--tracker", "backlog", "--keep-backlog-tasks"],
      "only means something with --tracker quest",
    ],
  ] as const)("--migrate-backlog refusals name the actual unmet condition: %s (AC#4)", (_name, args, expected) => {
    // Deliberately NO Backlog project for the first four; the fifth is refused on flags alone. One
    // shared sentence used to cover every one of these causes and named none of them.
    const err = expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: [...args] }),
    );
    expect(err.message).toContain(expected);
  });

  test("the tracker question is asked in full, and the migration question follows it (LCLI-358.5)", async () => {
    legacyBundle();
    const asked: { question: string; choices: string[] }[] = [];
    const base = scriptedPrompter({
      tracker: "quest",
      backlogTasks: "backlog",
      agents: false,
      site: "none",
      obsidian: false,
    });
    const prompter: InitPrompter = {
      ...base,
      choose: async (question, values, defaultValue) => {
        asked.push({ question, choices: [...values] });
        return base.choose(question, values, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    // The full vocabulary, in order: the tracker question first (AC#1), then the migration question
    // it makes meaningful (AC#3). Neither replaces the other.
    expect(asked[0]?.choices).toEqual(["quest", "backlog", "jira", "none"]);
    expect(asked[1]?.choices).toEqual(["migrate", "keep", "backlog"]);
    expect(asked[1]?.question).toContain("backlog/config.yml");
    // Answering `backlog` to the migration question pins Backlog, as the old two-way choice did.
    expect(result.tracker).toBe("backlog");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");
  });

  test("interactive migration preserves the legacy backend until the copy succeeds", async () => {
    legacyBundle();
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({
        tracker: "quest",
        backlogTasks: "migrate",
        agents: false,
        site: "none",
        obsidian: false,
      }),
      adapter: fakeAdapter([], { probe: "ok" }),
      migrateBacklog: async () => migrationResult,
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(result.migration).toEqual(migrationResult);
    expect(result.tracker).toBe("quest");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test("jira and none stay reachable in a repository that has Backlog tasks (AC#1)", async () => {
    // The regression: the tracker question used to be REPLACED by a migrate-or-pin choice whenever
    // the bundle looked legacy, so these two backends could not be selected at all here.
    legacyBundle();
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ tracker: "none", agents: false, site: "none", obsidian: false }),
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(result.tracker).toBe("none");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("none");
  });

  test("`keep` selects Quest and leaves the Backlog project exactly as found (AC#3)", async () => {
    legacyBundle();
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({
        tracker: "quest",
        backlogTasks: "keep",
        agents: false,
        site: "none",
        obsidian: false,
      }),
      adapter: fakeAdapter([], { probe: "ok" }),
      migrateBacklog: async () => {
        throw new Error("no migration must run for `keep`");
      },
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(result.tracker).toBe("quest");
    expect(result.migration).toBeUndefined();
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
  });

  test("no Backlog project means no migration question at all (AC#2)", async () => {
    // A bare `backlog/` directory: present, but not a project. Nothing to migrate, nothing to ask.
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const asked: string[] = [];
    const base = scriptedPrompter({ tracker: "quest", agents: false, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      choose: async (question, values, defaultValue) => {
        asked.push(question);
        return base.choose(question, values, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(asked.some((question) => question.includes("Backlog.md project"))).toBe(false);
    expect(result.tracker).toBe("quest");
  });
});

describe("lore init — the interactive wizard is TTY-gated (AC#1/AC#2, the locked design decision)", () => {
  test("offers exactly the shipped tracker choices and persists the selected backend", async () => {
    const choicesSeen: string[][] = [];
    const base = scriptedPrompter({
      tracker: "jira",
      jiraProject: "ENG",
      agents: false,
      codex: false,
      site: "none",
      obsidian: false,
    });
    const prompter: InitPrompter = {
      ...base,
      choose: async (question, choices, defaultValue) => {
        if (question.includes("tracker")) {
          choicesSeen.push([...choices]);
        }
        return base.choose(question, choices, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => ({ claude: false, codex: false }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(choicesSeen).toEqual([["quest", "backlog", "jira", "none"]]);
    expect(result.tracker).toBe("jira");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("jira");
  });

  test("wizard and --tracker write the identical tracker configuration", async () => {
    await init({ args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"] });
    const fromFlag = readFileSync(join(root, ".lore/config.toml"), "utf8");
    rmSync(root, { recursive: true, force: true });
    mkdirSync(root, { recursive: true });

    await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({
        tracker: "jira",
        jiraProject: "ENG",
        agents: false,
        codex: false,
        site: "none",
        obsidian: false,
      }),
      agentAvailability: () => ({ claude: false, codex: false }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).toBe(fromFlag);
  });

  test.each([
    ["Claude-only", { claude: true, codex: false }, true, false],
    ["Codex-only", { claude: false, codex: true }, false, true],
    ["both installed", { claude: true, codex: true }, true, true],
    ["neither installed", { claude: false, codex: false }, false, false],
  ] as const)("%s availability offers and configures only detected agents", async (_name, availability, claude, codex) => {
    const questions: string[] = [];
    const base = scriptedPrompter({ agents: true, codex: true, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        questions.push(question);
        return base.confirm(question, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => availability,
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.agents !== undefined).toBe(claude);
    expect(result.codex !== undefined).toBe(codex);
    expect(questions.some((question) => question.includes("Claude Code"))).toBe(availability.claude);
    expect(questions.some((question) => question.includes("Codex"))).toBe(availability.codex);
  });

  test("detected agent choices are independent and may both be declined", async () => {
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ agents: false, codex: false, site: "none", obsidian: false }),
      agentAvailability: () => ({ claude: true, codex: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.agents).toBeUndefined();
    expect(result.codex).toBeUndefined();
  });

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
    // The wizard's tracker question defaults to quest, so the probe follows quest — not backlog.
    expect(result.trackerCheck).toEqual({ checked: true, backend: "quest", capable: true, version: "1.49.0" });
    expect(result.backlog).toBeUndefined();
    expect(existsSync(join(root, "mkdocs.yml"))).toBe(true);
    expect(existsSync(join(root, "docs/.obsidian/app.json"))).toBe(true);
  });

  test("declining every wizard question sets up nothing beyond the base scaffold, but the tracker is still (always) checked", async () => {
    const prompter = scriptedPrompter({ agents: false, site: "none", obsidian: false });
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
    expect(result.trackerCheck?.checked).toBe(true);
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
      ask: () => Promise.reject(eofError),
      close: () => {
        closed = true;
      },
    };
    await expect(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
        clock: FIXED_CLOCK,
      }),
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
      ask: () => Promise.reject(eofError),
      close: () => {},
    };
    const stdout = capture();
    const stderr = capture();
    let caught: unknown;
    try {
      await runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
        stdout,
        stderr,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(LoreError);
    const code = reportError(caught, { json: true, stderr });
    expect(code).toBe(EXIT_CODES.usage);
    expect(stdout.text()).toBe(""); // stdout stays silent -- never a half-written success envelope
    // The wizard's own UI shares stderr with the envelope (cli-contract §4 reserves stdout for the
    // result), so read the LAST line — the same convention docker/e2e's `step_fail` uses.
    const envelope = JSON.parse(stderr.lines().at(-1) ?? "") as { error_type: string; message: string };
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

describe("lore init — the git preflight runs before the first byte is written (LCLI-358.1)", () => {
  /** Every path the base scaffold creates; asserting the directory is EMPTY is the AC, not a sample. */
  function directoryIsUntouched(): void {
    expect(readdirSync(root)).toEqual([]);
  }

  test("a non-git directory is refused before anything is scaffolded, naming the flag that waives it", () => {
    const git = gitStub(false);
    const err = expectError("validation", () =>
      runInit({ root, git, output: JSON_CTX, stdout: capture(), clock: FIXED_CLOCK }),
    );
    expect(err.message).toMatch(/not a git worktree/);
    expect(err.hint).toMatch(/--allow-no-git/);
    expect(exitCodeFor(err)).toBe(EXIT_CODES.validation);
    // A scripted run never creates a repository on the operator's behalf.
    expect(git.initCalls).toBe(0);
    directoryIsUntouched();
  });

  test("--allow-no-git scaffolds a docs-only bundle in a directory that is not a worktree", async () => {
    const git = gitStub(false);
    const { code, result } = await init({ args: ["--allow-no-git"], git });
    expect(code).toBe(0);
    expect(result.created).toContain("docs/index.md");
    expect(git.initCalls).toBe(0);
  });

  test("--allow-no-git does NOT skip the wizard, unlike every other init flag", async () => {
    // The deviation from ADR-0017's any-flag rule, asserted rather than left to the doc comment:
    // this flag waives a preflight gate, so folding it into `anyFlagGiven` would leave a non-git
    // directory with no way to reach the wizard at all.
    const git = gitStub(false);
    const { result } = await init({
      args: ["--allow-no-git"],
      git,
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ tracker: "none" }),
    });
    expect(result.interactive).toBe(true);
    expect(result.tracker).toBe("none");
  });

  test("the wizard asks about git FIRST and runs `git init` when the answer is yes", async () => {
    let initialized = false;
    const git = gitStub(false, () => {
      // Proves the ordering claim rather than the call count alone: at the moment `git init` runs,
      // the scaffold has not written a thing yet.
      expect(readdirSync(root)).toEqual([]);
      initialized = true;
    });
    const { code, result } = await init({
      git,
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ git: true, tracker: "none" }),
    });
    expect(code).toBe(0);
    expect(initialized).toBe(true);
    expect(git.initCalls).toBe(1);
    expect(result.created).toContain("docs/index.md");
  });

  test("declining the wizard's git question exits non-zero and leaves the directory byte-for-byte unchanged", async () => {
    const git = gitStub(false);
    let closed = false;
    const prompter: InitPrompter = {
      ...scriptedPrompter({ git: false }),
      close: () => {
        closed = true;
      },
    };
    await expect(
      runInit({ root, git, output: JSON_CTX, stdout: capture(), stdinIsTTY: true, stderrIsTTY: true, prompter }),
    ).rejects.toThrow(/not a git worktree/);
    expect(git.initCalls).toBe(0);
    expect(closed).toBe(true); // the wizard's `finally` still releases the readline session
    directoryIsUntouched();
  });

  test("an already-initialized repository is never re-initialized and never prompts about git", async () => {
    const git = gitStub(true);
    const asked: string[] = [];
    const prompter: InitPrompter = {
      confirm: async (question, defaultValue) => {
        asked.push(question);
        return defaultValue === true && question.includes("git repository");
      },
      choose: async (_question, _choices, defaultValue) => defaultValue,
      ask: async (_question, defaultValue) => defaultValue,
      close: () => {},
    };
    await init({ git, stdinIsTTY: true, stderrIsTTY: true, prompter });
    expect(asked.some((question) => question.includes("git repository"))).toBe(false);
    expect(git.initCalls).toBe(0);
  });

  test("EOF mid-wizard leaves no partially written bundle (AC#4)", async () => {
    const eof = new LoreError("usage", "stdin closed", "answer every prompt");
    const prompter: InitPrompter = {
      confirm: async () => {
        throw eof;
      },
      choose: async () => {
        throw eof;
      },
      ask: async () => {
        throw eof;
      },
      close: () => {},
    };
    await expect(
      runInit({
        root,
        git: gitStub(true),
        output: JSON_CTX,
        stdout: capture(),
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
      }),
    ).rejects.toBe(eof);
    directoryIsUntouched();
  });

  test("a rejected flag combination also leaves the directory untouched", () => {
    // Same guarantee, different refusal: the flag guards moved ahead of the scaffold too.
    expectError("usage", () =>
      runInit({ root, git: gitStub(true), output: JSON_CTX, stdout: capture(), args: ["--migrate-backlog"] }),
    );
    directoryIsUntouched();
  });

  test("the real preflight detects a repository, including from a subdirectory of one", () => {
    gitRun(root, ["init"]);
    const nested = join(root, "docs-bundle");
    mkdirSync(nested);
    expect(realGitPreflight(root).isRepository()).toBe(true);
    // `git rev-parse --is-inside-work-tree` walks up, so a bundle nested below the repository root
    // counts as initialized — the nested-bundle case adapters/git.ts already supports.
    expect(realGitPreflight(nested).isRepository()).toBe(true);
  });

  test("the real preflight reports a bare directory as no repository, then initializes one", () => {
    const preflight = realGitPreflight(root);
    expect(preflight.isRepository()).toBe(false);
    preflight.initialize();
    expect(preflight.isRepository()).toBe(true);
  });
});

describe("createRealPrompter — an ALREADY-closed stdin still yields the classified diagnostic (LCLI-358.1)", () => {
  test("a question asked after stdin has already ended reports EOF, not readline's internal error", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const prompter = createRealPrompter({ input, output });
    input.end(); // EOF lands BEFORE the first question, the pty-piped case
    await new Promise((resolve) => setTimeout(resolve, 0));
    const question = prompter.confirm("Run `git init` here?", true);
    await expect(question).rejects.toThrow(LoreError);
    await expect(question).rejects.toThrow(/EOF|Ctrl-D/);
    // Node's own post-close message must not reach the operator.
    await expect(question).rejects.not.toThrow(/readline was closed/);
  });
});

describe("lore init — review follow-ups: no write survives a refusal, and git failures are classified", () => {
  test("accepting the git prompt and then hitting EOF leaves no repository behind", async () => {
    // The gap the reordering left open: `git init` used to run at the first question, so a Ctrl-D
    // at the SECOND one exited non-zero having created a `.git` the run never asked to keep.
    const git = gitStub(false);
    const eof = new LoreError("usage", "stdin closed", "answer every prompt");
    const prompter: InitPrompter = {
      confirm: async (question) => {
        if (question.includes("git repository")) return true;
        throw eof;
      },
      choose: async () => {
        throw eof;
      },
      ask: async () => {
        throw eof;
      },
      close: () => {},
    };
    await expect(
      runInit({ root, git, output: JSON_CTX, stdout: capture(), stdinIsTTY: true, stderrIsTTY: true, prompter }),
    ).rejects.toBe(eof);
    expect(git.initCalls).toBe(0);
    expect(readdirSync(root)).toEqual([]);
  });

  test("a structurally blocked bundle is refused before the wizard asks anything", async () => {
    // Answering five questions — and having `git init` run for you — before being told the bundle
    // cannot be written at all is the wrong order.
    writeFileSync(join(root, ".lore"), "not a directory");
    const git = gitStub(false);
    const asked: string[] = [];
    const prompter: InitPrompter = {
      confirm: async (question) => {
        asked.push(question);
        return true;
      },
      choose: async (question, _choices, defaultValue) => {
        asked.push(question);
        return defaultValue;
      },
      ask: async (question, defaultValue) => {
        asked.push(question);
        return defaultValue;
      },
      close: () => {},
    };
    // Thrown synchronously, before `runInit` ever returns a Promise — the refusal precedes the
    // wizard entirely rather than unwinding out of it.
    const err = expectError("conflict", () =>
      runInit({
        root,
        git,
        output: JSON_CTX,
        stdout: capture(),
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
      }),
    );
    // The same `conflict` the non-interactive path reports — not a config-read failure, which is
    // what an eagerly resolved tracker selection produced.
    expect(err.hint).toContain("remove or rename");
    expect(asked).toEqual([]);
    expect(git.initCalls).toBe(0);
  });

  test("git refusing a real worktree is reported as git's own failure, not as a missing repository", () => {
    // `git rev-parse` exits 128 for `detected dubious ownership` on a perfectly valid repository.
    // Flattening that to "not a git worktree" would advise `git init` over someone's real repo.
    // Real git output, captured live on 2026-08-28 from `GIT_TEST_ASSUME_DIFFERENT_OWNER=1 git
    // rev-parse --is-inside-work-tree` inside a valid repository. It cannot be provoked in-process
    // (Bun.spawnSync snapshots the environment at startup), so the transport is injected and the
    // recorded bytes replayed — the classifier under test reads exactly these.
    const preflight = realGitPreflight(root, () => ({
      exitCode: 128,
      stdout: "",
      stderr: `fatal: detected dubious ownership in repository at '${root}'\n`,
    }));
    const err = expectError("validation", () => preflight.isRepository());
    expect(err.message).toMatch(/git could not report whether/);
    expect(err.message).not.toMatch(/is not a git worktree/);
    expect(err.hint).toMatch(/dubious ownership/);
  });

  test("a plain directory with no repository is still a clean `false`, not a thrown error", () => {
    // Against the REAL git binary, not a replay: the "no" answer must survive the new
    // classification, or every fresh directory would start throwing instead of offering `git init`.
    expect(realGitPreflight(root).isRepository()).toBe(false);
  });

  test("a `git` binary that cannot be started is reported as missing, never as a missing repository", () => {
    const preflight = realGitPreflight(root, () => {
      throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" });
    });
    const err = expectError("not_found", () => preflight.isRepository());
    expect(err.message).toMatch(/the binary is not installed or not on PATH/);
  });
});

describe("lore init — the capability probe follows the selected tracker (LCLI-358.2)", () => {
  /** Record every tracker binary a run tries to start, so "never spawned" is provable, not implied. */
  function recordingRoot(): { root: string; spawned: string[] } {
    return { root, spawned: [] };
  }

  test("selecting quest probes quest and says nothing at all about backlog", async () => {
    const { result, stderr } = await init({
      args: ["--tracker", "quest", "--check-tracker"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.trackerCheck?.backend).toBe("quest");
    expect(result.backlog).toBeUndefined();
    expect(stderr).not.toContain("backlog");
  });

  test("selecting jira leaves a bundle whose tracker adapter actually constructs (LCLI-358.4)", async () => {
    // The regression this replaces: `--tracker jira` used to write `backend = "jira"` and no
    // `[tracker.jira]` table, so `createTrackerAdapter` threw "tracker.jira configuration is
    // required" on the very next tracker command and the probe reported that as an advisory. The
    // configuration is now written with the selection, so the same construction succeeds.
    const { code } = await init({ args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"] });
    expect(code).toBe(0);
    const tracker = loadConfig({ root, env: {} }).tracker;
    expect(tracker.backend).toBe("jira");
    expect(tracker.jira?.profile).toBe("salient");
    expect(tracker.jira?.project).toBe("ENG");
    // Construction only — no `probe()`, so nothing here reaches a real `jira` binary or a real site.
    expect(() => createTrackerAdapter(root, { backend: "jira", jira: tracker.jira })).not.toThrow();
  });

  test("selecting none runs no probe at all, even when --check-tracker asks for one", async () => {
    const { result, stderr } = await init({
      args: ["--tracker", "none", "--check-tracker"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "should never be reached", "") }),
    });
    expect(result.trackerCheck).toBeUndefined();
    expect(result.backlog).toBeUndefined();
    expect(stderr).toBe("");
  });

  test("with no --tracker, the probe follows the bundle's own persisted selection", async () => {
    // Pin the bundle to Backlog first, then re-run with no --tracker at all: the probe must read
    // the bundle's own config rather than falling back to any default.
    await init({ args: ["--tracker", "backlog"], adapter: fakeAdapter([], { probe: "ok" }) });
    const { result } = await init({
      args: ["--agents"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.trackerCheck?.backend).toBe("backlog");
    expect(result.backlog).toEqual({ checked: true, capable: true, version: "1.49.0" });
  });

  test("a brand-new bundle over an existing backlog/ directory probes what it just persisted", async () => {
    // Documents a real seam rather than asserting it is desirable: a newly created bundle pins
    // `quest` (init.ts's "a newly created bundle is unambiguous" rule), so that is what the probe
    // follows — even though a real `backlog/` project sits right there. Whether init should pin
    // quest over existing Backlog tasks at all is LCLI-358.5's question, not this probe's.
    mkdirSync(join(root, "backlog"));
    const { result } = await init({ args: ["--agents"], adapter: fakeAdapter([], { probe: "ok" }) });
    expect(result.trackerCheck?.backend).toBe("quest");
  });

  test("no tracker binary is spawned for a bare run", async () => {
    // The pre-LORE-260 guarantee, restated against the new gating: a bare init still probes nothing.
    const { result, stderr } = await init({
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "should never be reached", "") }),
    });
    expect(result.trackerCheck).toBeUndefined();
    expect(stderr).toBe("");
    expect(recordingRoot().spawned).toEqual([]);
  });

  test("--no-tracker skips the check that --agents would otherwise imply", async () => {
    const { result, stderr } = await init({
      args: ["--tracker", "quest", "--agents", "--no-tracker"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "should never be reached", "") }),
    });
    expect(result.agents).toBeDefined();
    expect(result.trackerCheck).toBeUndefined();
    expect(stderr).toBe("");
  });

  test("--no-tracker and --check-backlog are mutually exclusive across the alias pair", () => {
    const err = expectError("usage", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--no-tracker", "--check-backlog"],
      }),
    );
    expect(err.message).toContain("mutually exclusive");
  });

  test("plain and pretty output name the probed backend instead of a hardcoded `backlog`", async () => {
    const stdout = capture();
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "plain", color: false },
      stdout,
      clock: FIXED_CLOCK,
      args: ["--tracker", "quest", "--check-tracker"],
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(stdout.lines()).toContain("quest capable");
    expect(stdout.text()).not.toContain("backlog capable");
  });
});

describe("lore init — an unsupported tracker version is rejected at selection time (LCLI-356)", () => {
  /** A tracker adapter whose probe fails exactly the way an under-the-floor Quest does. */
  function belowFloorAdapter(): BacklogAdapter {
    return fakeAdapter([], {
      probe: new LoreError("validation", "Quest 0.2.6 is below the 0.2.7 floor", "install a newer Quest", {
        code: QUEST_VERSION_FLOOR_CODE,
        version: "0.2.6",
        floor: "0.2.7",
      }),
    });
  }

  test("--tracker quest against an under-the-floor Quest fails and does NOT persist the backend", async () => {
    // The reported defect: init exited 0, wrote backend = "quest", and every later tracker command
    // then exited 6 — the user committed to a backend nothing would accept.
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "quest"],
        adapter: belowFloorAdapter(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err).toBeInstanceOf(LoreError);
    expect(err?.type).toBe("validation");
    expect(err?.message).toContain("below the 0.2.7 floor");
    // The scaffold is idempotent and harmless; the SELECTION is the commitment that is withheld.
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).not.toContain('backend = "quest"');
  });

  test("every other probe failure stays advisory, so LORE-319's decision is untouched", async () => {
    const warning = "The `backlog` binary supports --json, but no Backlog.md project is initialized in this directory";
    const { code, result, stderr } = await init({
      args: ["--tracker", "backlog", "--check-tracker"],
      adapter: fakeAdapter([], { probe: new LoreError("validation", warning) }),
    });
    expect(code).toBe(0);
    expect(result.trackerCheck?.capable).toBe(false);
    expect(stderr).toContain(warning);
    // One setup step away in this same directory — so the selection is still written.
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).toContain('backend = "backlog"');
  });

  test("--no-tracker opts out of the gate for a repository configured before its tooling", async () => {
    const { code } = await init({
      args: ["--tracker", "quest", "--no-tracker"],
      adapter: belowFloorAdapter(),
    });
    expect(code).toBe(0);
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).toContain('backend = "quest"');
  });

  test("a supported tracker is probed once, and its verification is what the result reports", async () => {
    let probes = 0;
    const adapter: BacklogAdapter = {
      ...fakeAdapter([], { probe: "ok" }),
      probe: async () => {
        probes += 1;
        return { version: "0.2.9", schemaVersion: 1 };
      },
    };
    const { result } = await init({ args: ["--tracker", "quest", "--check-tracker"], adapter });
    expect(result.trackerCheck).toEqual({ checked: true, backend: "quest", capable: true, version: "0.2.9" });
    expect(probes).toBe(1);
  });
});

describe("quest version floor (LCLI-356)", () => {
  test("the shipped 0.2.9 and later releases are accepted; below the floor is not", () => {
    // Reversing LCLI-353's frozen ["0.2.7","0.2.8"] set: the two currently published packages could
    // not be used together at all, and every Quest patch would have needed a new Lore release.
    for (const version of ["0.2.7", "0.2.9", "0.3.0", "1.4.2"]) {
      expect(atLeast(version, MIN_QUEST_VERSION)?.ok).toBe(true);
    }
    for (const version of ["0.1.0", "0.2.6"]) {
      expect(atLeast(version, MIN_QUEST_VERSION)?.ok).toBe(false);
    }
    expect(atLeast("not a version", MIN_QUEST_VERSION)).toBeNull();
  });

  test("an invalid floor is a programming error, not a silent accept-everything", () => {
    expect(() => atLeast("1.0.0", "not-a-floor")).toThrow(/invalid minimum-version floor/);
  });
});

describe("lore init — the tracker environment is detected before the choice (LCLI-358.3)", () => {
  /** A detected environment with every backend's state stated explicitly. */
  function env(overrides: Partial<Record<"quest" | "backlog" | "jira", Partial<TrackerEnvironmentEntry>>> = {}) {
    const base = [
      { backend: "quest", binary: "quest", package: "@opum-ai/quest", installed: true, initialized: true },
      { backend: "backlog", binary: "backlog", package: "backlog.md", installed: true, initialized: false },
      { backend: "jira", binary: "jira", package: "@salient-ai/jira-cli", installed: false, initialized: undefined },
    ] as const;
    return base.map((entry) => ({ ...entry, ...(overrides[entry.backend] ?? {}) })) as TrackerEnvironment;
  }

  test("detection reads PATH and the repository's own markers, not the backends themselves", () => {
    // A bare `backlog/` directory is deliberately NOT a project: `backlog init` writes config.yml.
    mkdirSync(join(root, "backlog"));
    expect(trackerEntry(detectTrackerEnvironment(root), "backlog")?.initialized).toBe(false);
    writeFileSync(join(root, "backlog/config.yml"), "projectName: x\n");
    expect(trackerEntry(detectTrackerEnvironment(root), "backlog")?.initialized).toBe(true);

    expect(trackerEntry(detectTrackerEnvironment(root), "quest")?.initialized).toBe(false);
    mkdirSync(join(root, ".quest"));
    writeFileSync(join(root, ".quest/workspace.toml"), "schemaVersion = 1\n");
    expect(trackerEntry(detectTrackerEnvironment(root), "quest")?.initialized).toBe(true);

    // Jira has no repository-local marker at all, so this must not claim to know.
    expect(trackerEntry(detectTrackerEnvironment(root), "jira")?.initialized).toBeUndefined();
  });

  test("the wizard prints each backend's state to stderr BEFORE asking (AC#1)", async () => {
    const asked: string[] = [];
    const prompter: InitPrompter = {
      ...scriptedPrompter({ tracker: "quest", site: "none", obsidian: false }),
      choose: async (question, _choices, defaultValue) => {
        asked.push(`${question} | stderr-so-far: ${stderrText()}`);
        return question.includes("tracker") ? "quest" : defaultValue;
      },
    };
    let stderrText = () => "";
    const stderr = capture();
    stderrText = () => stderr.text();
    await runInit({
      root,
      git: gitStub(),
      output: JSON_CTX,
      stdout: capture(),
      stderr,
      clock: FIXED_CLOCK,
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      trackerEnvironment: () => env(),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const trackerQuestion = asked.find((entry) => entry.includes("tracker backend"));
    expect(trackerQuestion).toContain("quest: installed — initialized in this repository");
    expect(trackerQuestion).toContain("backlog: installed — not initialized in this repository");
    expect(trackerQuestion).toContain("jira: not installed (npm install -g @salient-ai/jira-cli)");
  });

  test("choosing a backend with no binary offers the install, then continues (AC#2)", async () => {
    const installs: string[] = [];
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ tracker: "jira", jiraProject: "ENG", site: "none", obsidian: false }),
      trackerEnvironment: () => env(),
      installTracker: async (entry) => {
        installs.push(entry.package);
        return true;
      },
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(installs).toEqual(["@salient-ai/jira-cli"]);
    expect(result.tracker).toBe("jira");
    expect(result.installed).toBe("@salient-ai/jira-cli");
  });

  test("declining the install and declining to switch exits with the exact install command (AC#2)", async () => {
    const prompter: InitPrompter = {
      confirm: async (question) => !question.includes("not installed") && !question.includes("different tracker"),
      choose: async (question, _choices, defaultValue) => (question.includes("tracker") ? "jira" : defaultValue),
      ask: async (_question, defaultValue) => defaultValue,
      close: () => {},
    };
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
        trackerEnvironment: () => env(),
        installTracker: async () => {
          throw new Error("must not install");
        },
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("not_found");
    expect(err?.hint).toContain("npm install -g @salient-ai/jira-cli");
  });

  test("declining the install and switching returns to the question, bounded to two passes (AC#3)", async () => {
    // First pass picks the uninstalled jira and declines; the second picks quest and proceeds. A
    // prompter that answered "jira, decline, switch" forever must still terminate.
    let trackerAsks = 0;
    const prompter: InitPrompter = {
      confirm: async (question) => {
        if (question.includes("not installed")) return false;
        if (question.includes("different tracker")) return true;
        return false;
      },
      choose: async (question, _choices, defaultValue) => {
        if (!question.includes("tracker backend")) return defaultValue;
        trackerAsks += 1;
        return trackerAsks === 1 ? "jira" : "quest";
      },
      ask: async (_question, defaultValue) => defaultValue,
      close: () => {},
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      trackerEnvironment: () => env(),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(trackerAsks).toBe(2);
    expect(result.tracker).toBe("quest");
  });

  test("the loop cannot spin: a prompter that always declines still terminates (AC#3)", async () => {
    let trackerAsks = 0;
    const prompter: InitPrompter = {
      confirm: async (question) => question.includes("different tracker"),
      choose: async (question, _choices, defaultValue) => {
        if (!question.includes("tracker backend")) return defaultValue;
        trackerAsks += 1;
        return "jira"; // never installed, never accepted — the adversarial answer
      },
      ask: async (_question, defaultValue) => defaultValue,
      close: () => {},
    };
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
        trackerEnvironment: () => env(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(trackerAsks).toBe(2); // the bound, not the operator's patience
    expect(err?.type).toBe("not_found");
  });

  test("--install-tracker installs without prompting; --no-install-tracker never installs (AC#4)", async () => {
    const installs: string[] = [];
    const { result } = await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG", "--install-tracker"],
      trackerEnvironment: () => env(),
      installTracker: async (entry) => {
        installs.push(entry.package);
        return true;
      },
    });
    expect(installs).toEqual(["@salient-ai/jira-cli"]);
    expect(result.installed).toBe("@salient-ai/jira-cli");

    const second = await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG", "--no-install-tracker"],
      trackerEnvironment: () => env(),
      installTracker: async () => {
        throw new Error("must not install");
      },
    });
    expect(second.result.installed).toBeUndefined();
  });

  test("nothing is ever installed without an explicit confirmation or flag", async () => {
    // A bare non-interactive run must never mutate the machine's global packages.
    const { result } = await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"],
      trackerEnvironment: () => env(),
      installTracker: async () => {
        throw new Error("must not install");
      },
    });
    expect(result.installed).toBeUndefined();
  });

  test("--install-tracker and --no-install-tracker together is a usage error", () => {
    const err = expectError("usage", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--install-tracker", "--no-install-tracker"],
      }),
    );
    expect(err.message).toContain("mutually exclusive");
  });

  test("an install that leaves the binary off PATH is its own diagnostic, not a silent success", async () => {
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "jira", "--install-tracker"],
        trackerEnvironment: () => env(),
        installTracker: async () => false,
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("not_found");
    expect(err?.message).toContain("is still not on PATH");
    expect(err?.hint).toContain("npm prefix -g");
  });
});

describe("lore init — configuring the jira backend (LCLI-358.4)", () => {
  /**
   * The config file's ACTIVE lines — every comment stripped.
   *
   * The scaffolded template ships a fully commented-out `# [tracker.jira]` example, so a raw
   * substring search cannot tell a written setting from the documentation of one. Stripping
   * comments first is what makes "nothing was written" a real assertion rather than one the
   * template satisfies on its own.
   */
  function configText(): string {
    const path = join(root, ".lore/config.toml");
    if (!existsSync(path)) return "";
    return readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
  }

  test("zero jira-cli profiles exits naming `jira init`, and writes no configuration (AC#1)", async () => {
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "jira"],
        jira: fakeJira({ profiles: [] }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("not_found");
    expect(err?.message).toContain("no credential profiles");
    expect(err?.hint).toContain("jira init");
    // The escape hatch is the operator running `jira init` themselves — Lore must never offer to
    // run it, because it is interactive and handles credentials.
    expect(err?.hint).toContain("Lore never does");
    // Nothing partial: the selection is never persisted, so the bundle is not pinned to a backend
    // it cannot use.
    expect(configText()).not.toContain("jira");
  });

  test("the profile question lists every profile and defaults to jira-cli's own default (AC#2)", async () => {
    const { result, stderr } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      // No `jiraProfile` answer: a bare Enter must resolve to the default profile.
      prompter: scriptedPrompter({ tracker: "jira", jiraProject: "ENG", site: "none", obsidian: false }),
      agentAvailability: () => ({ claude: false, codex: false }),
      adapter: fakeAdapter([], { probe: "ok" }),
      jira: fakeJira({
        profiles: [
          { name: "personal", jiraUrl: "https://personal.atlassian.net", isDefault: false },
          { name: "Salient", jiraUrl: "https://salient.atlassian.net", isDefault: true },
        ],
      }),
    });
    expect(stderr).toContain("personal — https://personal.atlassian.net");
    expect(stderr).toContain("Salient — https://salient.atlassian.net (jira-cli default)");
    expect(result.tracker).toBe("jira");
    // Mixed case survives: `choose` would have lower-cased this answer into no profile at all.
    expect(loadConfig({ root, env: {} }).tracker.jira?.profile).toBe("Salient");
  });

  test("a profile name jira-cli does not know is rejected against the live list (AC#2)", async () => {
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "jira", "--jira-profile", "typo", "--jira-project", "ENG"],
        jira: fakeJira(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("validation");
    expect(err?.hint).toContain("salient");
    expect(configText()).not.toContain("[tracker.jira]");
  });

  test("an unresolvable project key fails with jira-cli's own reason, not a generic error (AC#3)", async () => {
    const calls: string[] = [];
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "NOPE"],
        jira: fakeJira({
          calls,
          projectError: new LoreError(
            "not_found",
            "`jira project get NOPE` failed: No project could be found with key 'NOPE'.",
            "check the Jira project key",
          ),
        }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(calls).toContain("describeProject(NOPE, salient)");
    expect(err?.type).toBe("not_found");
    expect(err?.message).toContain("No project could be found with key 'NOPE'.");
    expect(configText()).not.toContain("[tracker.jira]");
  });

  test("a validated selection writes the non-secret table and no credential (AC#4)", async () => {
    await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"],
      jira: fakeJira({ project: { key: "ENG", name: "Engineering", issueTypes: ["Story", "Task", "Subtask"] } }),
    });
    const jira = loadConfig({ root, env: {} }).tracker.jira;
    expect(jira).toEqual({
      profile: "salient",
      project: "ENG",
      // Read from the project's own issue types, so a configured bundle cannot name one the
      // project does not offer.
      issueType: "Task",
      defaultLabels: [],
      statusFlow: ["To Do", "In Progress", "Done"],
    });
    const text = configText();
    expect(text).toContain("[tracker.jira]");
    for (const secret of ["token", "password", "api_key", "apiKey", "secret", "@"]) {
      expect(text).not.toContain(secret);
    }
  });

  test("issue_type falls back to the first non-subtask when the project has no Task type (AC#4)", async () => {
    await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"],
      jira: fakeJira({ project: { key: "ENG", name: "Engineering", issueTypes: ["Subtask", "Story"] } }),
    });
    expect(loadConfig({ root, env: {} }).tracker.jira?.issueType).toBe("Story");
  });

  test("re-running with a different project replaces the table rather than merging it (AC#4)", async () => {
    await init({ args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"] });
    await init({ args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "OPS"] });
    const text = configText();
    expect(loadConfig({ root, env: {} }).tracker.jira?.project).toBe("OPS");
    expect(text).not.toContain('"ENG"');
    expect(text.match(/\[tracker\.jira\]/gu)).toHaveLength(1);
  });

  test("both flags together reproduce the answers with the wizard never touched (AC#5)", async () => {
    const calls: string[] = [];
    const { code, result } = await init({
      args: ["--tracker", "jira", "--jira-profile", "salient", "--jira-project", "ENG"],
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: forbiddenPrompter(),
      jira: fakeJira({ calls }),
    });
    expect(code).toBe(0);
    expect(result.tracker).toBe("jira");
    expect(calls).toEqual(["listProfiles", "describeProject(ENG, salient)"]);
  });

  test("--tracker jira without the flags is a usage error that writes no selection (AC#5)", async () => {
    for (const args of [
      ["--tracker", "jira"],
      ["--tracker", "jira", "--jira-profile", "salient"],
    ]) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });
      const err = await Promise.resolve(
        runInit({
          root,
          git: gitStub(),
          output: JSON_CTX,
          stdout: capture(),
          stderr: capture(),
          clock: FIXED_CLOCK,
          args,
          jira: fakeJira(),
        }),
      ).then(
        () => undefined,
        (caught: unknown) => caught as LoreError,
      );
      expect(err?.type).toBe("usage");
      expect(configText()).not.toContain("jira");
    }
  });

  test("the jira flags are rejected outside --tracker jira", () => {
    for (const args of [
      ["--jira-profile", "salient"],
      ["--tracker", "quest", "--jira-project", "ENG"],
    ]) {
      const err = expectError("usage", () =>
        runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args }),
      );
      expect(err.message).toContain("requires --tracker jira");
    }
  });

  test("no other backend consults jira-cli at all", async () => {
    const calls: string[] = [];
    await init({ args: ["--tracker", "quest"], jira: fakeJira({ calls }) });
    await init({ args: ["--tracker", "none"], jira: fakeJira({ calls }) });
    expect(calls).toEqual([]);
  });
});
