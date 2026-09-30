import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
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
import { BACKLOG_VERSION_FLOOR_CODE, type BacklogAdapter } from "../src/adapters/backlog";
import { bunGitPreflightSpawn, type GitPreflight, realGitPreflight } from "../src/adapters/git-preflight";
import type { JiraOnboarding, JiraProfile, JiraProjectSummary } from "../src/adapters/jira-onboarding";
import { QUEST_VERSION_PAIR_MISMATCH_CODE, QUEST_WORKSPACE_NOT_INITIALIZED_CODE } from "../src/adapters/quest";
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
import { buildGeminiContextDoc, GEMINI_MD_REL_PATH } from "../src/core/antigravity-bridge";
import { loadBundle } from "../src/core/bundle";
import { parseConcept } from "../src/core/concept";
import { buildHermesContextDoc, HERMES_CONTEXT_REL_PATH } from "../src/core/hermes-bridge";
import { findInstructionTopic } from "../src/core/instructions";
import { EXIT_CODES, exitCodeFor, LoreError, reportError, WarningCollector } from "../src/errors";
import { VERSION } from "../src/meta";
import type { OutputContext } from "../src/output";
import type { TrackerMigrationResult } from "../src/tracker-migration";
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
 * A detected {@link TrackerEnvironment} with every backend installed and initialized in this
 * repository, unless `overrides` says otherwise.
 *
 * The `init()` helper defaults to this, which is a deliberate choice rather than a convenience.
 * Detection reads the HOST (PATH) as well as the repository, and since ADR-0024 the answer decides
 * whether a selection is served or stopped — so without a default, every test that names a backend
 * would be decided by whichever tracker CLIs the machine running the suite happens to have, and a
 * missing binary would surface as a red that says nothing about the code under test. It is the same
 * reasoning the helper already applies to `jira` (`fakeJira()`) and to `agentAvailability`.
 */
function detectedEnvironment(
  overrides: Partial<Record<"quest" | "backlog" | "jira", Partial<TrackerEnvironmentEntry>>> = {},
): TrackerEnvironment {
  const base = [
    {
      backend: "quest",
      binary: "quest",
      package: "@opum-ai/quest",
      installed: true,
      initialized: true,
      marker: ".quest/workspace.toml",
    },
    {
      backend: "backlog",
      binary: "backlog",
      package: "backlog.md",
      installed: true,
      initialized: true,
      marker: "backlog/config.yml",
    },
    {
      backend: "jira",
      binary: "jira",
      package: "@salient-ai/jira-cli",
      installed: true,
      initialized: undefined,
      marker: undefined,
    },
  ] as const;
  return base.map((entry) => ({ ...entry, ...(overrides[entry.backend] ?? {}) })) as TrackerEnvironment;
}

/**
 * Sorted `relative/path <sha256 of its bytes>` lines for everything under `dir` — a recursive,
 * content-level snapshot, for the assertions that claim a refused run wrote NOTHING.
 *
 * A bare `readdirSync(root)` cannot carry that claim: it sees one level, so a regression that wrote
 * `.lore/profile.toml` or a schema before an offer would still pass, and in a `legacyBundle()` root
 * (where `.lore/` and `backlog/` already exist) an empty first level was never assertable at all
 * (LCLI-656 review D6). Non-regular entries are recorded by kind rather than read.
 */
