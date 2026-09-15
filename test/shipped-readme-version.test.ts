/**
 * shipped-readme-version.test.ts — exercises `scripts/shipped-readme-version.mjs` (LCLI-510).
 *
 * WHY THE SHAPES MATTER MORE THAN THE COUNT. The contract this implements
 * (`opum-ai/opum-doc` main@b596ca5, `docs/reference/shipped-readme-version-assertions.md`)
 * records that clause 3 as originally stated — the package's own name adjacent to a version —
 * catches ONE of this README's three stale sites, because the `Status:` line carries no package
 * name at all. A proof that plants `@opum-ai/lore@0.6.2` somewhere, watches the gate go red and
 * declares victory proves the gate RUNS. It does not prove it CATCHES, and it would have shipped
 * a check blind to the worst line in the file while agreeing with the expectation.
 *
 * So the clause-3 shapes below are deliberately four distinct ones, and each names the wrong
 * implementation it would pass under:
 *
 *   A  name and version on ONE line          — passes under nothing; the floor everyone builds.
 *   B  version on one line, name on the NEXT — passes under a LINE-scoped matcher.
 *   C  stale line adjacent to a region       — passes if a block overlapping a region is exempt.
 *   D  stale text on a region MARKER's line  — passes if regions are excised by LINE, not by byte.
 *
 * And the acceptance half is tested as deliberately as the rejection half, because a gate that is
 * always red is indistinguishable from a working one when you only ever run it on a violation:
 * the legitimate non-package tokens this README carries (`>=1.49.0`, `1.3.14`, and the historical
 * `0.2.0`/`0.6.x` citations) must stay green, and so must the real repository README.
 */

import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "shipped-readme-version.mjs");

const BEGIN_BULLET = "<!--lore-version:published-bullet:begin-->";
const END_BULLET = "<!--lore-version:published-bullet:end-->";
const BEGIN_STATUS = "<!--lore-version:status:begin-->";
const END_STATUS = "<!--lore-version:status:end-->";

const PKG = {
  name: "@opum-ai/lore",
  version: "0.7.0",
  optionalDependencies: {
    "@opum-ai/lore-darwin-arm64": "0.7.0",
    "@opum-ai/lore-darwin-x64": "0.7.0",
    "@opum-ai/lore-linux-arm64": "0.7.0",
    "@opum-ai/lore-linux-x64": "0.7.0",
    "@opum-ai/lore-win32-arm64": "0.7.0",
    "@opum-ai/lore-win32-x64": "0.7.0",
  },
};

/**
 * A fixture README with the same STRUCTURE as the real one — the two regions, a bullet list, a
 * blockquote whose `Status:` sentence and package-name line are different lines of one paragraph,
 * and the legitimate non-package tokens that make quest-cli's "no version token anywhere" rule
 * unusable here. Structure, not a copy: a copy would drift and the tests would stop describing
 * what they claim to.
 */
function fixtureReadme(): string {
  return [
    "# lore",
    "",
    "- Built on **Bun + TypeScript** with an exact-pinned **Commander** parser.",
    `- ${BEGIN_BULLET}Published on npm as **\`@opum-ai/lore@0.7.0\`** (bin \`lore\`) with six`,
    `  exact-pinned platform packages, including Windows ARM64.${END_BULLET}`,
    "- The agent bridge is a generated **`.claude/skills/lore/SKILL.md`**.",
    "",
    `> ${BEGIN_STATUS}**Status: 0.7.0 released.** Tag \`v0.7.0\`, the qualified workflow artifacts,`,
    "> all seven public `@opum-ai/lore*` npm packages with `latest` moved on each,",
    `> and a clean-registry install agree on \`0.7.0\`.${END_STATUS}`,
    "> Released as a **pair with `quest` 0.7.0** — the two version numbers move in",
    "> lockstep.",
    ">",
    "> `0.7.0` was therefore published with `scripts/publish-release.sh` and, like",
    "> `0.6.2` and `0.6.1` but unlike `0.6.0`, **carries no provenance attestation**.",
    "",
    "Requires a `--json`-capable Backlog.md (>=1.49.0) on `PATH`. The composite",
    "action installs Bun 1.3.14. Starting with `0.2.0`, the launcher installs only",
    "the matching script-free platform package.",
    "",
  ].join("\n");
}

/** Write a fixture tree and run `--check --dir` over it. */
function checkFixture(readme: string, pkg: object = PKG) {
  const dir = mkdtempSync(join(tmpdir(), "lore-readme-"));
  writeFileSync(join(dir, "README.md"), readme);
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  const run = spawnSync("node", [SCRIPT, "--check", "--dir", dir], { encoding: "utf8" });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, dir };
}

