/**
 * lcli634-release-window-preflight.test.ts — the release path refuses a malformed
 * REGISTRY_WINDOW_SECONDS or PROVENANCE_WAIT_SECONDS BEFORE its first publish, and in a
 * `publish: false` rehearsal, and scripts/release-provenance.mjs refuses its own `--wait-seconds`
 * by the same grammar rather than parseInt (LCLI-634).
 *
 * WHY THE BLOCKS ARE EXECUTED AND NOT ONLY PARSED. LCLI-630 shipped a guard whose logic was right,
 * whose literal was pinned, and which still could not fail a release before it published: its
 * PLACEMENT was the defect. The same shape is available here in two forms that every static
 * assertion would pass — a step wired into the wrong job's `needs:`, and a helper that is defined
 * and never called. So both `run:` blocks are written to a file and run as `bash -e <file>`, which
 * is how GitHub runs a Linux step with no `shell:` key, and every refusal is observed as an exit
 * code and a log line.
 *
 * WHAT A GREEN HERE IS NOT. bun:test has no GitHub Actions runner. Nothing here proves the runner
 * starts the `release-window` job, honours `needs:`, or resolves `vars.*` the way this file assumes;
 * the static pins below read the same bytes the runner would, and that is the most a test without a
 * runner can honestly claim. What IS proven is that those bytes refuse the named values, name the
 * variable, escape the value onto one line, and sit ahead of the first publish step — plus that the
 * grammar they refuse by is the shared one, byte for byte.
 *
 * The value table, the `printf %q` expectations and the one-line rule are the ones
 * test/lcli630-release-window-guard.test.ts already established for the same grammar.
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import * as yaml from "js-yaml";
import { REGISTRY_WINDOW } from "../scripts/promote-latest.mjs";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");
const SCRIPT_PATH = join(import.meta.dir, "..", "scripts", "release-provenance.mjs");

/** Every place this task touched, by the names a reader sees. */
const JOB = "release-window";
const JOB_STEP = "Refuse a malformed REGISTRY_WINDOW_SECONDS or PROVENANCE_WAIT_SECONDS (LCLI-634)";
const PUBLISH_STEP = "Refuse a malformed window before the first publish (LCLI-634)";
/** The LCLI-630 step that must stay, and whose `env:` is the expression the check must match. */
const WAIT_STEP = "Verify the registry serves what was published (LCLI-460)";
/** The variable names as strings, so nothing here types them twice with different case. */
const REGISTRY_VAR = "REGISTRY_WINDOW_SECONDS";
const PROVENANCE_VAR = "PROVENANCE_WAIT_SECONDS";

interface Step {
  name?: string;
  if?: string;
  uses?: string;
  env?: Record<string, string>;
  run?: string;
}
interface Job {
  if?: string;
  needs?: string[] | string;
  environment?: string;
  steps?: Step[];
}
interface Workflow {
  jobs: Record<string, Job>;
  defaults?: unknown;
}

