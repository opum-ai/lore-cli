/**
 * shipped-readme-version.test.ts — exercises `scripts/shipped-readme-version.mjs` (LCLI-510).
 *
 * WHY THE SHAPES MATTER MORE THAN THE COUNT. The contract this implements
 * (`opum-ai/opum-doc` main@ba3055d, `docs/reference/shipped-readme-version-assertions.md`)
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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
    `- Published on npm as${BEGIN_BULLET} **\`@opum-ai/lore@0.7.0\`** (bin \`lore\`) with six`,
    `  exact-pinned platform packages, including Windows ARM64.${END_BULLET}`,
    "- The agent bridge is a generated **`.claude/skills/lore/SKILL.md`**.",
    "",
    `> **Status:${BEGIN_STATUS} 0.7.0 released.** Tag \`v0.7.0\`, the qualified workflow artifacts,`,
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

/**
 * Build a `package/`-rooted tarball the way `npm pack` does.
 *
 * `tar` RUNS FROM `dir` WITH BARE FILENAMES because GNU tar — what is on PATH on a Windows
 * runner — reads `C:\\...` as a `host:path` remote spec and fails with "Cannot connect to C:
 * resolve failed". Measured on run 35016083790: both A1 tests failed there and nowhere else.
 * `--force-local` fixes GNU tar and does not exist in the bsdtar macOS ships, so there is no
 * flag correct on both; a relative name has no colon and needs no platform branch.
 */
function packFixture(name: string, pkg: object): string {
  const dir = mkdtempSync(join(tmpdir(), `lore-readme-tar-${name}-`));
  const pkgDir = join(dir, "package");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, "README.md"), fixtureReadme());
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(pkg, null, 2));
  execFileSync("tar", ["-czf", `${name}.tgz`, "package"], { cwd: dir });
  return join(dir, `${name}.tgz`);
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
    const readme = `${fixtureReadme()}\nA second copy ${BEGIN_BULLET}stowaway${END_BULLET}\n`;
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

