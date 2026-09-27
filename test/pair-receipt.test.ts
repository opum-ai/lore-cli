/**
 * pair-receipt.test.ts — the opum-cli-e2e gate on moving `latest` (LCLI-613, Article 3 clause 5).
 *
 * scripts/pair-receipt.mjs reads receipts/pair/<version>.json exactly as opum-cli-e2e's
 * receipts/README.md "What a reader must do" lists, mirrored from quest-cli's pair-receipt.mjs.
 * One good receipt passes; each bad-receipt class below breaks ONE step and names it, so a reader
 * that skipped a step turns exactly that step's cases red.
 */

import { describe, expect, test } from "bun:test";
import {
  evaluatePairReceipt,
  expectedTarballNames,
  fetchPairReceipt,
  type Observed,
  observeRelease,
  PAIR_RECEIPT_KIND,
  RELEASE_PACKAGES,
  receiptReadArgs,
  requirePairQualification,
  tarballName,
} from "../scripts/pair-receipt.mjs";

const V = "3.4.5";
const LORE_COMMIT = "a".repeat(40);
const QUEST_COMMIT = "b".repeat(40);
const integrity = (name: string) => `sha512-${Buffer.from(name).toString("base64")}==`;

type Doc = Record<string, unknown> & {
  pair: { lore: Record<string, unknown>; quest: Record<string, unknown> };
  installedFrom: Record<string, Record<string, unknown>>;
};

/** A receipt that satisfies every step for lore V paired with quest V. */
function goodReceipt(): Doc {
  const loreTarballs = Object.fromEntries(
    expectedTarballNames(V).map((name) => [name, { sha256: "c".repeat(64), distIntegrity: integrity(name) }]),
  );
  return {
    schemaVersion: 1,
    kind: PAIR_RECEIPT_KIND,
    pair: {
      lore: { version: V, commit: LORE_COMMIT, tarballs: loreTarballs },
      quest: { version: V, commit: QUEST_COMMIT, tarballs: {} },
    },
    installedFrom: {
      lore: { source: "registry", distTags: ["release-candidate"] },
      quest: { source: "registry", distTags: ["release-candidate"] },
    },
    verdict: "QUALIFIED",
    counts: { pass: 10, fail: 0, blocked: 0 },
    blocked: [],
    harness: { commit: "d".repeat(40), commitMeaning: "landed the baseline", baseline: "b", task: "TASK-1" },
    qualifiedAt: "2026-09-27T00:00:00.000Z",
  };
}

/** What the registry and the v<V> tag resolve to when the receipt is right. */
function goodObserved(): Observed {
  return {
    integrities: Object.fromEntries(expectedTarballNames(V).map((name) => [name, integrity(name)])),
    commit: LORE_COMMIT,
    commitSource: `opum-ai/lore-cli tag v${V}`,
    gitHead: null,
  };
}

const evaluate = (doc: unknown, observed: Observed = goodObserved()) =>
  evaluatePairReceipt(doc, { version: V, observed });

describe("scripts/pair-receipt.mjs: a good receipt", () => {
  test("names the seven archives npm pack produces, platforms and launcher", () => {
    expect(RELEASE_PACKAGES).toEqual([
      "@opum-ai/lore-darwin-arm64",
      "@opum-ai/lore-darwin-x64",
      "@opum-ai/lore-linux-arm64",
      "@opum-ai/lore-linux-x64",
      "@opum-ai/lore-win32-arm64",
      "@opum-ai/lore-win32-x64",
      "@opum-ai/lore",
    ]);
    expect(tarballName("@opum-ai/lore-linux-x64", V)).toBe(`opum-ai-lore-linux-x64-${V}.tgz`);
    expect(tarballName("@opum-ai/lore", V)).toBe(`opum-ai-lore-${V}.tgz`);
  });

  test("verifies: every step passes, no override", () => {
    const v = evaluate(goodReceipt());
    expect(v.problems).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.override).toBeNull();
  });

  test("a complete override on NOT QUALIFIED verifies and is returned verbatim for printing", () => {
    const doc = goodReceipt();
    doc.verdict = "NOT QUALIFIED";
    doc.override = { by: "operator", reason: "scale row unbound", task: "TASK-9", adr: "docs/adr/x.md@abc" };
    const v = evaluate(doc);
    expect(v.ok).toBe(true);
    expect(v.override).toEqual(doc.override as never);
  });

  test("an npm gitHead that agrees with the tag also verifies", () => {
    expect(evaluate(goodReceipt(), { ...goodObserved(), gitHead: LORE_COMMIT }).ok).toBe(true);
  });
});

