import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Covers scripts/assert-main-fast-forward.sh — the promotion guard for `main` (LCLI-514).
//
// WHY THIS SUITE EXISTS. The guard was inline workflow shell, fired only on a real push to `main`,
// and had therefore never had a test. It asserted CONTAINMENT (main's new HEAD is a commit dev
// already held) while being NAMED for FAST-FORWARDNESS (main only moved forward). A rewind of main
// to an older commit still on dev satisfies the first and violates the second, so the guard
// reported a genuine fast-forward while commits came off main.
//
// Both halves of "prove it rejects AND prove it accepts" were already satisfied by the old job —
// genuine promotion green, merge button red — so neither half could have found this. Every test
// below therefore states which of the two assertions it is exercising, so a future collapse of the
// pair back into one check fails loudly rather than quietly re-opening the blind spot.

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "assert-main-fast-forward.sh");
// The guard's own workflow since LCLI-605: ci.yml's push path filter used to skip it on a Markdown-only push.
const GUARD_YML = resolve(import.meta.dir, "..", ".github", "workflows", "main-fast-forward-guard.yml");
const ZERO = "0".repeat(40);

// The script shells out to git and uses `mktemp`-style POSIX layout; the job runs on ubuntu.
const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

/**
 * A repository with dev = c1..c4 and a `main` that can be moved anywhere. Returns the four SHAs so
 * a test can name the exact commit it is promoting to or rewinding to — the state is asserted
 * before any verdict is read, because a proof that a guard measured the wrong object is worthless
 * if the object was never built.
 */
function makeRepo() {
  const root = mkdtempSync(resolve(tmpdir(), "lore-ff-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "--initial-branch", "dev");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  const shas: string[] = [];
  for (let i = 1; i <= 4; i += 1) {
    execFileSync("bash", ["-c", `echo ${i} > f && git add f && git commit -qm c${i}`], { cwd: root });
    shas.push(git("rev-parse", "HEAD"));
  }
  // `origin/dev` is what the guard reads; a local ref standing in for it keeps the test offline.
  git("update-ref", "refs/remotes/origin/dev", shas[3] as string);
  // A tuple, not string[]: every test indexes these by position, and under
  // noUncheckedIndexedAccess a bare array makes each one `string | undefined`.
  return { root, git, c: shas as [string, string, string, string] };
}

function run(root: string, env: Record<string, string>) {
  const r = spawnSync("bash", [SCRIPT], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DEV_REF: "origin/dev", ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describeOnPosix("main-fast-forward guard", () => {
  test("ACCEPTS a genuine promotion — dev's tip fast-forwarded onto main", () => {
    const { root, c } = makeRepo();
    const r = run(root, { BEFORE: c[1], AFTER: c[3] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("assertion 1 (fast-forward): OK");
    expect(r.out).toContain("assertion 2 (containment): OK");
  });

  // THE DEFECT. c1 is still on dev, so containment holds and the OLD guard passed this.
  test("REFUSES a rewind — the shape the old guard reported as a genuine fast-forward", () => {
    const { root, c } = makeRepo();
    const r = run(root, { BEFORE: c[3], AFTER: c[0] });
    expect(r.code).toBe(1);
    expect(r.out).toContain("assertion 1 (FAST-FORWARD) FAILED");
    expect(r.out).toContain("MOVED BACKWARDS");
    // And it must be assertion 1 ALONE: containment genuinely still holds, so a guard that
    // reported both would be blaming the wrong thing and sending the reader somewhere useless.
    expect(r.out).toContain("assertion 2 (containment): OK");
  });

  test("REFUSES a foreign commit — the merge-button shape the old guard already caught", () => {
    const { root, git, c } = makeRepo();
    // A commit on main that dev never had.
    git("checkout", "-q", "-b", "main", c[3]);
    execFileSync("bash", ["-c", "echo x > g && git add g && git commit -qm foreign"], { cwd: root });
    const foreign = git("rev-parse", "HEAD");
    const r = run(root, { BEFORE: c[3], AFTER: foreign });
    expect(r.code).toBe(1);
    expect(r.out).toContain("assertion 2 (CONTAINMENT) FAILED");
    // Fast-forwardness is not what is wrong here — main did move forward.
    expect(r.out).toContain("assertion 1 (fast-forward): OK");
  });

  test("the two assertions are INDEPENDENT — a push can trip both, and both are named", () => {
    // The guard against a future collapse back into one check: a rewind onto a commit dev never
    // had violates fast-forwardness AND containment.
    const { root, git, c } = makeRepo();
    git("checkout", "-q", "-b", "side", c[0]);
    execFileSync("bash", ["-c", "echo y > h && git add h && git commit -qm sideways"], { cwd: root });
    const sideways = git("rev-parse", "HEAD");
    const r = run(root, { BEFORE: c[3], AFTER: sideways });
    expect(r.code).toBe(1);
    expect(r.out).toContain("assertion 1 (FAST-FORWARD) FAILED");
    expect(r.out).toContain("assertion 2 (CONTAINMENT) FAILED");
    expect(r.out).toContain("2 of 2 assertions failed");
  });

  test("branch creation skips assertion 1 and SAYS SO — the only correct skip", () => {
    const { root, c } = makeRepo();
    const r = run(root, { BEFORE: ZERO, AFTER: c[3] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("assertion 1 (fast-forward): SKIPPED");
    expect(r.out).toContain("assertion 2 (containment): OK");
  });

  test("an unresolvable ref is exit 2 — 'verified NOTHING', never a pass", () => {
    // The failure mode that makes a guard worse than none: a checkout or fetch problem reported as
    // success. opum-cli-e2e predicted exactly this shape for a narrowed refspec.
    const { root, c } = makeRepo();
    const r = run(root, { BEFORE: c[0], AFTER: c[3], DEV_REF: "origin/does-not-exist" });
    expect(r.code).toBe(2);
    expect(r.out).toContain("verified NOTHING");
    expect(r.out).not.toContain("both assertions hold");
  });

  // WIRING. Every test above proves the LOGIC. None of them proves the workflow calls it, and its
  // workflow has no pull_request trigger — so a green PR rollup says nothing about whether the job
  // is wired correctly. quest-cli made this point about these exact two jobs. Reading the workflow is
  // the cheapest thing that fails when the wiring breaks.
  test("the guard workflow calls the script and passes BOTH pushed SHAs, not just the new one", () => {
    const ci = readFileSync(GUARD_YML, "utf8");
    expect(ci).toContain("scripts/assert-main-fast-forward.sh");
    // The missing input was the OLD tip. Without it, assertion 1 cannot exist at all.
    expect(ci).toMatch(/BEFORE:\s*\$\{\{\s*github\.event\.before\s*\}\}/);
    expect(ci).toMatch(/AFTER:\s*\$\{\{\s*github\.sha\s*\}\}/);
    // fetch-depth: 0 is load-bearing — ancestry on a shallow clone silently cannot be computed.
    expect(ci).toContain("fetch-depth: 0");
    // The job fetches dev explicitly before calling the script. Deleting that line survived this
    // suite with 0 red (mutation-checked 2026-09-15, prompted by opum-doc's ODOC-211 finding on
    // the reference script): the unresolvable-ref test above exercises the script's own
    // diagnosis, which is a different site from the workflow's fetch, so nothing here pinned the
    // fetch to the job. This does.
    expect(ci).toMatch(/git fetch origin dev\s*\n\s*bash scripts\/assert-main-fast-forward\.sh/);
  });
});