describe("the sanctioned escape hatch — an allow span, proved to ACCEPT as well as to refuse", () => {
  // quest-cli's point, adopted: "prove it accepts" applied to the ESCAPE HATCH, not just to the
  // gate. Their marked region is the thing their own docblock tells a future editor to reach for
  // instead of loosening the matcher, and it had never been demonstrated to work — four PRs of
  // proving the reject path. The same was true here, worse: there was no hatch at all, so the
  // only way past a legitimate name-plus-version was to widen the predicate. A predicate widened
  // once measures less forever.
  const ALLOW_BEGIN = "<!--lore-version:allow:begin-->";
  const ALLOW_END = "<!--lore-version:allow:end-->";

  test("ACCEPTS a legitimate name-plus-version that a generated region could never hold", () => {
    // Honest history, not derivable from package.json, so it cannot live in a generated region.
    // Without the hatch this is exactly the sentence that gets clause 3 loosened.
    const sentence = "`@opum-ai/lore@0.6.0` was the last release carrying a provenance attestation.";
    const refused = checkFixture(`${fixtureReadme()}\n${sentence}\n`);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("A3.3 clause 3");

    const allowed = checkFixture(`${fixtureReadme()}\nHistory: ${ALLOW_BEGIN}${sentence}${ALLOW_END}\n`);
    expect(allowed.stderr).toBe("");
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toContain("1 hand-written allow span");
  });

  test("an allow span does NOT disable byte-equality — it exempts clause 3 only", () => {
    // The failure that would make the hatch a hole: wrapping the whole file and calling it exempt.
    const readme = `${ALLOW_BEGIN}${fixtureReadme()}${ALLOW_END}`;
    const run = checkFixture(readme, { ...PKG, version: "0.7.1" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.2");
  });

  test("an unterminated allow span is refused, not run to end of file", () => {
    // "Exempt this sentence" and "exempt the rest of the README" differ by one missing marker.
    const run = checkFixture(`${fixtureReadme()}\nHistory: ${ALLOW_BEGIN}see \`@opum-ai/lore@0.6.0\`.\n`);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("never closed");
  });

  test("a stray end marker with no opener is refused, before the spans and after them", () => {
    const before = checkFixture(`${fixtureReadme()}\nHistory: done${ALLOW_END}\n`);
    expect(before.status).toBe(1);
    expect(before.stderr).toContain("do not pair up");

    // The likelier typo, and the one a first-occurrence check misses: a deleted opener leaves its
    // closer behind DOWNSTREAM of spans that parsed cleanly.
    const after = checkFixture(
      `${fixtureReadme()}\nHistory: ${ALLOW_BEGIN}\`@opum-ai/lore@0.6.0\`${ALLOW_END} and \`0.6.1\`${ALLOW_END}\n`,
    );
    expect(after.status).toBe(1);
    expect(after.stderr).toContain("do not pair up");
  });

  test("allow spans are repeatable, unlike the generated regions", () => {
    const one = `${ALLOW_BEGIN}\`@opum-ai/lore@0.6.0\`${ALLOW_END}`;
    const two = `${ALLOW_BEGIN}\`@opum-ai/lore@0.6.1\`${ALLOW_END}`;
    const run = checkFixture(`${fixtureReadme()}\nShipped: ${one} and then ${two}.\n`);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("2 hand-written allow span");
  });
});

describe("rendering — a marker may never be the first content on its line", () => {
  // FOUND BY MEASUREMENT, NOT BY READING THE SPEC. The first implementation put the begin
  // marker immediately after `- ` and `> `, which passed every version assertion. GitHub's own
  // renderer (`POST /markdown`) then showed the npm page emitting a literal
  // `**Status: 0.7.0 released.**`, asterisks and backticks and all: a CommonMark HTML block
  // starts at a line whose content begins with `<!--` and swallows the REST OF THAT LINE as raw
  // text. The version was correct and the page was wrong, which is the combination no
  // version-only check can see.
  test("a line-initial marker is reported, even though every version assertion still holds", () => {
    // Deliberately VERSION-NEUTRAL: the marker moves to the start of its own line while the
    // region's bytes stay identical, so clauses 1, 2 and 3 all still pass. That is what makes
    // this test mean something — the page would be broken and nothing else in the file would
    // say so. (Most ways of moving a marker also move the region boundary and trip clause 2,
    // which would let this pass for the wrong reason.)
    const readme = fixtureReadme().replace(
      `- Published on npm as${BEGIN_BULLET} **`,
      `- Published on npm as\n  ${BEGIN_BULLET} **`,
    );
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("RENDERING");
    expect(run.stderr).toContain("RAW TEXT");
    expect(run.stderr).not.toContain("A3.2");
    expect(run.stderr).not.toContain("A3.3");
    expect(run.stderr).toContain("1 shipped-README version assertion(s) failed");
  });

  test("a marker after a blockquote prefix is caught too — container prefixes are stripped first", () => {
    const readme = fixtureReadme().replace(`> **Status:${BEGIN_STATUS} `, `> ${BEGIN_STATUS}**Status: `);
    const run = checkFixture(readme);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("RENDERING");
  });

  test("the real README's markers are all inline", () => {
    const readme = readFileSync(join(import.meta.dir, "..", "README.md"), "utf8");
    for (const line of readme.split("\n")) {
      const content = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)?(?:>\s?)*\s*/, "");
      expect(content.startsWith("<!--lore-version:")).toBe(false);
    }
  });
});