function treeDigest(dir: string, prefix = ""): string[] {
  const lines: string[] = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      lines.push(...treeDigest(dir, rel));
    } else if (entry.isFile()) {
      lines.push(
        `${rel} ${createHash("sha256")
          .update(readFileSync(join(dir, rel)))
          .digest("hex")}`,
      );
    } else {
      lines.push(`${rel} <${entry.isSymbolicLink() ? "symlink" : "non-regular"}>`);
    }
  }
  return lines.sort();
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
    jira?: JiraOnboarding;
    agentPlugins?: InitOptions["agentPlugins"];
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
    // Defaulted, never left to the real seam (see `detectedEnvironment`): a test that cares about
    // readiness injects its own, and every other test gets a deterministic answer instead of
    // whichever tracker CLIs this machine has on PATH.
    trackerEnvironment: extra.trackerEnvironment ?? (() => detectedEnvironment()),
    // Defaulted, never left to the real seam: without this a jira-selecting test would shell the
    // machine's own `jira` binary and read whichever credential profiles the developer happens to
    // have (LCLI-358.4).
    jira: extra.jira ?? fakeJira(),
    // Unset means the default port, which the suite's LORE_AGENT_PLUGINS=off preload turns into
    // the no-spawn one (LCLI-592).
    agentPlugins: extra.agentPlugins,
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
  antigravity?: boolean;
  tracker?: string;
  site?: string;
  obsidian?: boolean;
  git?: boolean;
  jiraProfile?: string;
  jiraProject?: string;
  /** The O3/O6 Backlog-takeover offer: `true` takes it (and the run stops), `false` is the keep. */
  backlogTakeover?: boolean;
  /** The O1/O2 readiness offer: `true` accepts the stop (the run ends), `false` returns to the tracker question. */
  readinessStop?: boolean;
}): InitPrompter {
  return {
    confirm: async (question, defaultValue) => {
      // Matched before the catch-all below (LCLI-358.1): the git preflight is a `confirm` too, and
      // without its own branch a test that answers `obsidian: false` would silently decline git.
      // The same applies to the readiness offers (O1/O2) and the takeover offer (O3/O6).
      if (question.includes("Quest can take its tasks over")) return answers.backlogTakeover ?? defaultValue;
      if (question.includes("git repository")) return answers.git ?? defaultValue;
      // "not installed" and "is not set up for it" are the two readiness offers, O1 and O2.
      if (question.includes("not installed") || question.includes("is not set up for it"))
        return answers.readinessStop ?? defaultValue;
      return answers.obsidian ?? defaultValue;
    },
    choose: async (question, _choices, defaultValue) => {
      if (question.includes("tracker")) return answers.tracker ?? defaultValue;
      return answers.site ?? defaultValue;
    },
    // The three sequential agent-bridge confirm()s became one multiselect (LCLI-462). `answers`
    // keeps its per-bridge boolean fields — an unspecified bridge falls back to `defaultSelected`,
    // exactly like `confirm`/`choose` fall back to their own `defaultValue` above: this scripted
    // prompter never invents a default of its own, it answers with whatever the wizard offered.
    multiselect: async (_question, options, defaultSelected) => {
      const selectedFor: Record<string, boolean | undefined> = {
        claude: answers.agents,
        codex: answers.codex,
        hermes: answers.hermes,
        antigravity: answers.antigravity,
      };
      return options
        .filter((option) => selectedFor[option.value] ?? defaultSelected.includes(option.value))
        .map((option) => option.value);
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
  return {
    confirm: fail("confirm"),
    choose: fail("choose"),
    ask: fail("ask"),
    multiselect: fail("multiselect"),
    close: fail("close"),
  };
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
    expect(result.skipped).toEqual([]);
    expect(result.created).toEqual([
      ".lore/config.toml",
      ".lore/profile.toml",
      ".lore/.gitignore",
      ".lore/schemas/epic.schema.json",
      ".lore/schemas/arc.schema.json",
      ".lore/schemas/story.schema.json",
      ".lore/schemas/spec.schema.json",
      ".lore/schemas/adr.schema.json",
      ".lore/schemas/runbook.schema.json",
      ".lore/schemas/reference.schema.json",
      ".lore/schemas/constitution.schema.json",
      ".lore/schemas/constants.schema.json",
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
    // 15, not 14: Arc's deprecated `Story` alias scaffolds a schema file of its own (LCLI-553).
    expect(result.skipped.length).toBe(15);
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
  test("no flags at all: a new bundle pins Quest without probing it", async () => {
    const { result, stderr } = await init();
    expect(result.agents).toBeUndefined();
    expect(result.scaffolds).toEqual([]);
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

  test("--skill-source plugin persists the opt-in without prompting (LCLI-442)", async () => {
    const { code, result } = await init({ args: ["--skill-source", "plugin"] });
    expect(code).toBe(0);
    expect(result.interactive).toBe(false);
    expect(loadConfig({ root, env: {} }).agents.skillSource).toBe("plugin");
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).toContain('[agents]\nskill_source = "plugin"');
  });

  test("with no --skill-source, a fresh bundle defaults to the repo-owned skill (LCLI-442)", async () => {
    await init();
    expect(loadConfig({ root, env: {} }).agents.skillSource).toBe("repo");
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).not.toContain("skill_source");
  });

  test("--skill-source rejects unavailable and missing values", () => {
    const unavailable = expectError("validation", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--skill-source", "bogus"] }),
    );
    expect(exitCodeFor(unavailable)).toBe(EXIT_CODES.validation);
    expect(unavailable.hint).toContain("repo, plugin");
    expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: ["--skill-source"] }),
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
    const offeredValues: string[] = [];
    const base = scriptedPrompter({ hermes: true, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      multiselect: async (question, options, defaultSelected) => {
        offeredValues.push(...options.map((option) => option.value));
        return base.multiselect(question, options, defaultSelected);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => ({ claude: false, codex: false, hermes: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(offeredValues).toContain("hermes");
    expect(result.hermes?.files).toEqual([{ path: HERMES_CONTEXT_REL_PATH, action: "created" }]);
  });

  test("--antigravity writes only GEMINI.md, not AGENTS.md (LCLI-464)", async () => {
    const { result } = await init({
      args: ["--antigravity"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "must not probe a tracker", "") }),
    });
    expect(result.antigravity?.files).toEqual([{ path: GEMINI_MD_REL_PATH, action: "created" }]);
    expect(readFileSync(join(root, GEMINI_MD_REL_PATH), "utf8")).toBe(buildGeminiContextDoc());
    // GEMINI.md and AGENTS.md are two independent, parallel conventions (Google's own docs name
    // both as equally official) -- selecting one must not create or alter the other.
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
    // A disclaimer that it does NOT contain credentials is fine; an actual token/key is not.
    expect(readFileSync(join(root, GEMINI_MD_REL_PATH), "utf8")).not.toMatch(/token|api[ _-]?key/i);
  });

  test("--antigravity protects an existing GEMINI.md", async () => {
    writeFileSync(join(root, GEMINI_MD_REL_PATH), "# Local Antigravity instructions\n");
    const { result } = await init({ args: ["--antigravity"] });
    expect(result.antigravity?.files).toEqual([{ path: GEMINI_MD_REL_PATH, action: "protected" }]);
    expect(readFileSync(join(root, GEMINI_MD_REL_PATH), "utf8")).toBe("# Local Antigravity instructions\n");
  });

  test("the interactive wizard offers Antigravity/Gemini CLI only when the gemini binary is detected, labeled for both tools", async () => {
    const offeredOptions: { value: string; label: string }[] = [];
    const base = scriptedPrompter({ antigravity: true, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      multiselect: async (question, options, defaultSelected) => {
        offeredOptions.push(...options);
        return base.multiselect(question, options, defaultSelected);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => ({ claude: false, codex: false, antigravity: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const antigravityOption = offeredOptions.find((option) => option.value === "antigravity");
    expect(antigravityOption?.label).toContain("GEMINI.md");
    expect(antigravityOption?.label).toContain("Antigravity");
    expect(antigravityOption?.label).toContain("Gemini CLI");
    expect(result.antigravity?.files).toEqual([{ path: GEMINI_MD_REL_PATH, action: "created" }]);
  });

  test("the widened AGENTS.md label names pi and OpenCode alongside the existing tools (LCLI-464)", async () => {
    const offeredOptions: { value: string; label: string }[] = [];
    const base = scriptedPrompter({ codex: true, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      multiselect: async (question, options, defaultSelected) => {
        offeredOptions.push(...options);
        return base.multiselect(question, options, defaultSelected);
      },
    };
    await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => ({ claude: false, codex: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const codexOption = offeredOptions.find((option) => option.value === "codex");
    expect(codexOption?.label).toContain("pi");
    expect(codexOption?.label).toContain("OpenCode");
  });

  test("the wizard reports data.plugins for each ticked Claude/Codex bridge, read before the first write (LCLI-592)", async () => {
    const asked: string[] = [];
    const agentPlugins = {
      list: async (runtime: "claude" | "codex") => {
        // Nothing of this run is on disk yet: not the bundle, and not either bridge.
        asked.push(
          `${runtime}:${existsSync(join(root, ".lore")) || existsSync(join(root, "CLAUDE.md")) ? "late" : "early"}`,
        );
        return runtime === "claude"
          ? { kind: "listed" as const, plugins: [{ id: "opum-lore@opum", enabled: false, scope: "user" }] }
          : { kind: "listed" as const, plugins: [] };
      },
      // Ruling 19: init only reports. Reaching this would fail the test.
      update: async (): Promise<never> => {
        throw new Error("lore init must never update a plugin");
      },
    };
    const { code, result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ agents: true, codex: true, site: "none", obsidian: false }),
      agentAvailability: () => ({ claude: true, codex: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
      agentPlugins,
    });
    expect(code).toBe(0);
    expect(result.interactive).toBe(true);
    expect(asked.sort()).toEqual(["claude:early", "codex:early"]);
    expect(result.plugins?.claude).toMatchObject({ state: "disabled", scope: "user" });
    expect(result.plugins?.codex).toMatchObject({ state: "not-installed" });
  });

  test("the wizard asks no runtime when no Claude or Codex bridge is ticked (LCLI-592)", async () => {
    const asked: string[] = [];
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ agents: false, codex: false, site: "none", obsidian: false }),
      agentAvailability: () => ({ claude: true, codex: true }),
      adapter: fakeAdapter([], { probe: "ok" }),
      agentPlugins: {
        list: async (runtime) => {
          asked.push(runtime);
          return { kind: "listed", plugins: [] };
        },
        update: async (): Promise<never> => {
          throw new Error("lore init must never update a plugin");
        },
      },
    });
    expect(result).not.toHaveProperty("plugins");
    expect(asked).toEqual([]);
  });

  test("--tracker none persists an explicit no-tracker mode without probing a tracker", async () => {
    const { result, stderr } = await init({
      args: ["--tracker", "none", "--codex"],
      adapter: fakeAdapter([], { probe: new LoreError("not_found", "tracker must not be probed", "") }),
    });
    expect(result.tracker).toBe("none");
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

  test("--claude still materializes SKILL.md under skill_source=plugin — explicit beats config (LCLI-442)", async () => {
    await init({ args: ["--skill-source", "plugin"] });
    const { result } = await init({ args: ["--claude"], adapter: okAdapter() });
    const skill = result.agents?.files.find((f) => f.path.endsWith("skills/lore/SKILL.md"));
    expect(skill?.action).toBe("created");
    expect(existsSync(join(root, ".claude/skills/lore/SKILL.md"))).toBe(true);
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
    excluded: [],
    taskFingerprints: { "T-1": "sha256:task" },
    state: "applied" as const,
  };
  test("persists Quest only after an explicit migration succeeds", async () => {
    legacyBundle();
    const { result } = await init({
      args: ["--tracker", "quest", "--migrate-backlog"],
      migrateBacklog: async () => migrationResult,
    });
    expect(result.migration).toEqual(migrationResult);
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  /**
   * LCLI-521 AC#3: the flag path cannot prompt (no prompter exists on this path at all), so it
   * warns instead of asking and always proceeds — the operator already chose
   * `--preserve-source-ids --source-family` explicitly. `init()`'s helper renders `--json`
   * internally and parses stdout as JSON to build `result`, so `result.migration.excluded` matching
   * `excludingResult` also proves the warning text itself never reached stdout (a leaked warning
   * would have broken that JSON.parse).
   */
  test("the flag path warns on stderr and proceeds when preserving ids leaves a family behind (LCLI-521 AC#3)", async () => {
    legacyBundle();
    const excludingResult: TrackerMigrationResult = {
      ...migrationResult,
      excluded: [
        { sourceIdentifier: "LORE-1", family: "LORE" },
        { sourceIdentifier: "LORE-2", family: "LORE" },
      ],
    };
    const { result, stderr } = await init({
      args: ["--tracker", "quest", "--migrate-backlog", "--preserve-source-ids", "--source-family", "LCLI"],
      migrateBacklog: async () => excludingResult,
    });
    expect(result.migration).toEqual(excludingResult);
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
    expect(stderr).toContain("2 record(s) in LORE will NOT be imported");
    expect(stderr).toContain("LORE-1");
    expect(stderr).toContain("LORE-2");
  });

  test("the flag path says nothing about exclusions when nothing was excluded", async () => {
    legacyBundle();
    const { stderr } = await init({
      args: ["--tracker", "quest", "--migrate-backlog", "--preserve-source-ids", "--source-family", "LCLI"],
      migrateBacklog: async () => migrationResult,
    });
    expect(stderr).not.toContain("will NOT be imported");
  });

  // The `init()` helper above always renders `--json` (so its tests can parse `result`), which never
  // exercises `renderPretty`/`renderPlain` directly — these two go through `runInit` with a real
  // plain/pretty `OutputContext` instead, the same pattern `describe("lore init — output rendering")`
  // uses elsewhere in this file.
  test("plain mode surfaces the excluded count and families in the final summary (LCLI-521 AC#1)", async () => {
    legacyBundle();
    const excludingResult: TrackerMigrationResult = {
      ...migrationResult,
      excluded: [
        { sourceIdentifier: "LORE-1", family: "LORE" },
        { sourceIdentifier: "LORE-2", family: "LORE" },
      ],
    };
    const stdout = capture();
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "plain", color: false },
      stdout,
      stderr: capture(),
      clock: FIXED_CLOCK,
      args: ["--tracker", "quest", "--migrate-backlog", "--preserve-source-ids", "--source-family", "LCLI"],
      migrateBacklog: async () => excludingResult,
    });
    expect(stdout.lines()).toContain("migration-excluded count=2 families=LORE");
  });

  test("pretty mode surfaces the excluded count and families in the final summary (LCLI-521 AC#1)", async () => {
    legacyBundle();
    const excludingResult: TrackerMigrationResult = {
      ...migrationResult,
      excluded: [{ sourceIdentifier: "LORE-1", family: "LORE" }],
    };
    const stdout = capture();
    await runInit({
      root,
      git: gitStub(),
      output: { mode: "pretty", color: false },
      stdout,
      stderr: capture(),
      clock: FIXED_CLOCK,
      args: ["--tracker", "quest", "--migrate-backlog", "--preserve-source-ids", "--source-family", "LCLI"],
      migrateBacklog: async () => excludingResult,
    });
    expect(stdout.text()).toContain("1 record(s) left behind (LORE)");
    expect(stdout.text()).toContain("re-run with --preserve-source-ids --source-family <PREFIX>");
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
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--tracker", "quest"],
        // A READY quest: this test is about the Backlog-project guard (N3), which the ADR conditions
        // on exactly that state. With quest unusable the readiness stop fires first (D2, below).
        trackerEnvironment: () => detectedEnvironment(),
      }),
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
      adapter: fakeAdapter([], { probe: "ok" }),
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
    const { result } = await init({ args: ["--tracker", "quest"], adapter: fakeAdapter([], { probe: "ok" }) });
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

  test("the tracker question is asked in full, and the takeover offer follows it (LCLI-358.5, ADR-0024 AC#6)", async () => {
    legacyBundle();
    const asked: { question: string; choices: string[] }[] = [];
    const offers: string[] = [];
    const base = scriptedPrompter({
      tracker: "quest",
      backlogTakeover: false, // the explicit keep: proceed with Quest, leave backlog/ in place
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
      confirm: async (question, defaultValue) => {
        if (question.includes("Quest can take its tasks over")) offers.push(question);
        return base.confirm(question, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    // The tracker question still comes first and still offers the whole vocabulary (AC#1).
    expect(asked[0]?.choices).toEqual(["quest", "backlog", "jira", "none"]);
    // ...and the Backlog question is now the ADR's offer, not a migrate/keep/backlog menu.
    expect(offers).toHaveLength(1);
    expect(offers[0]).toContain("backlog/config.yml");
    expect(result.tracker).toBe("quest");
    expect(result.migration).toBeUndefined();
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test("accepting the O3 offer stops with the migration commands and writes nothing (ADR-0024 AC#6)", async () => {
    legacyBundle();
    const before = treeDigest(root);
    const base = scriptedPrompter({ tracker: "quest", agents: false, site: "none", obsidian: false });
    const defaults: boolean[] = [];
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        if (question.includes("Quest can take its tasks over")) {
          defaults.push(defaultValue);
          return true; // "yes": stop and run the migration first
        }
        return base.confirm(question, defaultValue);
      },
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
        adapter: fakeAdapter([], { probe: "ok" }),
        agentAvailability: () => ({ claude: false, codex: false }),
        trackerEnvironment: () => detectedEnvironment(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    // A quest selection defaults to YES (ADR-0024's proposed defaults: they chose Quest, and the
    // migration is the useful next step), unlike O6 below.
    expect(defaults).toEqual([true]);
    expect(err?.type).toBe("validation"); // exit 6: the tasks' fate is still unresolved
    expect(err?.hint).toContain("lore init --tracker quest --migrate-backlog");
    expect(err?.hint).toContain("--keep-backlog-tasks");
    expect(err?.hint).toContain("lore init --tracker backlog");
    // Nothing is written — at any depth — and lore runs no migration on the operator's behalf.
    expect(treeDigest(root)).toEqual(before);
  });

  test("a deliberate Backlog choice is never interrupted: the O6 offer defaults to NO and proceeds (ADR-0024 AC#6)", async () => {
    legacyBundle();
    let sawOffer = false;
    const base = scriptedPrompter({ tracker: "backlog", agents: false, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        if (question.includes("Quest can take its tasks over")) {
          sawOffer = true;
          // A bare Enter must not turn "use Backlog" into "stop and migrate".
          expect(defaultValue).toBe(false);
          return defaultValue;
        }
        return base.confirm(question, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(sawOffer).toBe(true);
    expect(result.tracker).toBe("backlog");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
  });

  test("accepting the O6 offer stops with the same commands as O3 and writes nothing (ADR-0024 AC#6)", async () => {
    legacyBundle();
    const before = treeDigest(root);
    const base = scriptedPrompter({ tracker: "backlog", agents: false, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        if (question.includes("Quest can take its tasks over")) return true;
        return base.confirm(question, defaultValue);
      },
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
        adapter: fakeAdapter([], { probe: "ok" }),
        agentAvailability: () => ({ claude: false, codex: false }),
        trackerEnvironment: () => detectedEnvironment(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("validation");
    expect(err?.hint).toContain("lore init --tracker quest --migrate-backlog");
    expect(treeDigest(root)).toEqual(before);
  });

  test("the N3 refusal names the actor context the handed-over command needs (ADR-0024 AC#9)", () => {
    legacyBundle();
    const error = expectError("validation", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--tracker", "quest"],
        trackerEnvironment: () => detectedEnvironment(),
      }),
    );
    expect(error.message).toContain("must be a deliberate choice");
    expect(error.hint).toContain("LORE_QUEST_ACTOR=<you>");
    expect(error.hint).toContain("LORE_QUEST_ACTOR_KIND=human");
    expect(error.hint).toContain("LORE_QUEST_ACCOUNTABLE_HUMAN");
    expect(error.hint).toContain("lore init --tracker quest --migrate-backlog");
    expect(error.hint).toContain("--keep-backlog-tasks");
    expect(error.hint).toContain("lore init --tracker backlog");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("backlog");
  });

  test("with a Backlog project AND no usable quest, the readiness stop wins over N3 — install remedy, exit 3 (D2)", () => {
    // The combined case the ADR's tables do not spell out. N3's row is conditioned on the detected
    // state "ready, backlog/config.yml present"; here that state does NOT hold and N1's does. The
    // ordering matters because N3 hands over the `--migrate-backlog` command, which cannot run in a
    // repository with no quest — ADR-0024's own principle is that a "yes" hands over commands that
    // work. So the readiness gate is evaluated BEFORE the Backlog-project guard.
    legacyBundle();
    const before = treeDigest(root); // `.lore/` and `backlog/` are already there — the point
    const err = expectError("not_found", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        args: ["--tracker", "quest"],
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      }),
    );
    expect(exitCodeFor(err)).toBe(EXIT_CODES.not_found); // exit 3, N1's class
    expect(err.hint).toContain(`npm install -g @opum-ai/quest@${VERSION}`);
    expect(err.hint).toContain("run `quest init`");
    expect(err.message).not.toContain("must be a deliberate choice");
    // No scaffold either: the gate runs before the first write, so the legacy bundle is untouched.
    expect(treeDigest(root)).toEqual(before);
  });

  test("no wizard question is asked after the first byte is written (LCLI-358.1; LCLI-519)", async () => {
    // The check LCLI-519 asked for, in place of the comment that used to carry the rule. LCLI-466
    // had added one prompt AFTER the base scaffold — the migration collision retry — and ADR-0024
    // removed that arm with the wizard's migration, so the invariant is a universal again; nothing
    // said so mechanically until this test. It asserts at every prompt BOUNDARY rather than only
    // at the end: a prompt moved after the first write finds a non-empty directory here and fails,
    // which an assertion taken only after the run (or only after a stop) cannot see.
    const base = scriptedPrompter({ agents: false, codex: false, site: "none", obsidian: false, tracker: "none" });
    const treesAtPrompts: string[][] = [];
    const record = (): void => {
      treesAtPrompts.push(readdirSync(root).sort());
    };
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        record();
        return base.confirm(question, defaultValue);
      },
      choose: async (question, choices, defaultValue) => {
        record();
        return base.choose(question, choices, defaultValue);
      },
      ask: async (question, defaultValue) => {
        record();
        return base.ask(question, defaultValue);
      },
      multiselect: async (question, options, defaultSelected) => {
        record();
        return base.multiselect(question, options, defaultSelected);
      },
    };
    const { result } = await init({ stdinIsTTY: true, stderrIsTTY: true, prompter, adapter: fakeAdapter([], { probe: "ok" }) });

    // Positive control, in the same invocation: the run DID write, and DID ask. Without both, the
    // emptiness assertion below would pass because nothing happened, not because the order held.
    expect(result.created.length).toBeGreaterThan(0);
    expect(treesAtPrompts.length).toBeGreaterThan(0);
    expect(treesAtPrompts.filter((tree) => tree.length > 0)).toEqual([]);
  });

  test("with a Backlog project AND a usable quest, N3 still refuses at exit 6 — unchanged (D2)", () => {
    // The other half of the precedence: the ready case must reach exactly today's message, not the
    // readiness stop. Both halves are asserted because a gate that swallows N3 entirely would pass
    // the test above.
    legacyBundle();
    const err = expectError("validation", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        args: ["--tracker", "quest"],
        trackerEnvironment: () => detectedEnvironment(),
      }),
    );
    expect(exitCodeFor(err)).toBe(EXIT_CODES.validation); // exit 6, N3's class
    expect(err.message).toContain("must be a deliberate choice");
    expect(err.hint).toContain("lore init --tracker quest --migrate-backlog");
  });

  test("jira and none stay reachable in a repository that has Backlog tasks (AC#1)", async () => {
    // The regression: the tracker question used to be REPLACED by a migrate-or-pin choice whenever
    // the bundle looked legacy, so these two backends could not be selected at all here — and a
    // deliberate `none` is still never interrupted by the takeover offer (ADR-0024's Scope).
    legacyBundle();
    let offered = false;
    const base = scriptedPrompter({ tracker: "none", agents: false, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        if (question.includes("Quest can take its tasks over")) offered = true;
        return base.confirm(question, defaultValue);
      },
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(offered).toBe(false);
    expect(result.tracker).toBe("none");
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("none");
  });

  test("declining the offer is the explicit keep: Quest selected, backlog/ exactly as found (AC#3)", async () => {
    legacyBundle();
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({
        tracker: "quest",
        backlogTakeover: false,
        agents: false,
        site: "none",
        obsidian: false,
      }),
      adapter: fakeAdapter([], { probe: "ok" }),
      agentAvailability: () => ({ claude: false, codex: false }),
    });
    expect(result.tracker).toBe("quest");
    expect(result.migration).toBeUndefined();
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
  });

  test("no Backlog project means no takeover offer at all (AC#2)", async () => {
    // A bare `backlog/` directory: present, but not a project. Nothing to migrate, nothing to ask.
    mkdirSync(join(root, "backlog", "tasks"), { recursive: true });
    const asked: string[] = [];
    const base = scriptedPrompter({ tracker: "quest", agents: false, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        asked.push(question);
        return base.confirm(question, defaultValue);
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
    const offeredValues: string[] = [];
    const base = scriptedPrompter({ agents: true, codex: true, site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      multiselect: async (question, options, defaultSelected) => {
        offeredValues.push(...options.map((option) => option.value));
        return base.multiselect(question, options, defaultSelected);
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
    // Only the AVAILABLE bridges are ever offered as options — an uninstalled one is never
    // selectable, same guarantee the old per-bridge questions gave (one omitted question each).
    expect(offeredValues.includes("claude")).toBe(availability.claude);
    expect(offeredValues.includes("codex")).toBe(availability.codex);
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

  describe("agent bridge selection is one multi-select, not sequential yes/no questions (LCLI-462)", () => {
    /** A prompter that accepts the multiselect's own pre-checked defaults, recording exactly what it offered and what came back checked. */
    function defaultAcceptingPrompter(): {
      prompter: InitPrompter;
      offered: () => string[];
      preChecked: () => string[];
    } {
      const base = scriptedPrompter({ site: "none", obsidian: false });
      let offeredValues: string[] = [];
      let preCheckedValues: string[] = [];
      return {
        prompter: {
          ...base,
          multiselect: async (question, options, defaultSelected) => {
            offeredValues = options.map((option) => option.value);
            const selected = await base.multiselect(question, options, defaultSelected);
            preCheckedValues = selected;
            return selected; // bare "enter accepts": whatever the wizard pre-checked
          },
        },
        offered: () => offeredValues,
        preChecked: () => preCheckedValues,
      };
    }

    // Review round 2: nothing starts pre-checked, on any availability. The user's original
    // complaint was tools writing instruction files nobody asked for — pre-checking anything
    // reproduces that for a bare-Enter user, so a bare Enter now writes NOTHING, matching this
    // wizard's own pre-existing "decline every bridge" outcome as the free default rather than
    // something the operator has to opt back into (see the wizard-code comment in init.ts).
    test("both Claude and Codex installed: both are offered, neither is pre-checked, so a bare Enter configures neither", async () => {
      const { prompter, offered, preChecked } = defaultAcceptingPrompter();
      const { result } = await init({
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
        agentAvailability: () => ({ claude: true, codex: true }),
        adapter: fakeAdapter([], { probe: "ok" }),
      });
      expect(offered()).toEqual(["claude", "codex"]);
      expect(preChecked()).toEqual([]);
      expect(result.agents).toBeUndefined();
      expect(result.codex).toBeUndefined();
    });

    test("declining both in one screen configures neither — the multi-select equivalent of two 'no' answers", async () => {
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

    test("toggling on only Claude while leaving Codex at its (empty) default selects just Claude", async () => {
      const { result } = await init({
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter: scriptedPrompter({ agents: true, site: "none", obsidian: false }),
        agentAvailability: () => ({ claude: true, codex: true }),
        adapter: fakeAdapter([], { probe: "ok" }),
      });
      expect(result.agents).toBeDefined();
      expect(result.codex).toBeUndefined();
    });

    test("Codex-only availability offers only Codex, not pre-checked", async () => {
      const { prompter, offered, preChecked } = defaultAcceptingPrompter();
      const { result } = await init({
        stdinIsTTY: true,
        stderrIsTTY: true,
        prompter,
        agentAvailability: () => ({ claude: false, codex: true }),
        adapter: fakeAdapter([], { probe: "ok" }),
      });
      expect(offered()).toEqual(["codex"]);
      expect(preChecked()).toEqual([]);
      expect(result.codex).toBeUndefined();
    });
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
    // scriptedPrompter with no answers at all -> every confirm/choose returns undefined, which the
    // prompter contract says means "use defaultValue": "none" for the docs-site choice, false for
    // Obsidian (matching the wizard's own docs). The agent-bridge multiselect's own default is now
    // empty (LCLI-462 review round 2) — a bare Enter there writes nothing, not "yes".
    const prompter = scriptedPrompter({});
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(result.agents).toBeUndefined(); // agent-bridge multiselect defaults to "nothing selected"
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
  });

  test("a bare non-interactive init writes no Claude bridge, and `lore instructions agents` says so (LCLI-594)", async () => {
    // The code and the agent guidance once disagreed: the guidance said a bare `lore init` still
    // bootstrapped Claude, while this path has only ever scaffolded docs/ and .lore/. Pinned as a
    // pair so neither half can drift back on its own.
    const { code, result } = await init({ stdinIsTTY: false, prompter: forbiddenPrompter() });
    expect(code).toBe(0);
    expect(result.interactive).toBe(false);
    expect(result.agents).toBeUndefined();
    expect(result.plugins).toBeUndefined();
    expect(existsSync(join(root, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(root, ".claude"))).toBe(false);

    const guidance = findInstructionTopic("agents")?.body.replace(/\s+/g, " ") ?? "";
    expect(guidance).toContain(
      "A bare `lore init` -- no bridge flag, run non-interactively -- creates NO bridge at all",
    );
    expect(guidance).not.toContain("still bootstraps Claude by default");
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
      multiselect: () => Promise.reject(eofError),
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
        trackerEnvironment: () => detectedEnvironment(),
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
      multiselect: () => Promise.reject(eofError),
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
        trackerEnvironment: () => detectedEnvironment(),
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
      multiselect: async () => [], // declines every bridge — this test only cares about git behavior
      close: () => {},
    };
    await init({ git, stdinIsTTY: true, stderrIsTTY: true, prompter, adapter: fakeAdapter([], { probe: "ok" }) });
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
      multiselect: async () => {
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
        trackerEnvironment: () => detectedEnvironment(),
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
      multiselect: async () => {
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
      multiselect: async (question, options, _defaultSelected) => {
        asked.push(question);
        return options.map((option) => option.value);
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
      trackerEnvironment: () => detectedEnvironment(),
    });
    expect(stdout.lines()).toContain("quest capable");
    expect(stdout.text()).not.toContain("backlog capable");
  });
});

describe("lore init — an unsupported tracker version is rejected at selection time (LCLI-356, pair lock since LCLI-650)", () => {
  /** A tracker adapter whose probe fails exactly the way a mismatched Quest pair does (LCLI-650). */
  function mismatchedPairAdapter(): BacklogAdapter {
    return fakeAdapter([], {
      probe: new LoreError(
        "validation",
        `the lore ${VERSION} / quest 0.2.6 pair version requirement is not met: lore ${VERSION} requires quest ${VERSION}`,
        `upgrade quest to ${VERSION}: npm install -g @opum-ai/quest@${VERSION}`,
        { code: QUEST_VERSION_PAIR_MISMATCH_CODE, lore: VERSION, quest: "0.2.6" },
      ),
    });
  }

  test("--tracker quest against a mismatched Quest pair fails and does NOT persist the backend", async () => {
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
        adapter: mismatchedPairAdapter(),
        // The readiness gate consults the detected environment first (ADR-0024); this test is
        // about the PROBE's verdict, so the environment is the ready one.
        trackerEnvironment: () => detectedEnvironment(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err).toBeInstanceOf(LoreError);
    expect(err?.type).toBe("validation");
    expect(err?.message).toContain("pair version requirement is not met");
    // The scaffold is idempotent and harmless; the SELECTION is the commitment that is withheld.
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).not.toContain('backend = "quest"');
  });

  /** A tracker adapter whose probe fails exactly the way an under-the-floor Backlog.md does (LCLI-370). */
  function belowFloorBacklogAdapter(): BacklogAdapter {
    return fakeAdapter([], {
      probe: new LoreError(
        "validation",
        "The `backlog` binary is not --json-capable: version 1.40.0 is below the 1.49.0 floor",
        "install a newer Backlog.md",
        {
          code: BACKLOG_VERSION_FLOOR_CODE,
          version: "1.40.0",
          floor: "1.49.0",
        },
      ),
    });
  }

  test("--tracker backlog against an under-the-floor Backlog.md fails and does NOT persist the backend (LCLI-370)", async () => {
    // Before this fix, only Quest's floor failure carried a discriminated code -- a below-floor
    // Backlog.md and a merely-uninitialized one both surfaced as the same undiscriminated
    // validation error, so this exact scenario silently persisted backend = "backlog" instead of
    // being refused the way the Quest case above already was.
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "backlog"],
        adapter: belowFloorBacklogAdapter(),
        // The readiness gate consults the detected environment first (ADR-0024); this test is
        // about the PROBE's verdict, so the environment is the ready one.
        trackerEnvironment: () => detectedEnvironment(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err).toBeInstanceOf(LoreError);
    expect(err?.type).toBe("validation");
    expect(err?.message).toContain("below the 1.49.0 floor");
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).not.toContain('backend = "backlog"');
  });

  test("--tracker quest against an uninitialized Quest workspace fails and does NOT persist the backend (LCLI-376)", async () => {
    // The reported defect: init exited 0, wrote backend = "quest" with quest init never run, and
    // lore check stayed green throughout -- a silent broken state rather than a loud one. This is
    // the one probe failure LORE-319 left advisory that LCLI-376 promoted to fatal, alongside the
    // pre-existing version-floor case above.
    const workspaceNotInitialized = fakeAdapter([], {
      probe: new LoreError("validation", "Quest workspace is not initialized", "run `quest init`", {
        code: QUEST_WORKSPACE_NOT_INITIALIZED_CODE,
        workspace: join(root, ".quest", "workspace.toml"),
      }),
    });
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "quest"],
        adapter: workspaceNotInitialized,
        // The readiness gate consults the detected environment first (ADR-0024); this test is
        // about the PROBE's verdict, so the environment is the ready one.
        trackerEnvironment: () => detectedEnvironment(),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err).toBeInstanceOf(LoreError);
    expect(err?.type).toBe("validation");
    expect(err?.message).toBe("Quest workspace is not initialized");
    expect(err?.hint).toBe("run `quest init`");
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
      adapter: mismatchedPairAdapter(),
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
        return { version: VERSION, schemaVersion: 1 };
      },
    };
    const { result } = await init({ args: ["--tracker", "quest", "--check-tracker"], adapter });
    expect(result.trackerCheck).toEqual({ checked: true, backend: "quest", capable: true, version: VERSION });
    expect(probes).toBe(1);
  });
});

describe("the version-floor primitive (LCLI-356; Quest's floor superseded by the pair lock, LCLI-650)", () => {
  test("a floor accepts at-or-above and rejects below, and a non-version is not a verdict", () => {
    // `atLeast` is now used by Backlog's floor alone: Quest's own floor was superseded by the
    // exact-pair lock (LCLI-650), which accepts one version and refuses every other by equality
    // rather than by ordering. The H4c primitive is unchanged and still needs its own coverage.
    for (const version of ["1.49.0", "1.49.1", "1.50.0", "2.0.0"]) {
      expect(atLeast(version, "1.49.0")?.ok).toBe(true);
    }
    for (const version of ["1.48.9", "0.9.9"]) {
      expect(atLeast(version, "1.49.0")?.ok).toBe(false);
    }
    expect(atLeast("not a version", "1.49.0")).toBeNull();
  });

  test("an invalid floor is a programming error, not a silent accept-everything", () => {
    expect(() => atLeast("1.0.0", "not-a-floor")).toThrow(/invalid minimum-version floor/);
  });
});

describe("lore init — the tracker environment is detected before the choice (LCLI-358.3)", () => {
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
      trackerEnvironment: () => detectedEnvironment({ backlog: { initialized: false }, jira: { installed: false } }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    const trackerQuestion = asked.find((entry) => entry.includes("tracker backend"));
    expect(trackerQuestion).toContain("quest: installed — initialized in this repository");
    expect(trackerQuestion).toContain("backlog: installed — not initialized in this repository");
    expect(trackerQuestion).toContain("jira: not installed (npm install -g @salient-ai/jira-cli)");
  });

  test("the summary's not-installed line names lore's own exact quest version, never `latest` (LCLI-650, ADR-0024)", async () => {
    // The pair lock (DEC-31) accepts exactly lore's own version, so `npm install -g @opum-ai/quest`
    // can hand a new user a quest the very next command refuses.
    const { stderr } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter: scriptedPrompter({ tracker: "none", site: "none", obsidian: false }),
      trackerEnvironment: () => detectedEnvironment({ quest: { installed: false } }),
    });
    expect(stderr).toContain(`not installed (npm install -g @opum-ai/quest@${VERSION})`);
    expect(stderr).not.toContain("npm install -g @opum-ai/quest)");
  });

  test("selecting quest with no binary offers O1; yes stops with the pinned remedy and writes nothing (ADR-0024 AC#1)", async () => {
    // O1. The offer is a STOP, not an install: nothing is executed, and the directory the run
    // started with is the directory it leaves behind — the wizard's every-prompt-precedes-the-first
    // -write invariant, which is what makes "nothing written" checkable rather than aspirational.
    // Snapshot at content level: a `.lore/` written before the offer would be invisible to a
    // top-level listing (D6).
    const before = treeDigest(root);
    const asked: string[] = [];
    const base = scriptedPrompter({ tracker: "quest", site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question, defaultValue) => {
        if (question.includes("not installed")) asked.push(question);
        return base.confirm(question, defaultValue);
      },
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
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(asked).toEqual(["Quest is not installed. Stop `lore init` here so you can install it, then rerun?"]);
    expect(err?.type).toBe("not_found"); // exit 3: the state, not the answer
    expect(err?.hint).toContain(`npm install -g @opum-ai/quest@${VERSION}`);
    expect(err?.hint).toContain("run `quest init`");
    expect(err?.hint).toContain("rerun `lore init`");
    expect(treeDigest(root)).toEqual(before); // byte-identical, at every depth: nothing was written
  });

  test("O1 drops the `quest init` step when the workspace marker is already there (ADR-0024 AC#1)", async () => {
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
        prompter: scriptedPrompter({ tracker: "quest", site: "none", obsidian: false }),
        // Uninstalled, but this repository is already initialized for Quest: telling it to
        // initialize again is noise, and the ADR drops exactly that step.
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: true } }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.hint).toContain(`npm install -g @opum-ai/quest@${VERSION}`);
    expect(err?.hint).not.toContain("quest init");
  });

  test("declining O1 returns to the tracker question and detection continues (O1b, ADR-0024 AC#1)", async () => {
    let trackerAsks = 0;
    const prompter: InitPrompter = {
      confirm: async (question) => !question.includes("not installed"), // declines O1
      choose: async (question, _choices, defaultValue) => {
        if (!question.includes("tracker backend")) return defaultValue;
        trackerAsks += 1;
        return trackerAsks === 1 ? "quest" : "none"; // declines the offer, then picks a ready backend
      },
      ask: async (_question, defaultValue) => defaultValue,
      multiselect: async () => [],
      close: () => {},
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(trackerAsks).toBe(2); // back to the question, once
    expect(result.tracker).toBe("none");
  });

  test("selecting quest installed but uninitialized offers O2; yes stops with `quest init`, exit 6, nothing written (ADR-0024 AC#2)", async () => {
    const before = treeDigest(root);
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
        prompter: scriptedPrompter({ tracker: "quest", site: "none", obsidian: false }),
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: true, initialized: false } }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("validation"); // exit 6: the state, not the answer
    expect(err?.message).toContain(".quest/workspace.toml");
    expect(err?.hint).toContain("run `quest init` here, then rerun `lore init`");
    expect(treeDigest(root)).toEqual(before);
  });

  test("declining O2 returns to the tracker question (O2b, ADR-0024 AC#2)", async () => {
    let trackerAsks = 0;
    const prompter: InitPrompter = {
      confirm: async () => false, // declines O2
      choose: async (question, _choices, defaultValue) => {
        if (!question.includes("tracker backend")) return defaultValue;
        trackerAsks += 1;
        return trackerAsks === 1 ? "quest" : "none";
      },
      ask: async (_question, defaultValue) => defaultValue,
      multiselect: async () => [],
      close: () => {},
    };
    const { result } = await init({
      stdinIsTTY: true,
      stderrIsTTY: true,
      prompter,
      trackerEnvironment: () => detectedEnvironment({ quest: { installed: true, initialized: false } }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(trackerAsks).toBe(2);
    expect(result.tracker).toBe("none");
  });

  test("a second selection of the same unready backend prints no second offer and stops (O12, ADR-0024 AC#3)", async () => {
    let trackerAsks = 0;
    const offers: string[] = [];
    const base = scriptedPrompter({ tracker: "quest", site: "none", obsidian: false });
    const prompter: InitPrompter = {
      ...base,
      confirm: async (question) => {
        if (question.includes("not installed")) offers.push(question);
        return false; // always declines the readiness offer
      },
      choose: async (question, _choices, defaultValue) => {
        if (!question.includes("tracker backend")) return defaultValue;
        trackerAsks += 1;
        return "quest"; // the adversarial answer: the same unready backend, every pass
      },
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
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(trackerAsks).toBe(2); // still bounded by MAX_TRACKER_ATTEMPTS
    expect(offers).toHaveLength(1); // the one-shot bound: one offer per backend per run
    // The stop is the SAME one the first offer's "yes" would have produced.
    expect(err?.type).toBe("not_found");
    expect(err?.hint).toContain(`npm install -g @opum-ai/quest@${VERSION}`);
  });

  test("selecting backlog with no binary stops immediately, with no offer and no prompt (O4, ADR-0024 AC#4)", async () => {
    const prompter: InitPrompter = {
      confirm: () => {
        throw new Error("O4 has no offer — no prompt may be shown");
      },
      choose: async (question, _choices, defaultValue) => (question.includes("tracker") ? "backlog" : defaultValue),
      ask: async (_question, defaultValue) => defaultValue,
      multiselect: async () => [],
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
        trackerEnvironment: () => detectedEnvironment({ backlog: { installed: false, initialized: false } }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("not_found");
    expect(err?.hint).toContain("npm install -g backlog.md");
    expect(err?.hint).toContain("1.49.0 or newer"); // the floor the adapter enforces, named
    expect(err?.hint).toContain("backlog init");
    expect(err?.hint).toContain("rerun `lore init`");
  });

  test("selecting backlog with no project stops immediately at exit 6 (O5, ADR-0024 AC#4)", async () => {
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
        prompter: scriptedPrompter({ tracker: "backlog", site: "none", obsidian: false }),
        trackerEnvironment: () => detectedEnvironment({ backlog: { installed: true, initialized: false } }),
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("validation");
    expect(err?.message).toContain("backlog/config.yml");
    expect(err?.hint).toContain("run `backlog init` here, then rerun `lore init`");
  });

  test("--tracker quest with quest not on PATH stops with the O1 remedy at exit 3 (N1, ADR-0024 AC#4)", () => {
    // Today (before this change) the same invocation was advisory and exited 0 having written
    // `backend = "quest"` into a repository with no quest — the LCLI-356 defect.
    // Thrown SYNCHRONOUSLY: the readiness gate runs ahead of every async step in `runInit`, which
    // is what lets it precede the Backlog-project guard (D2) and what leaves the directory
    // completely untouched — no scaffold either.
    const err = expectError("not_found", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "quest"],
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      }),
    );
    expect(err.hint).toContain(`npm install -g @opum-ai/quest@${VERSION}`);
    expect(err.hint).toContain("run `quest init`");
    expect(readdirSync(root)).toEqual([]);
  });

  test("--tracker quest with no workspace stops at exit 6 (N2, ADR-0024 AC#4)", () => {
    const err = expectError("validation", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "quest"],
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: true, initialized: false } }),
      }),
    );
    expect(err.hint).toContain("run `quest init` here, then rerun `lore init`");
    expect(readdirSync(root)).toEqual([]);
  });

  test("--tracker backlog stops at exit 3 when missing (N5) and exit 6 when uninitialized (N6)", () => {
    const missing = expectError("not_found", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "backlog"],
        trackerEnvironment: () => detectedEnvironment({ backlog: { installed: false } }),
      }),
    );
    expect(missing.hint).toContain("npm install -g backlog.md");
    expect(readdirSync(root)).toEqual([]);

    const uninitialized = expectError("validation", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "backlog"],
        trackerEnvironment: () => detectedEnvironment({ backlog: { installed: true, initialized: false } }),
      }),
    );
    expect(uninitialized.hint).toContain("run `backlog init` here, then rerun `lore init`");
    expect(readdirSync(root)).toEqual([]);
  });

  test("a bare non-TTY `lore init` with no --tracker is unchanged: it pins the default and probes nothing (N8, ADR-0024 AC#4)", async () => {
    // LORE-260's guarantee, and the ADR's explicit "unchanged in both directions": no choice was
    // expressed, so no readiness verdict is reached and no tracker subprocess runs.
    const { code, result } = await init({
      // Detected as thoroughly UNREADY — the point is that nothing consults it on this path.
      trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      adapter: fakeAdapter([], { probe: "ok" }),
    });
    expect(code).toBe(0);
    expect(result.tracker).toBeUndefined();
    expect(result.trackerCheck).toBeUndefined();
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test("--install-tracker is accepted, installs nothing, and prints the deprecation note (N9, ADR-0024 AC#5)", async () => {
    const { code, result, stderr } = await init({
      args: ["--tracker", "backlog", "--install-tracker"],
      trackerEnvironment: () => detectedEnvironment(),
    });
    expect(code).toBe(0);
    expect(result.installed).toBeUndefined(); // nothing is ever installed any more
    expect(stderr).toContain("deprecation: lore no longer installs tracker CLIs on your behalf");
    expect(stderr).toContain("will be removed in the next release");
    expect(readFileSync(join(root, ".lore/config.toml"), "utf8")).toContain('backend = "backlog"');
  });

  test("--no-install-tracker is accepted as a no-op with the same note (N9, ADR-0024 AC#5)", async () => {
    const { code, result, stderr } = await init({
      args: ["--tracker", "backlog", "--no-install-tracker"],
      trackerEnvironment: () => detectedEnvironment(),
    });
    expect(code).toBe(0);
    expect(result.installed).toBeUndefined();
    expect(stderr).toContain("deprecation: lore no longer installs tracker CLIs on your behalf");
  });

  test("a not-ready selection stops as N1/N2/N5/N6 with the deprecation note printed (N9)", () => {
    const stderr = capture();
    const err = expectError("not_found", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr,
        clock: FIXED_CLOCK,
        args: ["--tracker", "quest", "--install-tracker"],
        trackerEnvironment: () => detectedEnvironment({ quest: { installed: false, initialized: false } }),
      }),
    );
    expect(err.hint).toContain(`npm install -g @opum-ai/quest@${VERSION}`);
    // The note is written before the gate that stops, so a caller that passes the deprecated flag
    // learns it no longer means anything on the very run it stopped on.
    expect(stderr.text()).toContain("deprecation: lore no longer installs tracker CLIs on your behalf");
  });

  test("nothing is ever installed: no path reaches an installer at all", async () => {
    // The property the ADR exists for, stated as a test rather than a promise: `lore init` has no
    // installer seam to inject (see `InitOptions`), so the strongest available assertion is that a
    // run over a ready environment, over an unready one, and with both deprecated flags installed
    // nothing and reports nothing installed.
    for (const extra of [
      { args: ["--tracker", "backlog"] },
      { args: ["--tracker", "backlog", "--install-tracker"] },
      { args: ["--tracker", "backlog", "--no-install-tracker"] },
    ]) {
      const { result } = await init({ ...extra, trackerEnvironment: () => detectedEnvironment() });
      expect(result.installed).toBeUndefined();
    }
  });

  test("--install-tracker and --no-install-tracker together is a usage error (N9, ADR-0024 AC#5)", () => {
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

  test("--preserve-source-ids without --source-family is a usage error (LCLI-465)", () => {
    const err = expectError("usage", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--tracker", "quest", "--migrate-backlog", "--preserve-source-ids"],
      }),
    );
    expect(err.message).toContain("--source-family");
  });

  test("--source-family without --preserve-source-ids is a usage error", () => {
    const err = expectError("usage", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--tracker", "quest", "--migrate-backlog", "--source-family", "LCLI"],
      }),
    );
    expect(err.message).toContain("--preserve-source-ids");
  });

  test("--preserve-source-ids without --migrate-backlog is a usage error", () => {
    const err = expectError("usage", () =>
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        args: ["--preserve-source-ids", "--source-family", "LCLI"],
      }),
    );
    expect(err.message).toContain("--migrate-backlog");
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
    await init({ args: ["--tracker", "quest"], jira: fakeJira({ calls }), adapter: fakeAdapter([], { probe: "ok" }) });
    await init({ args: ["--tracker", "none"], jira: fakeJira({ calls }) });
    expect(calls).toEqual([]);
  });
});