describe("scripts/pair-receipt.mjs: every bad-receipt class refuses, naming its step", () => {
  const cases: Array<[string, (d: Doc) => unknown, string, Partial<Observed>?]> = [
    // Not a receipt at all.
    ["null", () => null, "pair receipt is not a JSON object"],
    ["an array", () => [], "pair receipt is not a JSON object"],
    ["a string", () => "QUALIFIED", "pair receipt is not a JSON object"],
    // Step 1: kind.
    [
      "an unknown kind",
      (d) => ({ ...d, kind: "opum.pair-qualification-receipt.v2" }),
      "kind must be opum.pair-qualification-receipt.v1",
    ],
    ["a per-product receipt's kind", (d) => ({ ...d, kind: "opum.qualification-receipt.v1" }), "kind must be"],
    ["no kind", (d) => ({ ...d, kind: undefined }), "kind must be"],
    // Step 2: verdict or a complete override.
    [
      "NOT QUALIFIED with no override",
      (d) => ({ ...d, verdict: "NOT QUALIFIED" }),
      'verdict is "NOT QUALIFIED", not "QUALIFIED"',
    ],
    ["no verdict", (d) => ({ ...d, verdict: undefined }), 'not "QUALIFIED"'],
    ["a lower-case verdict", (d) => ({ ...d, verdict: "qualified" }), 'not "QUALIFIED"'],
    ...(["by", "reason", "task", "adr"] as const).map((field): [string, (d: Doc) => unknown, string] => [
      `an override missing ${field}`,
      (d) => ({
        ...d,
        verdict: "NOT QUALIFIED",
        override: Object.fromEntries(["by", "reason", "task", "adr"].filter((f) => f !== field).map((f) => [f, "x"])),
      }),
      `missing or empty: ${field}`,
    ]),
    [
      "an override with a blank field",
      (d) => ({ ...d, verdict: "NOT QUALIFIED", override: { by: " ", reason: "r", task: "t", adr: "a" } }),
      "missing or empty: by",
    ],
    [
      "an override that is a string",
      (d) => ({ ...d, verdict: "NOT QUALIFIED", override: "yes" }),
      "override must name by, reason, task, adr",
    ],
    [
      "a partial override beside QUALIFIED",
      (d) => ({ ...d, override: { by: "x" } }),
      "missing or empty: reason, task, adr",
    ],
    // Step 3: both versions, and lore's commit.
    [
      "another lore version",
      (d) => ({ ...d, pair: { ...d.pair, lore: { ...d.pair.lore, version: "3.4.4" } } }),
      `pair.lore.version is "3.4.4", the promotion is ${V}`,
    ],
    [
      "a different pairing (quest at another version)",
      (d) => ({ ...d, pair: { ...d.pair, quest: { ...d.pair.quest, version: "3.4.6" } } }),
      `pair.quest.version is "3.4.6"; Article 3 pairs lore ${V} with quest ${V}`,
    ],
    ["no quest side at all", (d) => ({ ...d, pair: { lore: d.pair.lore } }), "pair.quest.version is undefined"],
    [
      "a lore commit the tag does not peel to",
      (d) => ({ ...d, pair: { ...d.pair, lore: { ...d.pair.lore, commit: "e".repeat(40) } } }),
      `opum-ai/lore-cli tag v${V} resolves to "${LORE_COMMIT}"`,
    ],
    ["a missing v<version> tag", (d) => d, "resolves to null (HTTP 422)", { commit: null, commitError: "HTTP 422" }],
    ["an npm gitHead that disagrees", (d) => d, `npm records gitHead "${"f".repeat(40)}"`, { gitHead: "f".repeat(40) }],
    [
      "a candidate-bundle verdict, not a registry install",
      (d) => ({ ...d, installedFrom: { ...d.installedFrom, lore: { source: "candidate" } } }),
      'installedFrom.lore.source is "candidate", not "registry"',
    ],
    ["no installedFrom", (d) => ({ ...d, installedFrom: undefined }), "installedFrom.lore.source is undefined"],
    // Step 4: exactly the seven archives, each digest what npm serves now.
    [
      "a missing platform archive",
      (d) => {
        const tarballs = { ...(d.pair.lore.tarballs as Record<string, unknown>) };
        delete tarballs[`opum-ai-lore-win32-arm64-${V}.tgz`];
        return { ...d, pair: { ...d.pair, lore: { ...d.pair.lore, tarballs } } };
      },
      `opum-ai-lore-win32-arm64-${V}.tgz: not in the pair receipt, so it was never qualified`,
    ],
    [
      "an extra archive",
      (d) => ({
        ...d,
        pair: {
          ...d.pair,
          lore: {
            ...d.pair.lore,
            tarballs: {
              ...(d.pair.lore.tarballs as object),
              [`opum-ai-lore-freebsd-x64-${V}.tgz`]: { distIntegrity: "sha512-x" },
            },
          },
        },
      }),
      `opum-ai-lore-freebsd-x64-${V}.tgz: named in the pair receipt but not part of this release`,
    ],
    [
      "an inherited-looking key (own-property lookup)",
      (d) => ({
        ...d,
        pair: {
          ...d.pair,
          lore: {
            ...d.pair.lore,
            tarballs: { ...(d.pair.lore.tarballs as object), constructor: { distIntegrity: "sha512-x" } },
          },
        },
      }),
      "constructor: named in the pair receipt but not part of this release",
    ],
    [
      "a digest npm does not serve",
      (d) => {
        const name = `opum-ai-lore-${V}.tgz`;
        return {
          ...d,
          pair: {
            ...d.pair,
            lore: {
              ...d.pair.lore,
              tarballs: { ...(d.pair.lore.tarballs as object), [name]: { distIntegrity: "sha512-other" } },
            },
          },
        };
      },
      `opum-ai-lore-${V}.tgz: qualified sha512-other, npm serves ${integrity(`opum-ai-lore-${V}.tgz`)}`,
    ],
    [
      "an archive with no distIntegrity",
      (d) => {
        const name = `opum-ai-lore-linux-x64-${V}.tgz`;
        return {
          ...d,
          pair: {
            ...d.pair,
            lore: {
              ...d.pair.lore,
              tarballs: { ...(d.pair.lore.tarballs as object), [name]: { sha256: "c".repeat(64) } },
            },
          },
        };
      },
      `opum-ai-lore-linux-x64-${V}.tgz: pair receipt records no distIntegrity`,
    ],
    [
      "a package npm serves nothing for",
      (d) => d,
      `opum-ai-lore-darwin-x64-${V}.tgz: qualified ${integrity(`opum-ai-lore-darwin-x64-${V}.tgz`)}, npm serves nothing`,
      {
        integrities: Object.fromEntries(
          expectedTarballNames(V)
            .filter((n) => n !== `opum-ai-lore-darwin-x64-${V}.tgz`)
            .map((n) => [n, integrity(n)]),
        ),
      },
    ],
    [
      "tarballs that are not an object",
      (d) => ({ ...d, pair: { ...d.pair, lore: { ...d.pair.lore, tarballs: [] } } }),
      "pair.lore.tarballs is not an object",
    ],
  ];

  for (const [label, mutate, reason, observed] of cases) {
    test(label, () => {
      const v = evaluate(mutate(goodReceipt()), { ...goodObserved(), ...(observed ?? {}) });
      expect(v.ok).toBe(false);
      expect(v.problems.join("\n")).toContain(reason);
    });
  }
});