describe("the N+1th region — nothing is hardcoded to exactly the two that exist today", () => {
  // The harder half of quest-cli's escape-hatch discipline. They had to prove ONE marked region
  // is usable; this implementation declares its regions in code, so what has to be demonstrated
  // is that ADDING one works — generation, byte-equality, clause-3 masking and the rendering rule
  // all generalising past the two that happen to exist. Everything else in this suite exercises
  // those two, so a machine silently specialised to "published-bullet" and "status" would pass
  // the whole file.
  //
  // It proves it by patching a COPY of the real script rather than by restating its internals:
  // a third region is declared the way a future maintainer would declare one, and the real
  // binary is then run against a README carrying three.
  const THIRD = "extra";
  const THIRD_BEGIN = `<!--lore-version:${THIRD}:begin-->`;
  const THIRD_END = `<!--lore-version:${THIRD}:end-->`;

  /** Copy the real script and declare one more region in it, the way a maintainer would. */
  function scriptWithThirdRegion(): string {
    const source = readFileSync(SCRIPT, "utf8");
    const withId = source.replace(
      'const REGION_IDS = ["published-bullet", "status"];',
      `const REGION_IDS = ["published-bullet", "status", "${THIRD}"];`,
    );
    expect(withId).not.toBe(source); // the anchor still exists
    const withTemplate = withId.replace(
      '  return new Map([\n    [\n      "published-bullet",',
      '  return new Map([\n    ["' +
        THIRD +
        '", ` built from ${pkg.name}@${pkg.version}`],\n    [\n      "published-bullet",',
    );
    expect(withTemplate).not.toBe(withId);
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-n1-"));
    const copied = join(dir, "shipped-readme-version.mjs");
    writeFileSync(copied, withTemplate);
    return copied;
  }

  function threeRegionReadme(body: string): string {
    return `${fixtureReadme()}\nBuilt:${THIRD_BEGIN}${body}${THIRD_END}\n`;
  }

  function runThird(readme: string, pkg: object = PKG) {
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-n1-fx-"));
    writeFileSync(join(dir, "README.md"), readme);
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
    return spawnSync("node", [scriptWithThirdRegion(), "--check", "--dir", dir], { encoding: "utf8" });
  }

  test("ACCEPTS a third region whose content matches — the machinery generalises past two", () => {
    const run = runThird(threeRegionReadme(" built from @opum-ai/lore@0.7.0"));
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("3 generated regions byte-equal");
  });

  test("the third region is byte-checked like the other two, and named when it drifts", () => {
    const run = runThird(threeRegionReadme(" built from @opum-ai/lore@0.6.2"));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`A3.2 region "${THIRD}"`);
    // ...and only it. The two originals still match, so this is not a blanket failure.
    expect(run.stderr).not.toContain('A3.2 region "status"');
    expect(run.stderr).toContain("1 shipped-README version assertion(s) failed");
  });

  test("the third region's bytes are masked for clause 3, exactly like the other two", () => {
    // Its generated content carries this package's own name NEXT TO a version. If masking were
    // specialised to the two known regions, clause 3 would fire on the region's own output —
    // a gate that refuses what its own generator produces.
    const run = runThird(threeRegionReadme(" built from @opum-ai/lore@0.7.0"));
    expect(run.stderr).not.toContain("A3.3");
    expect(run.status).toBe(0);
  });

  test("a missing third region is reported by ITS id, not by one of the original two", () => {
    const run = runThird(`${fixtureReadme()}\n`);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`A3.1 region "${THIRD}"`);
  });

  test("--write fills the third region too", () => {
    const dir = mkdtempSync(join(tmpdir(), "lore-readme-n1-write-"));
    writeFileSync(join(dir, "README.md"), threeRegionReadme(" stale"));
    writeFileSync(join(dir, "package.json"), JSON.stringify(PKG, null, 2));
    const script = scriptWithThirdRegion();
    expect(spawnSync("node", [script, "--write", "--dir", dir], { encoding: "utf8" }).stderr).toBe("");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain(" built from @opum-ai/lore@0.7.0");
    expect(spawnSync("node", [script, "--check", "--dir", dir], { encoding: "utf8" }).status).toBe(0);
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
    expect(repaired).toContain("0.9.0 released.**");
    expect(repaired).toContain("@opum-ai/lore@0.9.0");
    expect(repaired).not.toContain("0.7.0 released");
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
    const tarball = packFixture("stale", { ...PKG, version: "0.7.1" });
    const run = spawnSync("node", [SCRIPT, "--tarball", tarball], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.2");
    expect(run.stderr).toContain("@opum-ai/lore@0.7.1");
  });

  test("--tarball passes on a tarball whose README matches its package.json", () => {
    const tarball = packFixture("good", PKG);
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

// ── Boundary shapes the clause was blind to until PR #118's review ──────────────────────────────
//
// Every test below is a shape that scored exit 0 — an ALWAYS-GREEN gate — against the first
// implementation, or a correct file the gate would have REFUSED. Both directions are represented
// on purpose: a gate that is wrong in the accepting direction ships a stale npm page, and one that
// is wrong in the refusing direction fails a correct release, which is the harder of the two to
// diagnose because the failure looks like a real defect.
describe("A3.3 clause 3 — version-token boundaries", () => {
  test("SHAPE E — a `v`-prefixed version, which is this README's OWN house style", () => {
    // The generated status region writes ``Tag `v0.7.0` ``, so `v<version>` is what the next
    // hand-written sentence about a release reaches for. The original lookbehind rejected a
    // leading `v` as a word character and waved the whole shape through.
    const run = checkFixture(
      `${fixtureReadme()}\nInstall the current release, \`@opum-ai/lore\` \`v0.6.2\`, from npm.\n`,
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
    expect(run.stderr).toContain("v0.6.2");
  });

  test("SHAPE F — a version ending a sentence, where the full stop hid the token", () => {
    const run = checkFixture(`${fixtureReadme()}\nThe latest published version of \`@opum-ai/lore\` is 0.6.2.\n`);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
    expect(run.stderr).toContain("0.6.2");
  });

  test("ACCEPTS a longer dotted token — widening the tail must not make `0.6.2.3` a version", () => {
    // The guard against fixing SHAPE F by deleting the tail anchor outright. A four-segment token
    // is not a version this clause should pick `0.6.2` out of.
    const run = checkFixture(`${fixtureReadme()}\nThe \`@opum-ai/lore\` build identifier was 0.6.2.3 that week.\n`);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("ACCEPTS a `v` that is merely the tail of a word — `rev0.7.0` is not a version token", () => {
    const run = checkFixture(`${fixtureReadme()}\nThe \`@opum-ai/lore\` internal marker rev0.7.0 is not a release.\n`);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });
});

describe("structure is read from the ORIGINAL lines, not the masked ones", () => {
  // The one invariant the implementation documents as load-bearing and had NO test behind it.
  // A fully-masked line reads as blank, so splitting on the masked text tears one paragraph into
  // two and hides a name/version pair straddling the seam.
  const ALLOW_BEGIN = "<!--lore-version:allow:begin-->";
  const ALLOW_END = "<!--lore-version:allow:end-->";

  test("a pair straddling a fully-masked line is caught — the masked line must not split the block", () => {
    const straddle = [
      `The launcher \`@opum-ai/lore\` is documented below.${ALLOW_BEGIN}`,
      "this entire line lives inside the span and masks to blanks",
      `still inside${ALLOW_END} and it was 0.6.2 back then.`,
    ].join("\n");
    const run = checkFixture(`${fixtureReadme()}\n${straddle}\n`);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
  });
});

describe("mask offsets are UTF-16 code units, like the indices that produce them", () => {
  test("ACCEPTS a correct README carrying astral characters ahead of every region", () => {
    // `[...text]` spreads by CODE POINT while region offsets come from indexOf, which counts code
    // units. One emoji in a heading shifted every mask right by one and false-redded a correct
    // file, pointing the operator at the generator's own output and telling them to move a claim
    // that was already inside a region.
    const withEmoji = fixtureReadme().replace("# lore", `# lore ${"🧭".repeat(40)}`);
    const run = checkFixture(withEmoji);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("and still REFUSES a stale pair when astral characters are present", () => {
    // The mirror hazard: a mask sliding off its region can also hide a genuine pair.
    const withEmoji = fixtureReadme().replace("# lore", `# lore ${"🧭".repeat(40)}`);
    const run = checkFixture(`${withEmoji}\nStill shipping \`@opum-ai/lore\` 0.6.2 today.\n`);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("A3.3 clause 3");
  });
});

describe("rendering — container prefixes nest, and the blockquote comes first", () => {
  test("`> - ` is caught: a bullet INSIDE a blockquote is the ordinary Markdown order", () => {
    // The original prefix pattern accepted bullet-then-quote only, so the real-world nesting
    // slipped through and the npm page would render literal `**` and backticks.
    const run = checkFixture(
      `${fixtureReadme()}\n> - ${"<!--lore-version:allow:begin-->"}x${"<!--lore-version:allow:end-->"}\n`,
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("RENDERING");
  });
});
