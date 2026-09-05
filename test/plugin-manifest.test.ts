/**
 * plugin-manifest.test.ts — `.claude-plugin/plugin.json` stays in lockstep with the npm release
 * (LCLI-447).
 *
 * 0.4.3 shipped without this check: the release cut bumped `package.json` and all six
 * `npm/<platform>/package.json` files, but nothing touched `.claude-plugin/plugin.json`, so the
 * marketplace pin moving to `v0.4.3` still resolved as `0.4.2` — `claude plugin update opum-lore`
 * reported already up to date, and a fresh install of the `v0.4.3` tree still labeled itself
 * `0.4.2`, because Claude Code's plugin-update resolution reads `plugin.json`'s own version, not
 * the git tag. This test fails on every PR the moment the two manifests disagree, rather than only
 * being discoverable after a release ships and a marketplace pin moves.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

describe("the opum-lore plugin manifest tracks the package version", () => {
  test("plugin.json's version matches package.json's version exactly", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
    const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8")) as { version: string };
    expect(plugin.version).toBe(pkg.version);
  });
});
