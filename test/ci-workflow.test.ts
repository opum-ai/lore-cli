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
  jobs: Record<string, WorkflowJob>;
}

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
    expect(testScript).toContain("timeout --kill-after=10s 6m bun test --isolate --max-concurrency=1 --timeout=10000");
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
    // cannot be silently gutted back to that state.
    const job = loadWorkflow().jobs["docs-gate"];
    expect(job?.steps?.find((step) => step.name === "lore check")?.run).toBe("bun run lore check");
  });

  test("the docs gate installs the Quest CLI, which `lore check` cannot run without", () => {
    // Not a convenience: this repository's tracker backend is quest, so reconciliation
    // shells out to the quest binary. With it off PATH, `lore check` exits 3. A job that
    // dropped this step would fail for a reason that has nothing to do with the docs.
    const job = loadWorkflow().jobs["docs-gate"];
    const steps = job?.steps ?? [];
    expect(steps.some((step) => (step.run ?? "").includes('npm install -g "@opum-ai/quest@'))).toBe(true);
    // Derived from CLAUDE.md's managed block rather than pinned a second time here —
    // the same rule the tracker job states, and the reason the two must stay in step.
    expect(steps.some((step) => (step.run ?? "").includes("Quest CLI \\([0-9][0-9.]*\\)"))).toBe(true);
  });

  test("compile smoke runs the README quickstart against the binary it just built", () => {
    // LCLI-571: the quickstart ships in the npm tarball and sat broken through three
    // releases because nothing ran it. The script needs the quest binary, so assert both.
    const steps = loadWorkflow().jobs["build"]?.steps ?? [];
    expect(steps.some((step) => step.run === "scripts/readme-quickstart.sh dist/lore")).toBe(true);
    expect(steps.some((step) => (step.run ?? "").includes('npm install -g "@opum-ai/quest@'))).toBe(true);
  });

  test("the docs gate never depends on another job, so a required context cannot go absent", () => {
    // A `needs:` would make this context SKIP when its dependency fails, and a skipped
    // context is absent rather than green — which blocks dev until an admin notices.
    // Same trap as an `if:` that evaluates false, reached through a dependency instead.
    expect(loadWorkflow().jobs["docs-gate"]?.needs).toBeUndefined();
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
    // rather than toward skipping it. `docs/**` is unchanged; its future is OPAG-444's call.
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
