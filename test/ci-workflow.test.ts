import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";

const WORKFLOWS_DIR = join(import.meta.dir, "..", ".github", "workflows");
const WORKFLOW_PATH = join(WORKFLOWS_DIR, "ci.yml");
const GUARD_WORKFLOW_PATH = join(WORKFLOWS_DIR, "main-fast-forward-guard.yml");

interface WorkflowJob {
  env?: Record<string, string>;
  if?: string;
  /** Present only when a job declares a dependency; the docs gate (LCLI-504) asserts it is absent. */
  needs?: string | string[];
  steps?: Array<{
    name?: string;
    run?: string;
    /** A step that calls a composite action, e.g. `./.github/actions/setup-quest` (DEC-55). */
    uses?: string;
    with?: Record<string, unknown>;
  }>;
  strategy?: {
    matrix?: {
      os?: string;
    };
  };
}

interface WorkflowDoc {
  on: {
    push?: {
      branches?: string[];
      "paths-ignore"?: string[];
    };
    pull_request?: unknown;
    workflow_dispatch?: {
      inputs?: {
        ladybug_exact_hosts_only?: {
          description?: string;
          default?: boolean;
          type?: string;
        };
      };
    };
  };
  /** Workflow-level env, where DEC-55's pinned quest-cli ref lives. */
  env?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

/** The composite action DEC-55 put the Quest CLI resolution into. */
const SETUP_QUEST_PATH = join(import.meta.dir, "..", ".github", "actions", "setup-quest", "action.yml");

function loadWorkflow(path: string = WORKFLOW_PATH): WorkflowDoc {
  return yaml.load(readFileSync(path, "utf8"), { schema: yaml.JSON_SCHEMA }) as WorkflowDoc;
}

describe("ci.yml exact-host LadybugDB qualification", () => {
  test("the narrow manual mode is explicit and defaults off", () => {
    const input = loadWorkflow().on.workflow_dispatch?.inputs?.ladybug_exact_hosts_only;
    expect(input).toEqual({
      description: "Run only LadybugDB qualification on Darwin x64 and Linux arm64",
      type: "boolean",
      default: false,
    });
  });

  test("the narrow mode selects only Darwin x64 and Linux arm64 without changing normal matrices", () => {
    const matrix = loadWorkflow().jobs.check?.strategy?.matrix?.os ?? "";
    expect(matrix).toContain("inputs.ladybug_exact_hosts_only == true");
    expect(matrix).toContain('["macos-15-intel","ubuntu-24.04-arm"]');
    expect(matrix).toContain('["ubuntu-latest","windows-latest"]');
    expect(matrix).toContain('["ubuntu-latest","windows-latest","macos-latest"]');
  });

  test("the narrow mode skips every unrelated CI job", () => {
    const jobs = loadWorkflow().jobs;
    expect(Object.keys(jobs)).toEqual([
      "check",
      "tracker",
      "docs-gate",
      "package-set",
      "promotion-is-manual",
      "config-test-newest-bun",
      "ladybug-benchmark-smoke",
      "build",
      "explorer-browser-qualification",
      "scaffold-mkdocs",
      "scaffold-docusaurus",
      "docker-e2e",
      "mod-gate",
    ]);

    // promotion-is-manual (LCLI-458) is a pull_request-scoped promotion guardrail, not
    // Ladybug-related — it never runs under workflow_dispatch at all (any variant, narrow or not),
    // by virtue of its OWN if: condition, not this shared guard. Its push-side sibling, main is
    // fast-forward of dev, now lives in its own workflow (LCLI-605).
    const skippedUnderNarrowMode = new Set(["check", "promotion-is-manual"]);
    const exactHostSkipGuard = "github.event_name != 'workflow_dispatch' || inputs.ladybug_exact_hosts_only != true";
    for (const [name, job] of Object.entries(jobs)) {
      if (skippedUnderNarrowMode.has(name)) continue;
      expect(job.if).toBe(exactHostSkipGuard);
    }
  });

  test("the two promotion guardrails (LCLI-458) never run under any workflow_dispatch, narrow mode or not", () => {
    const jobs = loadWorkflow().jobs;
    expect(jobs["promotion-is-manual"]?.if).toBe("github.event_name == 'pull_request' && github.base_ref == 'main'");
    // The push-side guardrail's workflow has no workflow_dispatch trigger at all (LCLI-605).
    expect(Object.keys(loadWorkflow(GUARD_WORKFLOW_PATH).on)).toEqual(["push"]);
  });

  test("the explorer qualification installs and runs all pinned Playwright engines from a repo-local cache", () => {
    const job = loadWorkflow().jobs["explorer-browser-qualification"];
    expect(job?.env?.PLAYWRIGHT_BROWSERS_PATH).toBe(".lore/cache/ms-playwright");
    expect(job?.steps?.find((step) => step.name === "Install pinned browser engines")?.run).toBe(
      "bunx playwright install --with-deps chromium firefox webkit",
    );
    expect(job?.steps?.find((step) => step.name === "Qualify the static explorer")?.run).toBe("bun run test:browser");
  });

  test("platform-specific concurrency and timeouts stay explicitly bounded", () => {
    const testScript = loadWorkflow().jobs.check?.steps?.find((step) => step.name === "Test")?.run ?? "";
    expect(testScript).toContain("bun test --isolate --max-concurrency=4 --timeout=60000");
    expect(testScript).toContain('"macos-15-intel"');
    expect(testScript).toContain("bun test --isolate --timeout=40000");
    expect(testScript).toContain('== "ubuntu-latest"');
    expect(testScript).toContain('== "ubuntu-24.04-arm"');
    expect(testScript).toContain("bun test --isolate --max-concurrency=1 --timeout=10000");
    // The ubuntu leg's budget is a single value used by the run AND by the LCLI-659 classifier,
    // so the two cannot drift apart; the wrapper and the bound are both still asserted.
    expect(testScript).toContain("lore_per_test_ms=10000");
    expect(testScript).toContain(
      'timeout --kill-after=10s 6m bun test --isolate --max-concurrency=1 --timeout="$' + '{lore_per_test_ms}"',
    );
    expect(testScript).toContain("error: EEXIST: file already exists, epoll_ctl");
    expect(testScript).toContain("lore_bun_status=$" + "{PIPESTATUS[0]}");
    expect(testScript).toContain('exit "$' + '{lore_bun_status}"');
    expect(testScript).toContain("else\n  bun test --isolate --timeout=10000");
  });

  test("the Bun-epoll retry (LCLI-507) triggers on the bounded-timeout exit as well as the EEXIST string", () => {
    // The same race can present as a quick EEXIST error (the original guard) OR
    // as a full hang killed by the `timeout --kill-after=10s 6m` wrapper with
    // exit 124 — job 104458113048 on PR #107 hit exactly that and the grep-only
    // guard missed it. This asserts the source contains the widened condition;
    // "ci.yml ubuntu Bun-epoll retry trigger (LCLI-507)" below exercises it.
    const testScript = loadWorkflow().jobs.check?.steps?.find((step) => step.name === "Test")?.run ?? "";
    expect(testScript).toContain(
      'if grep -Fq "error: EEXIST: file already exists, epoll_ctl" "$' +
        '{lore_bun_log}" || [[ "$' +
        '{lore_bun_status}" -eq 124 ]]; then',
    );
  });
});

describe("ci.yml ubuntu Bun-epoll retry trigger (LCLI-507)", () => {
  // Extracts the actual retry condition from ci.yml's ubuntu Test step, rather
  // than a hand-copied approximation of it, so this test tracks the real guard
  // and fails loudly if a future edit narrows it back to a single signal.
  function extractRetryCondition(): string {
    const testScript = loadWorkflow().jobs.check?.steps?.find((step) => step.name === "Test")?.run ?? "";
    const match = testScript.match(/if (grep -Fq "error: EEXIST:[^\n]*?); then\n/);
    const condition = match?.[1];
    if (!condition) {
      throw new Error("could not find the ubuntu Bun-epoll retry condition in ci.yml's Test step");
    }
    return condition;
  }

  // Runs the extracted condition in a real bash subshell against a fabricated
  // log file and exit status, exactly the two inputs the condition reads in
  // ci.yml, and reports whether the retry branch fired. This is a behavioral
  // check of the guard's logic, not a second string match.
  function retryFires(logContents: string, exitStatus: number): boolean {
    const dir = mkdtempSync(join(tmpdir(), "lcli-507-retry-"));
    try {
      const logPath = join(dir, "lore-bun-test.log");
      writeFileSync(logPath, logContents);
      const condition = extractRetryCondition();
      const script = `
        lore_bun_log="${logPath}"
        lore_bun_status=${exitStatus}
        if ${condition}; then
          echo RETRY
        else
          echo NO_RETRY
        fi
      `;
      const result = spawnSync("bash", ["-c", script], { encoding: "utf8" });
      if (result.status !== 0) {
        throw new Error(`retry-condition harness exited ${result.status}: ${result.stderr}`);
      }
      return result.stdout.trim() === "RETRY";
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("retries on the EEXIST string, as before", () => {
    expect(retryFires("error: EEXIST: file already exists, epoll_ctl\n", 1)).toBe(true);
  });

  test("retries on exit 124 (the bounded-timeout hang) even with no EEXIST in the log", () => {
    expect(retryFires("", 124)).toBe(true);
  });

  test("retries when both signals are present", () => {
    expect(retryFires("error: EEXIST: file already exists, epoll_ctl\n", 124)).toBe(true);
  });

  test("does not retry a genuine product-test failure — neither signal present", () => {
    expect(retryFires("FAIL: expected 1 to equal 2\n", 1)).toBe(false);
  });
});

describe("ci.yml docs gate (LCLI-504)", () => {
  test("a job actually runs `lore check`, and runs it from source", () => {
    // The fleet rule is "`lore check` exiting 0 is the definition of done for a docs
    // change". Before LCLI-504 no job in this workflow ran it at all, so the rule gated
    // nothing and `lore check` had been exiting 6 on dev unnoticed. This asserts the job
    // cannot be silently gutted back to that state. LCLI-661 routed the invocation through
    // scripts/ci-quiet-gate.sh (findings quote document text, and the runner parses a
    // step's output as workflow commands); the assertion still pins that the gate really
    // runs `bun run lore check` from source, now behind the guard.
    const job = loadWorkflow().jobs["docs-gate"];
    expect(job?.steps?.find((step) => step.name === "lore check")?.run).toBe(
      "scripts/ci-quiet-gate.sh bun run lore check",
    );
  });

  test("the docs gate installs the Quest CLI, which `lore check` cannot run without", () => {
    // Not a convenience: this repository's tracker backend is quest, so reconciliation
    // shells out to the quest binary. With it off PATH, `lore check` exits 3. A job that
    // dropped this step would fail for a reason that has nothing to do with the docs.
    //
    // DEC-55 moved the resolution into .github/actions/setup-quest, so this asserts the
    // CALL (with the derived version and the pinned source ref) and the action file
    // itself carries the npm-then-source behaviour, asserted below.
    const job = loadWorkflow().jobs["docs-gate"];
    const steps = job?.steps ?? [];
    const setup = steps.find((step) => step.uses === "./.github/actions/setup-quest");
    expect(setup).toBeDefined();
    expect(setup?.with?.version).toBe("${{ steps.quest.outputs.version }}");
    expect(setup?.with?.["source-ref"]).toBe("${{ env.QUEST_SOURCE_REF }}");
    // Derived from CLAUDE.md's managed block rather than pinned a second time here —
    // the same rule the tracker job states, and the reason the two must stay in step.
    expect(steps.some((step) => (step.run ?? "").includes("Quest CLI \\([0-9][0-9.]*\\)"))).toBe(true);
  });

  test("compile smoke runs the README quickstart against the binary it just built", () => {
    // LCLI-571: the quickstart ships in the npm tarball and sat broken through three
    // releases because nothing ran it. The script needs the quest binary, so assert both.
    const steps = loadWorkflow().jobs["build"]?.steps ?? [];
    expect(steps.some((step) => step.run === "scripts/readme-quickstart.sh dist/lore")).toBe(true);
    expect(steps.some((step) => step.uses === "./.github/actions/setup-quest")).toBe(true);
  });

  test("every quest-consuming required job resolves quest the same way (DEC-55)", () => {
    // Tracker integrity, the docs gate and compile smoke all drive the quest binary.
    // The resolution lives in one action so the three cannot drift; a fourth job that
    // installs quest inline would bypass the source fallback and red the window again.
    const jobs = loadWorkflow().jobs;
    for (const jobId of ["tracker", "docs-gate", "build"]) {
      expect(jobs[jobId]?.steps?.some((step) => step.uses === "./.github/actions/setup-quest")).toBe(true);
    }
    const inline = Object.entries(jobs).flatMap(([id, job]) =>
      (job.steps ?? []).filter((step) => (step.run ?? "").includes('npm install -g "@opum-ai/quest@')).map(() => id),
    );
    expect(inline).toEqual([]);
  });

  /**
   * The action's OWN structure, parsed rather than grepped.
   *
   * An earlier revision of these tests did `readFileSync(action).toContain(...)` on
   * five substrings, and an adversarial review measured ELEVEN of fourteen mutations
   * surviving it — including the fallback disarmed outright (the npm step's failing
   * branch replaced by `exit 1`), both `if:` lines deleted, the mismatch guard's
   * `exit 1` dropped, and the shim written into a directory that is never appended to
   * `GITHUB_PATH`. The window this action covers is the one nobody watches, which is
   * exactly why the wiring, not the vocabulary, is what has to be pinned here.
   */
  const SETUP_QUEST_FALLBACK_IF = "steps.npm.outputs.method == 'source'";

  interface ActionStep {
    id?: string;
    if?: string;
    run?: string;
    uses?: string;
    "continue-on-error"?: boolean;
  }

  function loadSetupQuest(): {
    inputs: Record<string, { required?: boolean } | undefined>;
    runs: { steps: ActionStep[] };
  } {
    return yaml.load(readFileSync(SETUP_QUEST_PATH, "utf8"), { schema: yaml.JSON_SCHEMA }) as {
      inputs: Record<string, { required?: boolean } | undefined>;
      runs: { steps: ActionStep[] };
    };
  }

  test("setup-quest takes both inputs as required, and reaches the build only from the failed install", () => {
    const action = loadSetupQuest();
    expect(Object.keys(action.inputs).sort()).toEqual(["source-ref", "version"]);
    expect(action.inputs.version?.required).toBe(true);
    expect(action.inputs["source-ref"]?.required).toBe(true);

    const steps = action.runs.steps;
    expect(steps).toHaveLength(4);
    const npm = steps[0];
    expect(npm?.id).toBe("npm");
    // Today's exact install, unchanged.
    expect(npm?.run).toContain('npm install -g "@opum-ai/quest@${{ inputs.version }}"');
    // The fallback is entered by the FAILED INSTALL, not by aborting the job, and a
    // plain `toContain` cannot tell those two apart: it passes for a branch that is
    // present but unreachable (measured — an `else` turned into `elif true` left the
    // line in place and every assertion green). So this pins the SHAPE: one
    // if/then/else/fi whose failing branch is the one that records `method=source`.
    expect(npm?.run).toMatch(
      /if npm install -g "@opum-ai\/quest@\$\{\{ inputs\.version \}\}"; then[\s\S]*?method=npm[\s\S]*?else[\s\S]*?method=source[\s\S]*?fi/,
    );
    expect(npm?.run).not.toContain("exit 1");
  });

  test("exactly the three build-and-assert steps are gated on the fallback, and none can be neutralised", () => {
    const steps = loadSetupQuest().runs.steps;
    const gated = steps.slice(1);
    expect(gated.map((step) => step.if)).toEqual([
      SETUP_QUEST_FALLBACK_IF,
      SETUP_QUEST_FALLBACK_IF,
      SETUP_QUEST_FALLBACK_IF,
    ]);
    // ...and in that order: the toolchain, the clone-and-build, the assertion.
    expect(gated[0]?.uses).toBe("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(gated[1]?.uses).toBeUndefined();
    expect(gated[2]?.uses).toBeUndefined();
    // A `continue-on-error` anywhere in this action would let a broken fallback pass
    // while the gates ran against no quest at all.
    expect(steps.every((step) => step["continue-on-error"] === undefined)).toBe(true);
  });

  test("the build step puts the shim it writes onto PATH, and installs frozen", () => {
    const run = loadSetupQuest().runs.steps[2]?.run ?? "";
    expect(run).toContain(
      'git clone --quiet --filter=blob:none --no-checkout https://github.com/opum-ai/quest-cli.git "$dest"',
    );
    expect(run).toContain('cat-file -e "$QUEST_SOURCE_REF^{commit}"');
    expect(run).toContain("sparse-checkout set src package.json bun.lock tsconfig.json");
    expect(run).toContain('checkout --quiet "$QUEST_SOURCE_REF"');
    // The `.bun-version` pin matters: quest-cli's lockfile was written by that runtime.
    expect(run).toContain("bun install --frozen-lockfile");
    // ONE directory, captured once and used for both the write and the PATH entry.
    // A shim written to a directory that is not the one appended to `GITHUB_PATH`
    // leaves every gate running without a quest, and reads as a lore defect.
    expect(run).toContain('bin="$RUNNER_TEMP/quest-bin"');
    expect(run).toContain('> "$bin/quest"');
    expect(run).toContain('chmod +x "$bin/quest"');
    expect(run).toContain('echo "$bin" >> "$GITHUB_PATH"');
    // The one runner whose lookup cannot resolve that shim must be refused there,
    // and only there — a wider guard would refuse a runner the shim works on.
    expect(run).toContain('if [ "$RUNNER_OS" = "Windows" ]');
  });

  test("the assertion step refuses a build that does not report the declared version, and can fail the job", () => {
    const run = loadSetupQuest().runs.steps[3]?.run ?? "";
    expect(run).toContain('reported="$(quest --version)"');
    // Shape again, not vocabulary: the exit must live INSIDE the mismatch branch.
    // Without it the guard prints its refusal and passes, and three required contexts
    // run against the wrong peer while every log line looks right — and a bare
    // `toContain("exit 1")` would pass for an exit anywhere else in the step.
    expect(run).toMatch(/if \[ "\$reported" != "\$DECLARED" \]; then[\s\S]*?exit 1[\s\S]*?fi/);
    // The success line claims provenance, so the step has to have resolved it.
    expect(run).toContain("command -v quest");
  });

  test("DEC-55's pinned quest-cli ref is a full commit SHA, not a branch", () => {
    // A branch here would make the build move under the workflow — the peer would be
    // whatever that branch happened to hold on the day, which is exactly the float the
    // action's assertion exists to catch.
    const ref = loadWorkflow().env?.QUEST_SOURCE_REF;
    expect(ref).toMatch(/^[0-9a-f]{40}$/);
  });

  test("the docs gate never depends on another job, so a required context cannot go absent", () => {
    // A `needs:` would make this context SKIP when its dependency fails, and a skipped
    // context is absent rather than green — which blocks dev until an admin notices.
    // Same trap as an `if:` that evaluates false, reached through a dependency instead.
    expect(loadWorkflow().jobs["docs-gate"]?.needs).toBeUndefined();
  });
});

describe("tracker and docs reads stay out of the workflow-command parser (LCLI-661)", () => {
  // The defect, measured 2026-09-30 on this repository: the tracker job ran
  // `quest task list --json` bare, the runner parses a step's stdout as workflow commands,
  // and a record quoting a CI log line — "##[error]Process completed with exit code 1."
  // lives in .quest/completed/LCLI-507.json — forged a real failure annotation on the job
  // while it was green (check-run 110060733763). The read is now redirected and counted,
  // and the sibling quest/lore steps in these two jobs run through
  // scripts/ci-quiet-gate.sh, which replays captured output inside ::stop-commands:: markers.

  function stepRun(jobId: string, stepName: string): string {
    return loadWorkflow().jobs[jobId]?.steps?.find((step) => step.name === stepName)?.run ?? "";
  }

  test("the tracker read is redirected to a file, not streamed", () => {
    const run = stepRun("tracker", "Tracker reads cleanly");
    expect(run).toContain('quest task list --json >"${out}"');
    // The old shape — the command standing alone as the whole step — is the defect itself.
    expect(run).not.toMatch(/^\s*quest task list --json\s*$/m);
  });

  test("the tracker read reports how much it read and fails on zero", () => {
    const run = stepRun("tracker", "Tracker reads cleanly");
    expect(run).toContain("jq -er");
    expect(run).toContain('"${count}" -eq 0');
    expect(run).toContain("read ${count} task record(s)");
  });

  test("a failed tracker read replays the tracker's own error text inside stop-commands", () => {
    const run = stepRun("tracker", "Tracker reads cleanly");
    expect(run).toContain("::stop-commands::");
    expect(run).toContain('exit "${status}"');
  });

  test("every quest/lore step in every workflow is guarded or explicitly redirected", () => {
    // A tripwire over every job of every workflow, not just the two jobs this change
    // touched: a future bare `quest`/`lore` read anywhere reintroduces the forgery. It is a
    // tripwire and not a proof — `env FOO=1 quest …` or an `if quest …` would evade it —
    // which is why the behavioural tests below and review carry the real weight.
    const runsQuestOrLore = /(^|&&|;|\|)\s*(quest|lore|bunx lore|bun run lore)\b/;
    const offenders: string[] = [];
    for (const file of ["ci.yml", "main-fast-forward-guard.yml", "release.yml"]) {
      const workflow = loadWorkflow(join(WORKFLOWS_DIR, file));
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const step of job?.steps ?? []) {
          const unguarded = (step.run ?? "")
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => runsQuestOrLore.test(line))
            // The guard invocation itself is the sanctioned wrapper.
            .filter((line) => !line.startsWith("scripts/ci-quiet-gate.sh "))
            // The tracker read is the one deliberate exception, and only as the WHOLE line:
            // matching the command as a substring would discard the rest of a line carrying
            // a second, bare command behind the redirect (review F4, measured).
            .filter(
              (line) => !/^quest task list --json >"\$\{out\}" 2>"\$\{out\}\.stderr" \|\| status=\$\?$/.test(line),
            );
          if (unguarded.length > 0) {
            offenders.push(`${file}/${jobId}/${step.name}: ${unguarded.join("; ")}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the sibling steps run through scripts/ci-quiet-gate.sh", () => {
    expect(stepRun("tracker", "Managed instructions are current")).toBe(
      "scripts/ci-quiet-gate.sh quest agents --check --require-installed --target claude",
    );
    expect(stepRun("docs-gate", "lore agents --check (bridge currency)")).toBe(
      "scripts/ci-quiet-gate.sh bun run lore agents --check",
    );
  });
});

describe("scripts/ci-quiet-gate.sh (LCLI-661)", () => {
  const SCRIPT = join(import.meta.dir, "..", "scripts", "ci-quiet-gate.sh");

  test("replays forged workflow commands between stop markers, and keeps the child's exit status", () => {
    const result = spawnSync(
      "bash",
      [
        SCRIPT,
        "bash",
        "-c",
        'echo "##[error]forged annotation"; echo "::warning::forged too"; echo to-stderr >&2; exit 3',
      ],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(3);
    const token = result.stdout.match(/::stop-commands::([0-9a-f]{32})/)?.[1];
    expect(token).toBeDefined();
    const open = result.stdout.indexOf(`::stop-commands::${token}`);
    const close = result.stdout.indexOf(`::${token}::`);
    expect(close).toBeGreaterThan(open);
    for (const forged of ["##[error]forged annotation", "::warning::forged too", "to-stderr"]) {
      const at = result.stdout.indexOf(forged);
      expect(at).toBeGreaterThan(open);
      expect(at).toBeLessThan(close);
    }
    // The guard's own failure line is outside the block and is its own text, not the child's.
    expect(result.stdout).toContain("::error::bash exited 3");
  });

  test("a clean run keeps status 0, keeps the output inside the markers, and raises no error annotation", () => {
    const result = spawnSync("bash", [SCRIPT, "bash", "-c", "echo all-clear"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const token = result.stdout.match(/::stop-commands::([0-9a-f]{32})/)?.[1];
    expect(token).toBeDefined();
    const open = result.stdout.indexOf(`::stop-commands::${token}`);
    const close = result.stdout.indexOf(`::${token}::`);
    const at = result.stdout.indexOf("all-clear");
    expect(at).toBeGreaterThan(open);
    expect(at).toBeLessThan(close);
    // A guard that raised a failure annotation on a clean run would be this change's own
    // defect class wearing the guard's name (review F5: measured, unpinned before this).
    expect(result.stdout).not.toContain("::error::");
  });

  test("a child whose output does not end in a newline still leaves the resume marker on its own line", () => {
    // Review F2, measured byte-level: with a bare `cat`, a stream not ending in a newline
    // glues to the marker (`no-trailing-newline::<token>::`), the runner never sees the
    // resume command, and the stop block stays open for the rest of the step — swallowing
    // any later annotation the step raises.
    const result = spawnSync("bash", [SCRIPT, "bash", "-c", 'printf "no-trailing-newline"'], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const token = result.stdout.match(/::stop-commands::([0-9a-f]{32})/)?.[1];
    expect(token).toBeDefined();
    expect(result.stdout.split("\n")).toContain(`::${token}::`);
  });

  test("two runs use different resume tokens", () => {
    const a = spawnSync("bash", [SCRIPT, "true"], { encoding: "utf8" });
    const b = spawnSync("bash", [SCRIPT, "true"], { encoding: "utf8" });
    const tokenOf = (stdout: string) => stdout.match(/::stop-commands::([0-9a-f]{32})/)?.[1];
    expect(tokenOf(a.stdout)).toBeDefined();
    expect(tokenOf(a.stdout)).not.toBe(tokenOf(b.stdout));
  });

  test("is a usage error when handed no command", () => {
    const result = spawnSync("bash", [SCRIPT], { encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});

describe("scripts a workflow invokes by path are committed executable (LCLI-661 review F1)", () => {
  // The guard was committed 100644 while every routed step invoked it by path, so CI failed
  // with "Permission denied" (exit 126) in three required contexts — while every local gate
  // stayed green, because the tests spawn `bash <script>` (which needs no exec bit) and
  // shellcheck, biome and tsc all read text. The bit is read from the GIT INDEX, not the
  // working file: the working file's mode is not what a fresh checkout materialises.
  function directlyInvokedScripts(): string[] {
    const found = new Set<string>();
    for (const file of ["ci.yml", "main-fast-forward-guard.yml", "release.yml"]) {
      const workflow = loadWorkflow(join(WORKFLOWS_DIR, file));
      for (const job of Object.values(workflow.jobs ?? {})) {
        for (const step of job?.steps ?? []) {
          for (const line of (step.run ?? "").split("\n")) {
            const match = line.trim().match(/^(?:\.\/)?(scripts\/[\w-]+\.sh)(?:\s|$)/);
            const script = match?.[1];
            if (script) found.add(script);
          }
        }
      }
    }
    return [...found].sort();
  }

  test("the walk finds the direct invocations it exists to check (positive control)", () => {
    // Without this, a walk that matched nothing would pass the suite and gate nothing.
    expect(directlyInvokedScripts()).toContain("scripts/ci-quiet-gate.sh");
  });

  test("each directly-invoked script is mode 100755 in the git index", () => {
    const repoRoot = join(import.meta.dir, "..");
    for (const script of directlyInvokedScripts()) {
      const result = spawnSync("git", ["ls-files", "-s", "--", script], { cwd: repoRoot, encoding: "utf8" });
      expect({ script, mode: result.stdout.trim().split(/\s+/)[0] }).toEqual({ script, mode: "100755" });
    }
  });
});

describe("ci.yml push paths-ignore keeps CLAUDE.md and README.md in scope (LCLI-602)", () => {
  /**
   * GitHub's path-filter semantics, from the "Filter pattern cheat sheet" in the workflow-syntax
   * reference: patterns match the WHOLE path from the repository root, `*` matches zero or more
   * characters but never `/`, and `**` matches zero or more of any character. The cheat sheet's
   * own examples fix the one subtle case — `docs/**\/*.md` matches `docs/README.md` and
   * `**\/README.md` matches `README.md` — so a `**` followed by `/` also matches ZERO directories.
   *
   * Only the subset this workflow's push filter uses is implemented. Anything else (`?`, `+`, `[]`,
   * a leading `!`) throws instead of guessing, so a future pattern that needs those semantics fails
   * this suite loudly rather than being scored by a matcher that does not implement it.
   */
  function githubPathPattern(pattern: string): RegExp {
    if (/[?+[\]]/.test(pattern) || pattern.startsWith("!")) {
      throw new Error(`pattern ${JSON.stringify(pattern)} uses filter syntax this matcher does not implement`);
    }
    let source = "";
    for (let i = 0; i < pattern.length; ) {
      if (pattern.startsWith("**/", i)) {
        source += "(?:.*/)?";
        i += 3;
      } else if (pattern.startsWith("**", i)) {
        source += ".*";
        i += 2;
      } else if (pattern[i] === "*") {
        source += "[^/]*";
        i += 1;
      } else {
        source += (pattern[i] as string).replace(/[.^$|(){}\\/]/g, "\\$&");
        i += 1;
      }
    }
    return new RegExp(`^${source}$`);
  }

  function ignoredBy(patterns: readonly string[], path: string): boolean {
    return patterns.some((pattern) => githubPathPattern(pattern).test(path));
  }

  function pushPathsIgnore(): string[] {
    const patterns = loadWorkflow().on.push?.["paths-ignore"];
    if (!patterns) throw new Error("ci.yml's push trigger has no paths-ignore list");
    return patterns;
  }

  // The list this task replaced, kept as the "before" half of the measurement so the suite
  // states what changed and not only what is true now.
  const BEFORE = ["**/*.md", "docs/**", "backlog/**", ".claude/**"];

  test("the matcher reproduces the cheat sheet's own documented examples (positive control)", () => {
    // Every row is taken from GitHub's cheat sheet. If the matcher disagreed with any of them,
    // the assertions below would be measuring a different glob dialect from GitHub's.
    const documented: Array<[string, string, boolean]> = [
      ["*", "README.md", true],
      ["*", "docs/README.md", false],
      ["*.js", "app.js", true],
      ["*.js", "src/app.js", false],
      ["**.js", "index.js", true],
      ["**.js", "src/js/app.js", true],
      ["docs/*", "docs/README.md", true],
      ["docs/*", "docs/mona/octocat.txt", false],
      ["docs/**", "docs/mona/octocat.txt", true],
      ["docs/**/*.md", "docs/README.md", true],
      ["docs/**/*.md", "docs/a/markdown/file.md", true],
      ["**/docs/**", "space/docs/plan/space.doc", true],
      ["**/README.md", "README.md", true],
      ["**/README.md", "js/README.md", true],
      ["**/*-post.md", "my-post.md", true],
      ["**/*-post.md", "path/their-post.md", true],
      ["**/migrate-*.sql", "db/sept/migrate-v1.sql", true],
    ];
    for (const [pattern, path, expected] of documented) {
      expect([pattern, path, githubPathPattern(pattern).test(path)]).toEqual([pattern, path, expected]);
    }
  });

  test("a push touching only CLAUDE.md or README.md is not filtered out", () => {
    const patterns = pushPathsIgnore();
    // Tracker integrity, the docs gate and compile smoke all read CLAUDE.md's declared Quest
    // version; compile smoke runs README.md's quickstart.
    expect(ignoredBy(patterns, "CLAUDE.md")).toBe(false);
    expect(ignoredBy(patterns, "README.md")).toBe(false);
    // The defect this replaces, measured with the same matcher: both used to be ignored.
    expect(ignoredBy(BEFORE, "CLAUDE.md")).toBe(true);
    expect(ignoredBy(BEFORE, "README.md")).toBe(true);
  });

  test("every other path the old filter ignored is still ignored", () => {
    const patterns = pushPathsIgnore();
    for (const path of [
      "docs/x.md",
      "docs/reference/cli-contract.md",
      "docs/assets/diagram.svg",
      "backlog/tasks/task-1.md",
      ".claude/settings.json",
      "skills/lore/SKILL.md",
      "test/fixtures/nested/page.md",
      "CHANGELOG.md",
      "CODE_OF_CONDUCT.md",
      "CONTRIBUTING.md",
      "DEVELOPMENT.md",
      "ECK-ALIGNMENT.md",
      "SECURITY.md",
      "lore-spec.md",
    ]) {
      expect([path, ignoredBy(BEFORE, path)]).toEqual([path, true]);
      expect([path, ignoredBy(patterns, path)]).toEqual([path, true]);
    }
    // Code was never ignored and still is not.
    for (const path of ["src/cli.ts", "package.json", "scripts/readme-quickstart.sh", "test/ci-workflow.test.ts"]) {
      expect([path, ignoredBy(patterns, path)]).toEqual([path, false]);
    }
  });

  test("the push filter's pattern list is exactly the reviewed one", () => {
    // Pinned whole, so a widened list is a visible diff here. Root Markdown is listed by name: a
    // NEW root .md is deliberately not ignored until someone adds it, which errs toward running CI
    // rather than toward skipping it. `docs/**` stays: OPAG-444 ruled it cost control (LCLI-605).
    expect(pushPathsIgnore()).toEqual([
      "*/**/*.md",
      "CHANGELOG.md",
      "CODE_OF_CONDUCT.md",
      "CONTRIBUTING.md",
      "DEVELOPMENT.md",
      "ECK-ALIGNMENT.md",
      "SECURITY.md",
      "lore-spec.md",
      "docs/**",
      "backlog/**",
      ".claude/**",
    ]);
    expect(loadWorkflow().on.push?.branches).toEqual(["main"]);
  });

  test("the pull_request trigger stays unfiltered", () => {
    // A path-filtered PR run leaves required contexts pending forever (see ci.yml's comment).
    // Under JSON_SCHEMA a bare `pull_request:` key loads as "", not null; either way it carries
    // no filter keys, which is the property that matters.
    const trigger = loadWorkflow().on.pull_request;
    const keys = trigger !== null && typeof trigger === "object" ? Object.keys(trigger) : [];
    expect(keys.filter((key) => key.startsWith("paths") || key.startsWith("branches"))).toEqual([]);
  });
});

describe("the main fast-forward guard has its own unfiltered workflow (LCLI-605)", () => {
  // opum-doc's ADR "Keep push path filters off main-guard, release, publish and federation jobs":
  // a path filter applies to a WHOLE workflow, so a job that runs only on the push to main must
  // live where no filter can reach it. In ci.yml, a Markdown-only push to main skipped it.

  /** Every trigger's path-filter keys, across every event the workflow declares. */
  function pathFilterKeys(doc: WorkflowDoc): string[] {
    return Object.entries(doc.on).flatMap(([event, trigger]) =>
      trigger !== null && typeof trigger === "object"
        ? Object.keys(trigger)
            .filter((key) => key === "paths" || key === "paths-ignore")
            .map((key) => `${event}.${key}`)
        : [],
    );
  }

  test("the guard workflow carries no path filter and fires on push to main, and nothing else", () => {
    const guard = loadWorkflow(GUARD_WORKFLOW_PATH);
    expect(pathFilterKeys(guard)).toEqual([]);
    expect(Object.keys(guard.on)).toEqual(["push"]);
    expect(Object.keys(guard.on.push ?? {})).toEqual(["branches"]);
    expect(guard.on.push?.branches).toEqual(["main"]);
  });

  test("the job keeps its key and its exact rendered name, with no condition that could skip it", () => {
    const job = loadWorkflow(GUARD_WORKFLOW_PATH).jobs["main-is-fast-forward-of-dev"] as WorkflowJob & {
      name?: string;
    };
    expect(job?.name).toBe("main is fast-forward of dev");
    expect(job?.if).toBeUndefined();
    expect(job?.needs).toBeUndefined();
    // A guard that cannot fail the run, or that a later push can cancel, guards nothing.
    expect((job as { "continue-on-error"?: unknown })["continue-on-error"]).toBeUndefined();
    const concurrency = (loadWorkflow(GUARD_WORKFLOW_PATH) as { concurrency?: Record<string, unknown> }).concurrency;
    expect(concurrency?.["cancel-in-progress"]).toBe(false);
    expect(String(concurrency?.group)).toContain("github.run_id");
  });

  test("ci.yml no longer carries the guard, while its own push filter still ignores docs and skills Markdown", () => {
    const ci = loadWorkflow();
    expect(Object.keys(ci.jobs)).not.toContain("main-is-fast-forward-of-dev");
    // skills/ holds Markdown only, which `*/**/*.md` already covers; docs/** is listed outright.
    expect(ci.on.push?.["paths-ignore"]).toContain("docs/**");
    expect(ci.on.push?.["paths-ignore"]).toContain("*/**/*.md");
  });

  test("ci.yml is the only path-filtered workflow, so a new filtered one is a visible diff (audit)", () => {
    // Audited 2026-09-26: release.yml is workflow_dispatch only and upstream-backlog-watch.yml is
    // schedule + workflow_dispatch, neither filtered. A new workflow with a path filter has to be
    // added here, which is the moment to ask whether it holds a push-only, release, publish or
    // federation job.
    const filtered = readdirSync(WORKFLOWS_DIR)
      .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
      .sort()
      .filter((file) => pathFilterKeys(loadWorkflow(join(WORKFLOWS_DIR, file))).length > 0);
    expect(filtered).toEqual(["ci.yml"]);
  });
});