function loadWorkflow(): Workflow {
  return yaml.load(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;
}

/** The one step with this name in this job. Two would make every assertion below ambiguous. */
function step(job: string, name: string): Step {
  const matches = (loadWorkflow().jobs[job]?.steps ?? []).filter((s) => s.name === name);
  expect(matches).toHaveLength(1);
  return matches[0] as Step;
}

const jobStep = () => step(JOB, JOB_STEP);
const publishStep = () => step("publish", PUBLISH_STEP);

/** A refusal line's fixed prefix: the variable name, then the grammar, then the escaped value. */
const refusalPrefix = (name: string) =>
  `::error::${name} must be a whole number of seconds (0 to 999999999, no leading zero); got `;

describe("release.yml: the new refusal is wired where it can act (LCLI-634)", () => {
  test("the release-window job runs on every dispatch, publish:false rehearsals included", () => {
    const doc = loadWorkflow();
    const job = doc.jobs[JOB];
    expect(job).toBeDefined();
    // No `if:` at all, so a rehearsal runs it. The version-parity job above is the precedent.
    expect(job?.if).toBeUndefined();
    // And nothing about it may depend on the publish job, which a rehearsal skips.
    expect([job?.needs ?? []].flat()).not.toContain("publish");
  });

  test("the publish job cannot start without it", () => {
    const doc = loadWorkflow();
    expect([doc.jobs.publish?.needs ?? []].flat()).toContain(JOB);
  });

  test("the job is NOT tied to the `release` environment, so a rehearsal cannot wait on a reviewer", () => {
    // A job sees a release-environment variable only by declaring `environment:`, and that
    // declaration puts the job behind the environment's required reviewer (measured 2026-09-28:
    // one `required_reviewers` rule on `release`). Declaring it here would make every publish:false
    // rehearsal wait for a human before a check could run -- which is why this check covers the
    // repository and organisation scopes and the publish job covers the environment's own. This
    // pins a decision, not an accident: re-adding the key would have to face this test.
    expect(loadWorkflow().jobs[JOB]?.environment).toBeUndefined();
    // The publish job's own pre-publish step is where the environment-resolved value is refused.
    expect(loadWorkflow().jobs.publish?.environment).toBe("release");
  });

  test("the publish job's own refusal runs before the first publish in that job", () => {
    const steps = loadWorkflow().jobs.publish?.steps ?? [];
    const publishIndex = steps.findIndex((s) => (s.run ?? "").includes("npm publish"));
    // Positive control: the step found must BE the publish step, not a comment that mentions it.
    expect(publishIndex).toBeGreaterThan(-1);
    expect(steps[publishIndex]?.run ?? "").toContain("--tag release-candidate");
    const refuseIndex = steps.findIndex((s) => s.name === PUBLISH_STEP);
    expect(refuseIndex).toBeGreaterThan(-1);
    expect(refuseIndex).toBeLessThan(publishIndex);
  });

  test("both new checks read the same expression as the step that consumes the value", () => {
    // A check is only worth its green if it refuses the value the READER would use. Compared
    // expression to expression, so a reader's default moving (say 1800 -> 900) without the check
    // moving fails here rather than silently checking a different number.
    const doc = loadWorkflow();
    const waitEnv = (doc.jobs.publish?.steps ?? []).find((s) => s.name === WAIT_STEP)?.env;
    const provenanceEnv = (doc.jobs["provenance-post"]?.steps ?? []).find((s) =>
      (s.run ?? "").startsWith("node scripts/release-provenance.mjs --post"),
    )?.env;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml.
    const registryExpr = "${{ vars.REGISTRY_WINDOW_SECONDS || 1800 }}";
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml.
    const provenanceExpr = "${{ vars.PROVENANCE_WAIT_SECONDS || 180 }}";
    expect(waitEnv?.[REGISTRY_VAR]).toBe(registryExpr);
    expect(provenanceEnv?.[PROVENANCE_VAR]).toBe(provenanceExpr);
    expect(jobStep().env?.[REGISTRY_VAR]).toBe(registryExpr);
    expect(jobStep().env?.[PROVENANCE_VAR]).toBe(provenanceExpr);
    expect(publishStep().env?.[REGISTRY_VAR]).toBe(registryExpr);
  });

  test("the always-run job CALLS its refusal for both variables", () => {
    // A helper that is defined and never called refuses nothing, which is the LCLI-630 shape in
    // its second form. Matched as a call, on a line of its own, not as prose in the comment above.
    const run = jobStep().run ?? "";
    for (const name of [REGISTRY_VAR, PROVENANCE_VAR]) {
      expect(run).toContain(`refuse_unless_whole_seconds ${name} "$${name}"`);
    }
  });

  test("the publish job's block refuses its own window only", () => {
    // Deliberate, and it is a scope decision rather than an omission: the publish job is not
    // PROVENANCE_WAIT_SECONDS's reader, and its reader (provenance-post) declares no environment,
    // so a release-environment value for it is never read at all -- refusing one here would be a
    // red X for a value that changes nothing.
    expect(publishStep().run ?? "").not.toContain(PROVENANCE_VAR);
  });

  test("one grammar: every window_re literal in release.yml is REGISTRY_WINDOW's source", () => {
    const text = readFileSync(WORKFLOW_PATH, "utf8");
    // Indented in the file (a block scalar), unindented once parsed, so the scan allows leading
    // whitespace and the per-block assertions below use the parsed text and do not.
    const literals = [...text.matchAll(/^[ \t]*window_re='([^']*)'[ \t]*$/gm)].map((m) => m[1]);
    // Positive control: the LCLI-630 wait step, the new job and the publish job are three sites.
    // A pattern that stopped matching would otherwise pass this test vacuously.
    expect(literals.length).toBeGreaterThanOrEqual(3);
    for (const literal of literals) expect(literal).toBe(REGISTRY_WINDOW.source);
    for (const block of [jobStep().run ?? "", publishStep().run ?? ""]) {
      expect([...block.matchAll(/^window_re='([^']*)'$/gm)].map((m) => m[1])).toEqual([REGISTRY_WINDOW.source]);
    }
  });

  test("the LCLI-630 refusal nearest the publish is still there (defence in depth)", () => {
    const wait = (loadWorkflow().jobs.publish?.steps ?? []).find((s) => s.name === WAIT_STEP);
    expect(wait).toBeDefined();
    expect(wait?.run ?? "").toContain(`if ! [[ $${REGISTRY_VAR} =~ $window_re ]]; then`);
  });
});

// The real blocks, run. `npm` is a stub on PATH that logs its argv, so "no publish was attempted"
// is a recorded fact rather than an assumption; a positive control below proves it records.
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

interface RunResult {
  code: number;
  out: string;
  npm: string[];
  ran: boolean;
}

/** Run a `run:` block as `bash -e <file>`, with the env GitHub would hand it. */
function runBlock(run: string, env: Record<string, string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), "lcli634-"));
  try {
    const bin = join(root, "bin");
    mkdirSync(bin);
    const npmLog = join(root, "npm.log");
    writeFileSync(npmLog, "");
    writeFileSync(join(bin, "npm"), `#!/usr/bin/env bash\necho "$*" >> "${npmLog}"\n`);
    chmodSync(join(bin, "npm"), 0o755);
    const script = join(root, "step.sh");
    writeFileSync(script, run);
    const marker = join(root, "MARKER-RAN");
    const result = Bun.spawnSync({
      cmd: ["bash", "-e", script],
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v.replace("MARKER", marker)])),
      },
      timeout: 20_000,
    });
    return {
      code: result.exitCode,
      out: result.stdout.toString() + result.stderr.toString(),
      npm: readFileSync(npmLog, "utf8").split("\n").filter(Boolean),
      ran: existsSync(marker),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * [value as set, how `printf %q` shows it after the workflow-command escape of `%`].
 *
 * The four the task names first (30m, 08, 1e3, abc), then the boundaries and the annotation
 * hazards: `-5` and a ten-digit value are outside the grammar, and an interior LF, CR or `%0A`
 * would end the `::error::` line and print the rest of the value as a second workflow command.
 */
const MALFORMED: [string, string][] = [
  ["30m", "30m"],
  ["08", "08"],
  ["1e3", "1e3"],
  ["abc", "abc"],
  ["", "''"],
  ["-5", "-5"],
  [" 3", "\\ 3"],
  ["1234567890", "1234567890"],
  ["5\n", "$'5\\n'"],
  ["a\rb", "$'a\\rb'"],
  ["5%0A::warning::x", "5%250A::warning::x"],
];

/** Values the grammar accepts, at its boundaries and in between. */
const WELL_FORMED = ["0", "1", "180", "1800", "999999999"];

describeOnPosix("release.yml's pre-publish window refusal, executed (LCLI-634)", () => {
  test("CONTROL: the stub npm records an invocation, so 'no publish happened' is evidence", () => {
    const r = runBlock("npm view @opum-ai/lore version\n", {});
    expect(r.code).toBe(0);
    expect(r.npm).toEqual(["view @opum-ai/lore version"]);
  });

  describe(`the always-run job refuses both variables (${JOB})`, () => {
    for (const name of [REGISTRY_VAR, PROVENANCE_VAR]) {
      for (const [value, shown] of MALFORMED) {
        test(`${JSON.stringify(value)} as ${name} is refused, named and shown escaped`, () => {
          const env = { [REGISTRY_VAR]: "1800", [PROVENANCE_VAR]: "180", [name]: value };
          const r = runBlock(jobStep().run ?? "", env);
          expect(r.code).toBe(2);
          // One line: the runner reads the log line by line, so a second line is a second command.
          const lines = r.out.split(/\r\n|\r|\n/).filter(Boolean);
          expect(lines).toHaveLength(1);
          expect(lines[0]).toStartWith(refusalPrefix(name));
          expect(lines[0]).toContain(`got ${shown}.`);
          expect(r.ran).toBe(false);
          expect(r.npm).toEqual([]);
        });
      }
    }

    test("a value bash arithmetic would evaluate never reaches one", () => {
      // Unguarded, a value like this is an expression whose subscript runs a command -- in the
      // family of blocks that hold id-token: write. Neither block evaluates the value at all.
      const r = runBlock(jobStep().run ?? "", {
        [REGISTRY_VAR]: "x[$(touch MARKER)]",
        [PROVENANCE_VAR]: "180",
      });
      expect(r.code).toBe(2);
      expect(r.out).toStartWith(refusalPrefix(REGISTRY_VAR));
      expect(r.ran).toBe(false);
    });

    test("when BOTH are malformed the window is named first, and only it is reported", () => {
      const r = runBlock(jobStep().run ?? "", { [REGISTRY_VAR]: "30m", [PROVENANCE_VAR]: "abc" });
      expect(r.code).toBe(2);
      const lines = r.out.split(/\r\n|\r|\n/).filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toStartWith(refusalPrefix(REGISTRY_VAR));
    });

    for (const value of WELL_FORMED) {
      test(`${value} as either variable is accepted, and the step does nothing`, () => {
        for (const name of [REGISTRY_VAR, PROVENANCE_VAR]) {
          const env = { [REGISTRY_VAR]: "1800", [PROVENANCE_VAR]: "180", [name]: value };
          const r = runBlock(jobStep().run ?? "", env);
          expect(r.code).toBe(0);
          expect(r.out).toBe("");
          expect(r.npm).toEqual([]);
        }
      });
    }
  });

  describe("the publish job's own pre-publish refusal", () => {
    for (const [value, shown] of MALFORMED) {
      test(`${JSON.stringify(value)} is refused before anything in the job runs`, () => {
        const r = runBlock(publishStep().run ?? "", { [REGISTRY_VAR]: value });
        expect(r.code).toBe(2);
        const lines = r.out.split(/\r\n|\r|\n/).filter(Boolean);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toStartWith(refusalPrefix(REGISTRY_VAR));
        expect(lines[0]).toContain(`got ${shown}.`);
        // The job's later steps are where a publish would happen; this refutes the loop ever being
        // reached from a malformed value, which is the whole point of the step.
        expect(r.npm).toEqual([]);
        expect(r.ran).toBe(false);
      });
    }

    for (const value of WELL_FORMED) {
      test(`${value} is accepted, and the step refuses nothing`, () => {
        const r = runBlock(publishStep().run ?? "", { [REGISTRY_VAR]: value });
        expect(r.code).toBe(0);
        expect(r.out).toBe("");
        expect(r.npm).toEqual([]);
      });
    }
  });
});

// ── scripts/release-provenance.mjs: the fifth reader, by the same grammar (LCLI-634) ─────────────
//
// The script cannot be imported here: its last statement is `await main()`, so importing it would
// run the gate against the real registry inside the test process. It is therefore read as text for
// the pin and spawned as a command for the refusals -- the arrangement test/publish-release-script
// .test.ts already uses for the same reason.
describe("scripts/release-provenance.mjs: --wait-seconds uses the grammar, not parseInt (LCLI-634)", () => {
  test("one grammar: the script's WAIT_SECONDS_GRAMMAR is REGISTRY_WINDOW's source, byte for byte", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");
    const literals = [...source.matchAll(/^const WAIT_SECONDS_GRAMMAR = \/([^/]*)\/;$/gm)].map((m) => m[1]);
    expect(literals).toEqual([REGISTRY_WINDOW.source]);
  });

  test("the grammar, not parseInt: a prefix is no longer read as a value", () => {
    // The four the task names. Under parseInt each of the first three was a DIFFERENT silent
    // window (30, 8 and 1), and only `abc` threw -- from the job that runs after the publish.
    const source = readFileSync(SCRIPT_PATH, "utf8");
    expect(source).not.toContain("options.waitSeconds = Number.parseInt(");
  });

  async function runScript(args: string[]): Promise<{ code: number; out: string }> {
    const proc = Bun.spawn(["node", SCRIPT_PATH, ...args], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, out: out + err };
  }

  /** `renderRefusedValue` is JSON.stringify, so the refusals quote the value they rejected. */
  for (const value of ["30m", "08", "1e3", "abc", "180\n", "1e3::error::forged"]) {
    test(`--wait-seconds ${JSON.stringify(value)} is refused before any request, and shown escaped`, async () => {
      const r = await runScript(["--post", "--launcher-rc", "1", "--wait-seconds", value]);
      expect(r.code).toBe(2);
      const lines = r.out.split(/\r\n|\r|\n/).filter(Boolean);
      // The refusal, then the usage line. Nothing was fetched: no report line, no annotation.
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain(
        `--wait-seconds must be a whole number of seconds (0 to 999999999, no leading zero); got ${JSON.stringify(value)}`,
      );
      expect(lines[1]).toStartWith("usage: node scripts/release-provenance.mjs");
      // The forged text stays INSIDE the refusal line, JSON-escaped, so no line the runner reads
      // begins as the command the value tried to become.
      expect(lines.some((line) => line.startsWith("::error::forged"))).toBe(false);
    });
  }

  test("CONTROL: a value the grammar accepts is parsed, and the next argument's error is reached", async () => {
    // Acceptance is also proven end to end by the existing suite: test/release-provenance.test.ts
    // runs the real gate with --wait-seconds 30 and 1 against its stub registry and exits 0. This
    // run stays offline and only shows the argument was ACCEPTED: the error names --limit, so
    // parseArgs moved past --wait-seconds instead of refusing it.
    const r = await runScript(["--post", "--launcher-rc", "1", "--wait-seconds", "180", "--limit", "0"]);
    expect(r.code).toBe(2);
    expect(r.out).toContain("--limit needs a positive integer");
    expect(r.out).not.toContain("--wait-seconds must be");
  });
});