describe("scripts/pair-receipt.mjs: the reads", () => {
  test("the receipt is read pinned: github.com, raw, opum-cli-e2e receipts/pair/<v>.json at main", async () => {
    const seen: string[][] = [];
    const fetched = await fetchPairReceipt(V, {
      execFile: async (file, args) => {
        seen.push([file, ...args]);
        return { stdout: JSON.stringify(goodReceipt()) };
      },
    });
    expect(seen).toEqual([
      [
        "gh",
        "api",
        "--hostname",
        "github.com",
        "-H",
        "Accept: application/vnd.github.raw",
        `repos/opum-ai/opum-cli-e2e/contents/receipts/pair/${V}.json?ref=main`,
      ],
    ]);
    expect(seen[0]?.slice(1)).toEqual(receiptReadArgs(V));
    expect(fetched.source).toBe(`opum-ai/opum-cli-e2e@main:receipts/pair/${V}.json`);
    expect((fetched.doc as Doc).kind).toBe(PAIR_RECEIPT_KIND);
  });

  for (const [label, stderr] of [
    ["a 404", "gh: Not Found (HTTP 404)"],
    ["a 403 (the repository is private)", "gh: Forbidden (HTTP 403)"],
  ] as const) {
    test(`${label} is NO RECEIPT, and the gate refuses without reading the registry`, async () => {
      const execFile = async () => {
        throw Object.assign(new Error("Command failed"), { stderr });
      };
      let observed = 0;
      const gate = await requirePairQualification({
        version: V,
        fetch: (v) => fetchPairReceipt(v, { execFile }),
        observe: async () => {
          observed++;
          return goodObserved();
        },
      });
      expect(gate.ok).toBe(false);
      expect(gate.problems).toEqual([
        `no opum-cli-e2e pair receipt at opum-ai/opum-cli-e2e@main:receipts/pair/${V}.json (${stderr})`,
      ]);
      expect(observed).toBe(0);
    });
  }

  test("a malformed receipt is NO RECEIPT", async () => {
    const fetched = await fetchPairReceipt(V, { execFile: async () => ({ stdout: "{ nope" }) });
    expect(fetched.doc).toBeNull();
    expect(fetched.error).toContain("JSON");
  });

  test("observeRelease reads each package's served integrity and peels v<version> on lore-cli", async () => {
    const calls: string[][] = [];
    const observed = await observeRelease(V, RELEASE_PACKAGES, {
      execFile: async (file, args) => {
        calls.push([file, ...args]);
        if (file === "gh") return { stdout: `${LORE_COMMIT}\n` };
        const [name] = (args[1] as string).split(/@(?=[^@]*$)/);
        const meta = { name, version: V, dist: { integrity: integrity(tarballName(name as string, V)) } };
        // npm 12 answers an exact-version view with a one-element array; an older npm, the object.
        return { stdout: JSON.stringify(name === "@opum-ai/lore" ? [{ ...meta, gitHead: LORE_COMMIT }] : meta) };
      },
    });
    expect(observed.integrities).toEqual(goodObserved().integrities);
    expect(observed.commit).toBe(LORE_COMMIT);
    expect(observed.gitHead).toBe(LORE_COMMIT);
    expect(calls.filter((c) => c[0] === "npm")).toEqual(
      RELEASE_PACKAGES.map((name) => ["npm", "view", `${name}@${V}`, "--json", "--prefer-online"]),
    );
    expect(calls.filter((c) => c[0] === "gh")).toEqual([
      ["gh", "api", "--hostname", "github.com", `repos/opum-ai/lore-cli/commits/refs/tags/v${V}`, "--jq", ".sha"],
    ]);
  });

  test("observeRelease never guesses: an unreadable package is absent, a missing tag is null", async () => {
    const observed = await observeRelease(V, RELEASE_PACKAGES, {
      execFile: async (file, args) => {
        if (file === "gh") throw Object.assign(new Error("x"), { stderr: "gh: No commit found (HTTP 422)" });
        if ((args[1] as string).startsWith("@opum-ai/lore-win32-x64@")) throw new Error("E404");
        if ((args[1] as string).startsWith("@opum-ai/lore-linux-x64@")) return { stdout: "[1, 2]" };
        const [name] = (args[1] as string).split(/@(?=[^@]*$)/);
        return { stdout: JSON.stringify({ dist: { integrity: integrity(tarballName(name as string, V)) } }) };
      },
    });
    expect(Object.keys(observed.integrities).length).toBe(5);
    expect(observed.commit).toBeNull();
    expect(observed.commitError).toBe("gh: No commit found (HTTP 422)");
    expect(observed.gitHead).toBeNull();
    const verdict = evaluate(goodReceipt(), observed);
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join("\n")).toContain(`opum-ai-lore-win32-x64-${V}.tgz: qualified`);
    expect(verdict.problems.join("\n")).toContain(`opum-ai-lore-linux-x64-${V}.tgz: qualified`);
  });
});