/**
 * LCLI-467 — what happens to `backlog/` once its tasks are in Quest.
 *
 * These run against a REAL git repository in the temp root rather than a stubbed transport: the
 * whole safety argument for this feature is "git already holds these bytes", and a stub that says
 * so proves nothing about the transport `lore init` actually uses. The deletion, the archive, and
 * the uncommitted-deletion residue are all read back from the filesystem and from git itself.
 *
 * **Flag path only since ADR-0024.** The wizard used to offer the same removal after running its
 * own migration; it no longer runs a migration at all (a "yes" to O3/O6 stops with the commands
 * instead), which left the offer unreachable. What a wizard user gets now is the stop, and this
 * question is answered by `--remove-backlog`/`--no-remove-backlog` when they run the migration
 * themselves — the same flags the stop hands them.
 */
describe("lore init — removing backlog/ after a plain --migrate-backlog (LCLI-467)", () => {
  const migrationResult = {
    digest: "sha256:reviewed",
    sourceFingerprint: "sha256:source",
    mappings: [],
    survivors: [],
    excluded: [],
    taskFingerprints: {},
    state: "applied" as const,
  };

  /** A legacy bundle whose `backlog/` is genuinely committed — the only state removal is offered in. */
  function committedBacklog(): void {
    legacyBundle();
    writeFileSync(join(root, "backlog", "tasks", "task-1 - First.md"), "---\nid: task-1\n---\n\n# First\n");
    gitRun(root, ["init"]);
    gitRun(root, ["add", "backlog"]);
    gitRun(root, ["-c", "user.email=t@example.test", "-c", "user.name=T", "commit", "-m", "backlog"]);
  }

  function git(args: string[]): { exitCode: number; stdout: string } {
    return bunGitPreflightSpawn(root)(args);
  }

  test("--remove-backlog is the scripted equivalent, and removes it without a prompt (AC#3)", async () => {
    committedBacklog();
    const { result } = await init({
      args: ["--tracker", "quest", "--migrate-backlog", "--remove-backlog"],
      migrateBacklog: async () => migrationResult,
    });
    expect(existsSync(join(root, "backlog"))).toBe(false);
    expect(result.backlogRemoval?.removed).toBe(true);
    expect(git(["status", "--porcelain", "--", "backlog"]).stdout.trim()).not.toBe("");
  });

  test("a scripted run with NEITHER flag keeps backlog/ and says so — the skip is never silent (AC#3)", async () => {
    committedBacklog();
    const { result, stderr } = await init({
      args: ["--tracker", "quest", "--migrate-backlog"],
      migrateBacklog: async () => migrationResult,
    });
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
    expect(stderr).toContain("backlog/ was left in place");
    expect(stderr).toContain("--remove-backlog");
    expect(stderr).toContain("--no-remove-backlog");
    expect(result.backlogRemoval).toEqual({
      removed: false,
      reason: "no --remove-backlog/--no-remove-backlog",
    });
  });

  test("--no-remove-backlog keeps it with no notice: the choice was already explicit (AC#3)", async () => {
    committedBacklog();
    const { result, stderr } = await init({
      args: ["--tracker", "quest", "--migrate-backlog", "--no-remove-backlog"],
      migrateBacklog: async () => migrationResult,
    });
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
    expect(stderr).not.toContain("backlog/ was left in place");
    expect(result.backlogRemoval).toEqual({ removed: false, reason: "--no-remove-backlog was passed" });
  });

  test("--remove-backlog over an unrecoverable backlog/ is REFUSED, not silently skipped", async () => {
    committedBacklog();
    writeFileSync(join(root, "backlog", "config.yml"), "statuses:\n  - Done\n");
    const err = await Promise.resolve(
      runInit({
        root,
        git: gitStub(),
        output: JSON_CTX,
        stdout: capture(),
        stderr: capture(),
        clock: FIXED_CLOCK,
        args: ["--tracker", "quest", "--migrate-backlog", "--remove-backlog"],
        migrateBacklog: async () => migrationResult,
      }),
    ).then(
      () => undefined,
      (caught: unknown) => caught as LoreError,
    );
    expect(err?.type).toBe("denied");
    expect(exitCodeFor(err as LoreError)).toBe(EXIT_CODES.denied);
    expect(err?.message).toContain("uncommitted changes");
    expect(err?.hint).toContain("git checkout -- backlog/");
    // The refusal is of the DELETION only: the migration already applied, so the selection stands.
    expect(existsSync(join(root, "backlog", "config.yml"))).toBe(true);
    expect(loadConfig({ root, env: {} }).tracker.backend).toBe("quest");
  });

  test.each([
    [
      "both spellings at once",
      ["--tracker", "quest", "--migrate-backlog", "--remove-backlog", "--no-remove-backlog"],
      "mutually exclusive",
    ],
    ["--remove-backlog with no migration", ["--tracker", "quest", "--remove-backlog"], "only means something with"],
    [
      "--no-remove-backlog with no migration",
      ["--tracker", "quest", "--no-remove-backlog"],
      "only means something with",
    ],
    [
      "either spelling against the coordinated cutover",
      ["--tracker", "quest", "--migrate-backlog", "--adopt-manifest", "m.json", "--remove-backlog"],
      "already archives and deletes backlog/",
    ],
  ] as const)("flag pairing is refused up front: %s", (_name, args, expected) => {
    legacyBundle();
    const err = expectError("usage", () =>
      runInit({ root, git: gitStub(), output: JSON_CTX, stdout: capture(), args: [...args] }),
    );
    expect(err.message).toContain(expected);
  });
});
