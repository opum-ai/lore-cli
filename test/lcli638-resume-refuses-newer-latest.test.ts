/**
 * lcli638-resume-refuses-newer-latest.test.ts — LCLI-638, paired with quest-cli QCLI-405, under
 * opum-doc ADR refuse-a-lore-quest-promotion-that-would-move-npm-latest-backwards.
 *
 * The PAIRING GRID, pinned. It is the same 70 rows lore and quest-cli each ran in their own
 * RELEASE_PACKAGES during the pairing for AC2 (40 in the first exchange plus the 30 the reviewer's
 * F1 added when "strictly newer" turned out to be a semver-precedence question rather than a plain
 * X.Y.Z one), and its verdicts are the contract between the two repositories: the pair matches by
 * VERDICT, not by message text, so a change that flips any row here is a divergence to agree with
 * quest-cli before landing, not a test to update.
 *
 * Rows are keyed by ORDINAL, as they were exchanged, so a reader can map this file onto either
 * side's package set. Rows are 2 (resuming) x 7 (relation) x 5 (shape):
 *   relation: newer 5.7.0 | equal 5.6.7 | older 5.6.6 | prerelease-newer 5.7.0-rc.1 |
 *             prerelease-same 5.6.7-rc.1 | build-newer 5.7.0+build.7 | build-same 5.6.7+build.7
 *   shape:    uniform | platform0 | platform2 | launcher | first4 (every other ordinal stays 5.6.6)
 *
 * The rule each row pins, both directions:
 *   FRESH  — refuse unless the live value is a plain release OLDER than --version. An equal or
 *            newer plain value is the LCLI-631 refusal; ANY non-plain live value is refused by
 *            validateRecord, which cannot record a non-plain prior.
 *   RESUME — refuse exactly when the release the live value LEADS WITH is strictly newer than
 *            --version (semver precedence: 5.7.0-rc.1 is newer than 5.6.7, while 5.6.7-rc.1 and
 *            5.6.7+build.7 are not newer than 5.6.7), accept otherwise. That is the LCLI-638 refusal.
 *
 * Measured shape: 25 of the 70 accepted. Against origin/dev's pre-change script, 40 are accepted
 * and the 15 differences are exactly the resume newer / prerelease-newer / build-newer rows.
 */
import { describe, expect, test } from "bun:test";
import { RELEASE_PACKAGES } from "../scripts/pair-receipt.mjs";
import { leadingReleaseVersion, planPromotion } from "../scripts/promote-latest.mjs";

const VERSION = "5.6.7";
const LAUNCHER_VERSION = "5.6.7-rc.2";
const OLDER = "5.6.6";
const LAUNCHER = "@opum-ai/lore";
const LAST = RELEASE_PACKAGES.length - 1;

/** relation -> [live value, accepted on a resume] */
const RELATIONS: Array<[string, string, boolean]> = [
  ["newer", "5.7.0", false],
  ["equal", VERSION, true],
  ["older", OLDER, true],
  ["prerelease-newer", "5.7.0-rc.1", false],
  ["prerelease-same", "5.6.7-rc.1", true],
  ["build-newer", "5.7.0+build.7", false],
  ["build-same", "5.6.7+build.7", true],
];

/** shape -> the ordinals that carry the relation's value (every other ordinal stays OLDER). */
const SHAPES: Array<[string, number[]]> = [
  ["uniform", RELEASE_PACKAGES.map((_, i) => i)],
  ["platform0", [0]],
  ["platform2", [2]],
  ["launcher", [LAST]],
  ["first4", [0, 1, 2, 3]],
];

const latestFor = (shaped: number[], value: string) =>
  Object.fromEntries(RELEASE_PACKAGES.map((name, i) => [name, shaped.includes(i) ? value : OLDER]));

async function verdict(resuming: boolean, latest: Record<string, string>) {
  return planPromotion({
    version: VERSION,
    launcherVersion: LAUNCHER_VERSION,
    resuming,
    readTags: async (name) => ({
      latest: latest[name] as string,
      "release-candidate": name === LAUNCHER ? LAUNCHER_VERSION : VERSION,
    }),
  });
}

describe("LCLI-638 / QCLI-405 pairing grid: 70 rows, 25 accepted", () => {
  let accepted = 0;
  for (const resuming of [false, true])
    for (const [relation, value, acceptedOnResume] of RELATIONS)
      for (const [shape, ordinals] of SHAPES) {
        const expected = resuming ? acceptedOnResume : relation === "older";
        if (expected) accepted += 1;
        test(`${resuming ? "resume" : "fresh"}-${shape}-${relation} (${value}): ${expected ? "accepted" : "refused"}`, async () => {
          const plan = await verdict(resuming, latestFor(ordinals, value));
          expect(plan.ok).toBe(expected);
        });
      }

  test("the pinned column sums to 25 of 70", () => {
    expect(accepted).toBe(25);
  });
});

describe("LCLI-638: the precedence boundary is the only thing the skip turns on", () => {
  // The helper itself, at the boundary. A value that leads with no release is unorderable and
  // deliberately keeps its pre-change behaviour; the resume rule is written against null.
  const leads: Array<[string, string | null]> = [
    ["5.7.0", "5.7.0"],
    ["5.7.0-rc.1", "5.7.0"],
    ["5.7.0+build.7", "5.7.0"],
    ["5.6.7-rc.1+build.9", "5.6.7"],
    ["5.7.0-rc..1", "5.7.0"],
    ["v5.7.0", null],
    ["5.7", null],
    ["5.7.0.1", null],
    ["05.7.0", null],
    ["latest", null],
    ["", null],
  ];
  for (const [value, lead] of leads)
    test(`leadingReleaseVersion(${JSON.stringify(value)}) is ${JSON.stringify(lead)}`, () => {
      expect(leadingReleaseVersion(value)).toBe(lead);
    });

  // Past 2^53, where Number() collapses the two values into one. compareReleaseVersions is
  // exact there (length then lexical), and the leading-release key feeds it the same way.
  const huge = async (version: string, live: string) =>
    (
      await planPromotion({
        version,
        launcherVersion: `${version}-rc.2`,
        resuming: true,
        readTags: async (name) => ({
          latest: name === RELEASE_PACKAGES[0] ? live : "0.0.9007199254740992",
          "release-candidate": name === LAUNCHER ? `${version}-rc.2` : version,
        }),
      })
    ).ok;
  test("the comparison stays exact past 2^53: newer refuses, equal and older resume", async () => {
    expect(await huge("0.0.9007199254740992", "0.0.9007199254740993")).toBe(false);
    expect(await huge("0.0.9007199254740993", "0.0.9007199254740993")).toBe(true);
    expect(await huge("0.0.9007199254740993", "0.0.9007199254740992")).toBe(true);
  });
});