describe("acceptance — the gate must be green on things that are correct", () => {
  test("the fixture README, whose legitimate tokens include >=1.49.0, 1.3.14 and historical 0.6.x, passes", () => {
    const run = checkFixture(fixtureReadme());
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("the REAL repository README and package.json pass", () => {
    // The acceptance half measured on the actual artifact, not only on a fixture. If this ever
    // goes red on a clean tree the gate has stopped measuring the thing it claims to.
    const run = spawnSync("node", [SCRIPT, "--check"], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("the historical-narration block survives — candidate (c), a closed set of released values, would condemn it", () => {
    // "`0.7.0` was therefore published with ... like `0.6.2` and `0.6.1` but unlike `0.6.0`" is a
    // true statement about a PAST release and must stay legal. This is the measurement that
    // eliminated the closed-set predicate, so it is asserted rather than remembered.
    const readme = fixtureReadme();
    expect(readme).toContain("`0.6.2` and `0.6.1` but unlike `0.6.0`");
    expect(checkFixture(readme).status).toBe(0);
  });

  test("a block with a version but no package name is legal, and so is one with a name but no version", () => {
    const readme = `${fixtureReadme()}\nInstall it with \`npm install -g @opum-ai/lore\`.\n\nBun 1.3.14 is required.\n`;
    expect(checkFixture(readme).status).toBe(0);
  });
});

describe("A3.1 — every declared region is present", () => {
  test("a deleted begin marker is reported by region id, and says --write will not invent it", () => {
    const run = checkFixture(fixtureReadme().replace(BEGIN_STATUS, ""));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('A3.1 region "status"');
    expect(run.stderr).toContain("never invents markers");
  });

  test("a duplicated marker is reported as ambiguous rather than silently resolved to the first", () => {
    const readme = `${fixtureReadme()}\n${BEGIN_BULLET}stowaway${END_BULLET}\n`;
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("more than once");
  });
});

describe("A3.2 — each region is byte-equal to what the generator produces", () => {
  test("THE DEFECT ITSELF: package.json bumped, README not — both regions are named", () => {
    const run = checkFixture(fixtureReadme(), { ...PKG, version: "0.7.1" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('A3.2 region "published-bullet"');
    expect(run.stderr).toContain('A3.2 region "status"');
    expect(run.stderr).toContain("@opum-ai/lore@0.7.1");
  });

  test("a hand-edit INSIDE a region is caught even when the version itself is right", () => {
    // Byte-equality's second job: catching a broken generator, or prose drift, not only a stale
    // number. An inequality check would be vacuous here because A2 leaves only generated strings.
    const run = checkFixture(fixtureReadme().replace("with `latest` moved on each", "with `latest` moved"));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('A3.2 region "status"');
  });

  test("a drifted platform count is caught — the generator derives `six`/`seven` from optionalDependencies", () => {
    const { "@opum-ai/lore-win32-arm64": _dropped, ...fewer } = PKG.optionalDependencies;
    const run = checkFixture(fixtureReadme(), { ...PKG, optionalDependencies: fewer });
    expect(run.status).toBe(1);
    // Five platforms, six public packages — and "including Windows ARM64" must disappear with the
    // package that made it true, rather than surviving as prose nobody re-reads.
    expect(run.stderr).toContain("with five");
    expect(run.stderr).toContain("all six public");
    const generated = run.stderr.split("generated: ")[1] ?? "";
    expect(generated).not.toContain("Windows ARM64");
  });
});

describe("A3.3 clause 3 — block-scoped adjacency, proved against four distinct shapes", () => {
  test("SHAPE A — name and version on one line outside every region", () => {
    const readme = `${fixtureReadme()}\nGrab \`@opum-ai/lore@0.6.2\` from the registry.\n`;
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
    expect(run.stderr).toContain("0.6.2");
  });

  test("SHAPE B — `Status:`-style: version on one line, package name on the NEXT, one blockquote", () => {
    // The shape a LINE-scoped matcher passes, and the site the whole contract was written around.
    const stale = [
      "",
      "> **Status: 0.6.2 released.** Tag `v0.6.2`, the qualified artifacts,",
      "> all seven public `@opum-ai/lore*` npm packages agree.",
      "",
    ].join("\n");
    const readme = fixtureReadme() + stale;
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");

    // The half that makes this shape mean something: assert that NO SINGLE LINE of the planted
    // block carries both, so a line-scoped implementation demonstrably would not have fired.
    const namePattern = /@opum-ai\/lore/;
    const versionPattern = /(?<![\w.])\d+\.\d+\.\d+(?![\w.])/;
    for (const line of stale.split("\n")) {
      expect(namePattern.test(line) && versionPattern.test(line)).toBe(false);
    }
  });

  test("SHAPE C — stale name and version on two lines that IMMEDIATELY follow a region, in its blockquote", () => {
    // Distinguishes two wrong implementations at once, which is why the name and the version are
    // deliberately on different lines here rather than together as in SHAPE A:
    //   - line-scoped adjacency: neither line carries both, so it goes green;
    //   - "a block overlapping a region is exempt": the whole blockquote overlaps the status
    //     region, so the entire paragraph is waved through and it goes green.
    // Only "outside EVERY region, masked by byte, structure from the original" fires.
    const planted = [
      "> Older builds are pinned to `0.6.2` and are no longer supported.",
      "> See the `@opum-ai/lore*` packages on npm for what is current.",
    ].join("\n");
    const readme = fixtureReadme().replace(
      "> Released as a **pair with `quest` 0.7.0** — the two version numbers move in",
      `${planted}\n> Released as a **pair with \`quest\` 0.7.0** — the two version numbers move in`,
    );
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
    expect(run.stderr).toContain("0.6.2");

    // Same guard as SHAPE B: no single planted line carries both, so a line-scoped matcher
    // demonstrably would not have fired on this.
    for (const line of planted.split("\n")) {
      expect(/@opum-ai\/lore/.test(line) && /(?<![\w.])\d+\.\d+\.\d+(?![\w.])/.test(line)).toBe(false);
    }
  });

  test("SHAPE D — stale text sharing a LINE with a region marker, outside the region's bytes", () => {
    // Passes if regions are excised whole-line instead of byte-wise. The stale text sits on the
    // same physical line as the end marker, so a line-excising implementation deletes it along
    // with the generated content and reports a clean file.
    const readme = fixtureReadme().replace(
      `${END_STATUS}`,
      `${END_STATUS} Older builds are still on \`@opum-ai/lore@0.6.2\`.`,
    );
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
    expect(run.stderr).toContain("0.6.2");
  });

  test("a package name INSIDE a region cannot license a stale version outside it", () => {
    // The mirror of SHAPE D. `@opum-ai/lore*` lives inside the status region; a version planted
    // outside must not be judged against it, and — since the name is masked — the block is clean.
    // This asserts the masking is real rather than a no-op that happens to agree.
    const readme = fixtureReadme().replace("> lockstep.", "> lockstep at `1.3.14`.");
    expect(checkFixture(readme).status).toBe(0);
  });
});

describe("--write round-trips", () => {
  test("a drifted README is repaired by --write and then passes --check", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-write-"));
    writeFileSync(join(dir, "README.md"), fixtureReadme());
    writeFileSync(join(dir, "package.json"), JSON.stringify({ ...PKG, version: "0.9.0" }, null, 2));
    expect(spawnSync("node", [SCRIPT, "--check", "--dir", dir], { encoding: "utf8" }).status).toBe(1);

    // Drives the REAL --write, not a restatement of it. A test carrying its own copy of the
    // generator passes happily while the two drift apart, which is the same "two records of one
    // thing, each maintained alone" failure this whole task is about.
    const written = spawnSync("node", [SCRIPT, "--write", "--dir", dir], { encoding: "utf8" });
    expect(written.stderr).toBe("");
    const repaired = readFileSync(join(dir, "README.md"), "utf8");
    expect(repaired).toContain("**Status: 0.9.0 released.**");
    expect(repaired).toContain("@opum-ai/lore@0.9.0");
    // The hand-written text sharing lines with the markers must survive untouched.
    expect(repaired).toContain("> Released as a **pair with `quest` 0.7.0**");
    expect(spawnSync("node", [SCRIPT, "--check", "--dir", dir], { encoding: "utf8" }).status).toBe(0);
  });

  test("--write is idempotent and says so rather than rewriting bytes it did not change", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-idem-"));
    writeFileSync(join(dir, "README.md"), fixtureReadme());
    writeFileSync(join(dir, "package.json"), JSON.stringify(PKG, null, 2));
    const run = spawnSync("node", [SCRIPT, "--write", "--dir", dir], { encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("nothing to write");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toBe(fixtureReadme());
  });
});

describe("A1 — the subject is the packed artifact", () => {
  test("--tarball reads README.md out of a real tarball and fails on a stale one", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-tar-"));
    const pkgDir = join(dir, "package");
    execFileSync("mkdir", ["-p", pkgDir]);
    writeFileSync(join(pkgDir, "README.md"), fixtureReadme());
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify({ ...PKG, version: "0.7.1" }, null, 2));
    const tarball = join(dir, "stale.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);

    const run = spawnSync("node", [SCRIPT, "--tarball", tarball], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.2");
    expect(run.stderr).toContain("@opum-ai/lore@0.7.1");
  });

  test("--tarball passes on a tarball whose README matches its package.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-tar-ok-"));
    const pkgDir = join(dir, "package");
    execFileSync("mkdir", ["-p", pkgDir]);
    writeFileSync(join(pkgDir, "README.md"), fixtureReadme());
    writeFileSync(join(pkgDir, "package.json"), JSON.stringify(PKG, null, 2));
    const tarball = join(dir, "good.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);

    const run = spawnSync("node", [SCRIPT, "--tarball", tarball], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("an unreadable tarball is exit 2 (could not measure), never exit 0 (measured and clean)", () => {
    const run = spawnSync("node", [SCRIPT, "--tarball", join(tmpdir(), "does-not-exist.tgz")], { encoding: "utf8" });
    expect(run.status).toBe(2);
  });
});

describe("usage", () => {
  test("no arguments is exit 2, not a silent pass", () => {
    expect(spawnSync("node", [SCRIPT], { encoding: "utf8" }).status).toBe(2);
  });
});
