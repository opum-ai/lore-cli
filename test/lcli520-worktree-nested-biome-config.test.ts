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
 * guard. These two tests pin the INPUTS the fix rests on: the committed rule, and the three biome
 * VCS settings that make it effective. Drop any one of them and the defect returns.
 *
 * What they do NOT pin is the end-to-end measurement — a LIVE worktree under .claude/worktrees/
 * with `npm run lint` red before the fix and green after, plus a genuine `src/` violation still
 * red. That was measured by hand when the fix landed and cannot be re-run without creating a
 * worktree, so this committed guard is deliberately the cheaper input-level check standing in for
 * it, not a replacement.
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

  test("biome honours the ignore file — the settings that make the rule protect config discovery", () => {
    // All THREE, not just `useIgnoreFile`: biome consults .gitignore only when VCS integration is
    // ENABLED, the client is git, AND the ignore file is in use. A round-1 review measured that
    // `enabled: false` with `useIgnoreFile: true` brings the nested-root-config error BACK while a
    // `useIgnoreFile`-only assertion stays green — a guard that can go green as the defect returns.
    // (`enabled: false` also stops biome ignoring .gitignore everywhere, so `npm run lint` would go
    // red loudly for a different reason — that mitigation is why the gap was minor, not a blocker —
    // but pinning all three is nearly free.)
    const biome = JSON.parse(readFileSync(join(ROOT, "biome.json"), "utf8")) as {
      vcs?: { enabled?: boolean; clientKind?: string; useIgnoreFile?: boolean };
    };
    expect(biome.vcs?.enabled).toBe(true);
    expect(biome.vcs?.clientKind).toBe("git");
    expect(biome.vcs?.useIgnoreFile).toBe(true);
  });
});
