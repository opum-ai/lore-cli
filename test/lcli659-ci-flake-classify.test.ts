/**
 * LCLI-659: the Linux epoll race's THIRD presentation, and the classifier that recognises it.
 *
 * The race (LCLI-507) was guarded on two signals -- the `EEXIST ... epoll_ctl` line, or a run
 * killed by the `timeout --kill-after=10s 6m` wrapper with exit 124. On 2026-09-30 five
 * consecutive runs of opum-ai/lore-cli#446 failed without either signal: the race hung a few
 * tests, each died at its own per-test budget, and the suite COMPLETED with those as failures.
 * `scripts/ci-flake-classify.sh` is the recognition step for that shape, and these tests drive
 * it as a program -- fabricating logs and reading its exit status -- rather than asserting that
 * ci.yml contains a particular string.
 *
 * The rule the tests pin is the ruling's, not an implementation detail: retryable only when
 * EVERY failing test's recorded duration is at or above the per-test budget. One sub-budget
 * failure makes the run fatal even when other failures are hangs, because an assertion failure
 * is a product signal a retry must not paper over.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "ci-flake-classify.sh");
const CI_PATH = join(import.meta.dir, "..", ".github", "workflows", "ci.yml");
const BUDGET_MS = 10_000;

/** Runs the classifier over a fabricated log and returns its exit status and stdout. */
function classify(logContents: string, budget = BUDGET_MS): { status: number; stdout: string } {
  const dir = mkdtempSync(join(tmpdir(), "lcli-659-classify-"));
  try {
    const logPath = join(dir, "lore-bun-test.log");
    writeFileSync(logPath, logContents);
    const result = spawnSync("bash", [SCRIPT, logPath, String(budget)], { encoding: "utf8" });
    if (result.error) throw result.error;
    return { status: result.status ?? -1, stdout: result.stdout };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const hang = (name: string, ms = 10_000.17) => `(fail) ${name} [${ms}ms]\n`;
const assertion = (name: string, ms = 12.34) => `(fail) ${name} [${ms}ms]\n`;

describe("LCLI-659 CI flake classifier", () => {
  test("retryable when EVERY failure hung at the per-test budget, and it names them", () => {
    const result = classify(hang("A4 registry read-back") + hang("shell-guard as a PreToolUse hook", 10_000.22));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("A4 registry read-back");
    expect(result.stdout).toContain("shell-guard as a PreToolUse hook");
  });

  test("FATAL on an assertion failure alone -- a product signal is never retried", () => {
    const result = classify(assertion("a product test > a real assertion"));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  test("FATAL when a hang is mixed with an assertion failure, even though a hang is present", () => {
    // The case the ruling singles out: one bad assertion makes the whole run fatal rather than
    // letting the hang alongside it carry the run into a retry.
    const result = classify(hang("hanging test > never returns") + assertion("product test > a real assertion"));
    expect(result.status).toBe(1);
  });

  test("FATAL when the run failed but the log records no failing test at all", () => {
    // A non-zero status with nothing to classify must not be treated as a hang: the classifier
    // is what authorises a retry, and "no evidence" is not evidence of the race.
    const result = classify("(pass) everything is fine [1.00ms]\n");
    expect(result.status).toBe(1);
  });

  test("a test that finishes just UNDER the budget is a failure, not a hang", () => {
    expect(classify(assertion("slow but finished", 9_999)).status).toBe(1);
    expect(classify(hang("exactly at the budget", 10_000)).status).toBe(0);
  });

  test("a duration-looking bracket in a test's NAME is not the recorded duration", () => {
    // Review F1. The parse must take the LAST bracket: a genuine assertion failure whose name
    // contains a bracket at or above the budget would otherwise be scored as a hang -- the wrong
    // direction, since it is exactly the failure this rule exists to keep fatal. The mutant that
    // reads the first bracket again reddens this case and nothing else.
    const result = classify(assertion("reads the [10000ms] budget marker"));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  test("a CRLF log takes the same path, so a carriage return is not a missed retry", () => {
    // Review F2: the tolerance was correct but unpinned, and an end-anchored mutant that ignores
    // the trailing CR flips this from retryable to fatal with every other case still green.
    const result = classify(hang("one") + hang("two").replace(/\n/g, "\r\n"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("one");
    expect(result.stdout).toContain("two");
  });

  test("each hung test is NAMED once, though bun prints every failure twice", () => {
    // Bun reports a failure inline and again in its summary. The counts stay as they are -- the
    // equality the verdict rests on is scale-invariant -- but the list a human reads should not
    // repeat itself.
    const twice = hang("duplicated failure");
    const result = classify(twice + twice);
    expect(result.status).toBe(0);
    expect(result.stdout.split("\n").filter((line) => line.includes("duplicated failure")).length).toBe(1);
  });

  test("it refuses a missing log or a non-numeric budget rather than guessing", () => {
    const dir = mkdtempSync(join(tmpdir(), "lcli-659-usage-"));
    try {
      const missing = spawnSync("bash", [SCRIPT, join(dir, "nope.log"), String(BUDGET_MS)], { encoding: "utf8" });
      expect(missing.status).toBe(2);
      const logPath = join(dir, "log");
      writeFileSync(logPath, hang("x"));
      const badBudget = spawnSync("bash", [SCRIPT, logPath, "ten"], { encoding: "utf8" });
      expect(badBudget.status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the real 2026-09-30 failing run classifies as retryable", () => {
    // The five red attempts' logs consisted solely of failures at the per-test budget; this is
    // that shape transcribed from the run, so a future narrowing of the classifier has to face
    // the evidence that motivated it.
    const real =
      hang("A4 registry read-back > the checker unable to read its input: NOT-CONFIRMED, 'nothing was verified'") +
      hang(
        "release.yml's publish step stages seven of eight tarballs (LCLI-621) > positive control: six platforms at X",
        10_002.4,
      ) +
      hang("shell-guard as a PreToolUse hook > exits 2 with the rule on stderr for a refused Bash command", 10_000.22);
    expect(classify(real).status).toBe(0);
  });

  test("ci.yml actually calls the classifier, with the same budget it runs the suite with", () => {
    const testScript = readFileSync(CI_PATH, "utf8");
    // Assembled rather than written as one literal, the idiom this repository already uses for
    // shell substitutions in assertions (see ci-workflow.test.ts's retry-condition checks).
    expect(testScript).toContain('bash scripts/ci-flake-classify.sh "$' + '{lore_bun_log}" "$' + '{lore_per_test_ms}"');
    expect(testScript).toContain("lore_per_test_ms=10000");
    // The retry count stays at ONE: a test that hangs every time must still fail the job.
    expect(testScript.match(/timeout --kill-after=10s 6m bun test --isolate/g)?.length).toBe(2);
    // A retry-green must be legible as one, in the log, rather than looking like a clean run.
    expect(testScript).toContain("RETRY-GREEN");
  });
});
