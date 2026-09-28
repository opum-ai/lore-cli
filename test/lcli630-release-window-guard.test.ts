/**
 * lcli630-release-window-guard.test.ts — the publish job's registry-visibility wait in
 * `.github/workflows/release.yml` refuses a REGISTRY_WINDOW_SECONDS outside the one window grammar
 * before it reads the registry or waits (LCLI-630).
 *
 * The step's REAL `run:` block is executed, written to a file and run as `bash -e <file>`, which is
 * how GitHub runs a Linux step with no `shell:` key. The file form matters and is not a nicety: an
 * arithmetic error in a script FILE aborts only its own line and bash -e carries on, which is how
 * `30m` left `deadline` empty and the wait loop spinning forever in the LCLI-630 measurement. Run as
 * `bash -e -c`, the same line takes the rest of the string with it and exits 1 -- a different object
 * that gives the wrong answer.
 *
 * `npm` is a stub on PATH that logs its argv: `lag` answers every view with npm's E404, `visible`
 * answers with the version and the tarball's own sha1 as dist.shasum. Nothing reaches a registry.
 */

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import * as yaml from "js-yaml";
import { REGISTRY_WINDOW } from "../scripts/promote-latest.mjs";

const WORKFLOW_PATH = join(import.meta.dir, "..", ".github", "workflows", "release.yml");
const STEP_NAME = "Verify the registry serves what was published (LCLI-460)";

interface Step {
  name?: string;
  shell?: string;
  env?: Record<string, string>;
  run?: string;
}
interface Workflow {
  defaults?: unknown;
  jobs: Record<string, { defaults?: unknown; steps?: Step[] }>;
}

