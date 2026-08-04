/**
 * Pins the host-safety boundary around docker/e2e/run-e2e.sh.
 *
 * The real Docker job can only exercise the branch where the container guard passes. This
 * host-side test covers the opposite branch without requiring Docker or entering the harness.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "docker", "e2e", "run-e2e.sh");
const DOCKERFILE = join(ROOT, "docker", "e2e", "Dockerfile");

describe("docker E2E container-only guard (LORE-272)", () => {
  test("a host invocation fails before writing and prints the supported Docker command", () => {
    const cwd = mkdtempSync(join(tmpdir(), "lore-e2e-host-guard-"));
    try {
      const env = { ...process.env };
      delete env.LORE_E2E_CONTAINER;
      const proc = Bun.spawnSync(["bash", SCRIPT], {
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(proc.exitCode).toBe(1);
      expect(proc.stdout.toString("utf8")).toBe("");
      expect(proc.stderr.toString("utf8")).toContain(
        "docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e",
      );
      expect(readdirSync(cwd)).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("the script guard and its Dockerfile signal remain structurally coupled", () => {
    const script = readFileSync(SCRIPT, "utf8");
    const dockerfile = readFileSync(DOCKERFILE, "utf8");

    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal shell parameter expansion from run-e2e.sh.
    expect(script).toContain('[ "${LORE_E2E_CONTAINER:-}" != "1" ] || [ ! -d /workspace ]');
    expect(script).toContain("must run inside its Docker e2e container");
    expect(dockerfile).toMatch(/^ENV LORE_E2E_CONTAINER=1$/m);
  });
});

describe("docker E2E nested-checkout accounting (LORE-273)", () => {
  test("a missing nested project makes the git-status child fail", () => {
    const missing = join(tmpdir(), "lore-e2e-project-that-does-not-exist");
    const proc = Bun.spawnSync(
      ["bash", "-c", 'cd "$1" && [ -z "$(git status --porcelain -- backlog/)" ]', "bash", missing],
      { stdout: "pipe", stderr: "pipe" },
    );

    expect(proc.exitCode).not.toBe(0);
  });

  test("both nested-project commands report through step accounting", () => {
    const script = readFileSync(SCRIPT, "utf8");

    expect(script).toContain('step "AC4: configure backlog inside the nested project dir" 0');
    expect(script).toContain(
      'step "AC4: git status is clean under the nested project\'s backlog/ after the sweep (no double-prefix pathspec miss)" 0',
    );
  });
});
