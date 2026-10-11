/**
 * LCLI-520 — `npm run lint` fails in the main checkout whenever an agent worktree is live.
 *
 * biome.json sets `vcs.useIgnoreFile`, and biome reads **.gitignore** to decide which paths its
 * CONFIG DISCOVERY may descend into. `.claude/worktrees/` — where an in-flight opum-workflow
 * implementer checks out its own copy of this repository, `biome.json` and all — used to be
 * excluded only via `.git/info/exclude`, which is LOCAL and invisible to biome. So a live worktree
 * made `biome check .` report "Found a nested root configuration" and exit 1, naming no file in the
 * diff under review, and it disappeared the moment the worktree was removed (which is what made it
 * look intermittent).
 *
 * CI cannot catch this — a fresh clone has no worktrees — so the COMMITTED ignore rule is the whole
 * guard. These two tests pin the rule and the biome setting that makes it effective, so neither can
 * be dropped silently: remove either one and the defect returns.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

describe("LCLI-520: the committed .gitignore excludes agent worktrees", () => {
  test(".claude/worktrees/ is COMMITTED-ignored, not only in .git/info/exclude", () => {
    const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
    // Anchored, so a commented-out or stray mention does not satisfy it.
    expect(ignore).toMatch(/^\.claude\/worktrees\/$/m);
  });

  test("biome honours the ignore file — the setting that makes the rule protect config discovery", () => {
    // If `vcs.useIgnoreFile` were ever turned off, the .gitignore entry would stop protecting
    // config discovery and the defect would return for a different reason.
    const biome = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8")) as {
      vcs?: { useIgnoreFile?: boolean };
    };
    expect(biome.vcs?.useIgnoreFile).toBe(true);
  });
});