function waitStep(): Step {
  const doc = yaml.load(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;
  const matches = (doc.jobs.publish?.steps ?? []).filter((s) => s.name === STEP_NAME);
  expect(matches).toHaveLength(1);
  return matches[0] as Step;
}

describe("release.yml's visibility wait: the window grammar (LCLI-630)", () => {
  test("one grammar: the step's window_re is REGISTRY_WINDOW's source, byte for byte", () => {
    const run = waitStep().run ?? "";
    const literals = [...run.matchAll(/^window_re='([^']*)'$/gm)].map((m) => m[1]);
    expect(literals).toEqual([REGISTRY_WINDOW.source]);
  });

  test("the window is checked before the registry is read, before the deadline, and before any sleep", () => {
    const run = waitStep().run ?? "";
    const check = run.indexOf("if ! [[ $REGISTRY_WINDOW_SECONDS =~ $window_re ]]; then");
    expect(check).toBeGreaterThan(-1);
    for (const later of ["npm view", "deadline=$(( started + REGISTRY_WINDOW_SECONDS ))", 'sleep "$nap"']) {
      expect(run.indexOf(later)).toBeGreaterThan(check);
    }
  });

  test("the step still runs under GitHub's default shell, which is what these runs reproduce", () => {
    // The execution tests run `bash -e <file>`. A `shell:` key or a `defaults:` block would change
    // the invocation (e.g. `shell: bash` adds -o pipefail), and these tests would stop describing it.
    const doc = yaml.load(readFileSync(WORKFLOW_PATH, "utf8")) as Workflow;
    expect(waitStep().shell).toBeUndefined();
    expect(doc.defaults).toBeUndefined();
    expect(doc.jobs.publish?.defaults).toBeUndefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal GitHub Actions expression syntax from release.yml.
    expect(waitStep().env?.REGISTRY_WINDOW_SECONDS).toBe("${{ vars.REGISTRY_WINDOW_SECONDS || 1800 }}");
  });
});

const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

describeOnPosix("release.yml's visibility wait, executed (LCLI-630)", () => {
  const SPEC = "@opum-ai/lore-linux-x64@9.9.9";
  // Past the spawn's own 20s bound, so an unguarded hang reports as that run's failure, not bun's.
  const EXEC_TIMEOUT_MS = 30_000;

  function run(value: string, registry: "lag" | "visible") {
    const root = mkdtempSync(join(tmpdir(), "lcli630-"));
    try {
      const bin = join(root, "bin");
      const stage = join(root, "stage");
      mkdirSync(bin);
      mkdirSync(join(stage, "package"), { recursive: true });
      writeFileSync(
        join(stage, "package", "package.json"),
        JSON.stringify({ name: "@opum-ai/lore-linux-x64", version: "9.9.9" }),
      );
      execFileSync("tar", ["-czf", join(root, "p.tgz"), "package"], { cwd: stage });
      writeFileSync(join(root, "staged-tarballs.txt"), "./p.tgz\n");
      const sha1 = createHash("sha1")
        .update(readFileSync(join(root, "p.tgz")))
        .digest("hex");
      const log = join(root, "npm.log");
      writeFileSync(log, "");
      const answer =
        registry === "lag"
          ? 'echo "npm error code E404" >&2; exit 1'
          : `[ "$3" = dist.shasum ] && echo ${sha1} || echo 9.9.9`;
      writeFileSync(join(bin, "npm"), `#!/usr/bin/env bash\necho "$*" >> "${log}"\n${answer}\n`);
      chmodSync(join(bin, "npm"), 0o755);
      const script = join(root, "step.sh");
      writeFileSync(script, waitStep().run ?? "");
      const marker = join(root, "RAN");
      const result = Bun.spawnSync({
        cmd: ["bash", "-e", script],
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH}`,
          REGISTRY_WINDOW_SECONDS: value.replace("MARKER", marker),
        },
        // An unguarded 30m or 08 against a lagging registry never exits (the LCLI-630 measurement).
        timeout: 20_000,
      });
      return {
        code: result.exitCode,
        out: result.stdout.toString() + result.stderr.toString(),
        npm: readFileSync(log, "utf8").split("\n").filter(Boolean),
        ran: existsSync(marker),
      };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  const REFUSAL =
    "::error::REGISTRY_WINDOW_SECONDS must be a whole number of seconds (0 to 999999999, no leading zero); got ";

  // [value as set, how printf %q shows it after the annotation escape of %]
  const malformed: [string, string][] = [
    ["abc", "abc"],
    ["30m", "30m"],
    ["08", "08"],
    ["", "''"],
    ["0x10", "0x10"],
    ["-5", "-5"],
    [" 3", "\\ 3"],
    ["5\n", "$'5\\n'"],
    // A lone CR: per the #358 review the runner splits workflow-command lines on CR as well as LF
    // (not measured here), so an escaper that handled only \n would let this through as a line break.
    ["a\rb", "$'a\\rb'"],
    ["1234567890", "1234567890"],
    ["5%0A::warning::x", "5%250A::warning::x"],
  ];
  for (const [value, shown] of malformed) {
    test(
      `${JSON.stringify(value)} is refused, named and shown escaped, before any registry read or wait`,
      () => {
        const r = run(value, "lag");
        expect(r.code).toBe(2);
        // Split on CR as well as LF, as the runner is reported to: one refusal line, one annotation.
        const lines = r.out.split(/\r\n|\r|\n/).filter(Boolean);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toStartWith(`${REFUSAL}${shown}. `);
        expect(r.npm).toEqual([]);
        expect(r.out).not.toContain("waiting");
      },
      EXEC_TIMEOUT_MS,
    );
  }

  test(
    "a value bash arithmetic would evaluate is refused before it can run anything",
    () => {
      // Unguarded, $(( started + REGISTRY_WINDOW_SECONDS )) evaluated this value as an expression and
      // the subscript's command substitution ran, in the one job holding id-token: write (measured).
      const r = run("x[$(touch MARKER)]", "lag");
      expect(r.code).toBe(2);
      expect(r.out).toStartWith(REFUSAL);
      expect(r.ran).toBe(false);
      expect(r.npm).toEqual([]);
    },
    EXEC_TIMEOUT_MS,
  );

  // Accepted: the boundaries of the grammar, against both registry answers.
  test(
    "0 is accepted: one read, no wait, the propagation warning, and a green step",
    () => {
      const r = run("0", "lag");
      expect(r.code).toBe(0);
      expect(r.out).not.toContain("::error::");
      expect(r.npm).toEqual([`view ${SPEC} version`]);
      expect(r.out).toContain(`::warning::still not visible on the registry read API after 0s:${SPEC}.`);
    },
    EXEC_TIMEOUT_MS,
  );

  test(
    "2 is accepted and actually waits out its window before warning",
    () => {
      const r = run("2", "lag");
      expect(r.code).toBe(0);
      // The deadline is whole epoch seconds, so the first "left" reads 2s or 1s depending on where in
      // the second the step started. Either way it waited and re-read before warning.
      expect(r.out).toMatch(/^waiting {2}1 package\(s\) not visible yet; [12]s of the shared window left$/m);
      expect(r.out).toContain(`after 2s:${SPEC}`);
      expect(r.npm.length).toBeGreaterThan(1);
    },
    EXEC_TIMEOUT_MS,
  );

  for (const value of ["1800", "999999999"]) {
    test(
      `${value} is accepted, and a visible package gets its content check`,
      () => {
        const r = run(value, "visible");
        expect(r.code).toBe(0);
        expect(r.out).not.toContain("::error::");
        expect(r.out).toContain(`content  ${SPEC} matches the published tarball`);
        expect(r.npm).toEqual([`view ${SPEC} version`, `view ${SPEC} dist.shasum`]);
      },
      EXEC_TIMEOUT_MS,
    );
  }
});
