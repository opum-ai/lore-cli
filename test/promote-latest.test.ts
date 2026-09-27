/**
 * promote-latest.test.ts — the `latest` move (LCLI-613, constitution Article 3 clause 5).
 *
 * scripts/promote-latest.mjs is driven end to end through its one injectable runner against an
 * in-memory registry, so every npm and gh call it makes is observed and none reaches a network.
 * Proven here: it refuses without a verifying pair receipt (each bad class), refuses unless all
 * seven packages are staged under release-candidate, records every prior `latest` to a file
 * BEFORE moving anything, moves platforms first and the launcher last, restores on a partial
 * failure, rolls back from the record, and --dry-run writes nothing.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { expectedTarballNames, PAIR_RECEIPT_KIND, RELEASE_PACKAGES, tarballName } from "../scripts/pair-receipt.mjs";
import { main, type PromotionRecord, RECORD_KIND, tokenShape } from "../scripts/promote-latest.mjs";

const V = "5.6.7";
const PRIOR = "5.6.6";
const COMMIT = "a".repeat(40);
const integrity = (name: string) => `sha512-${Buffer.from(name).toString("base64")}==`;
const FAST = { attempts: 1, delayMs: 0, sleep: async () => {} };

function goodReceipt(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    kind: PAIR_RECEIPT_KIND,
    pair: {
      lore: {
        version: V,
        commit: COMMIT,
        tarballs: Object.fromEntries(
          expectedTarballNames(V).map((n) => [n, { sha256: "c".repeat(64), distIntegrity: integrity(n) }]),
        ),
      },
      quest: { version: V, commit: "b".repeat(40), tarballs: {} },
    },
    installedFrom: { lore: { source: "registry" }, quest: { source: "registry" } },
    verdict: "QUALIFIED",
  };
}

/**
 * An in-memory registry + GitHub behind one runner. `calls` records every argv; `writes` only the
 * dist-tag writes. `failAdd` makes one package's latest move fail; `onAdd` runs before each write.
 */
function world(
  options: {
    receipt?: unknown;
    tags?: Record<string, Record<string, string>>;
    tagCommit?: string | null;
    failAdd?: string;
    onAdd?: () => void;
  } = {},
) {
  const tags: Record<string, Record<string, string>> = {};
  for (const name of RELEASE_PACKAGES)
    tags[name] = { latest: PRIOR, "release-candidate": V, ...(options.tags?.[name] ?? {}) };
  const calls: string[][] = [];
  const writes: string[] = [];
  const envs: Array<Record<string, string | undefined>> = [];
  const receipt = "receipt" in options ? options.receipt : goodReceipt();
  const run = async (command: string, args: string[], opts: Record<string, unknown> = {}) => {
    calls.push([command, ...args]);
    const line = [command, ...args].join(" ");
    if (command === "security") throw Object.assign(new Error("no keychain item"), { code: 44 });
    if (
      command === "gh" &&
      line ===
        `gh api --hostname github.com -H Accept: application/vnd.github.raw repos/opum-ai/opum-cli-e2e/contents/receipts/pair/${V}.json?ref=main`
    ) {
      if (receipt === undefined)
        throw Object.assign(new Error("Command failed"), { stderr: "gh: Not Found (HTTP 404)" });
      return { stdout: typeof receipt === "string" ? receipt : JSON.stringify(receipt) };
    }
    if (
      command === "gh" &&
      line === `gh api --hostname github.com repos/opum-ai/lore-cli/commits/refs/tags/v${V} --jq .sha`
    ) {
      const commit = "tagCommit" in options ? options.tagCommit : COMMIT;
      if (commit === null)
        throw Object.assign(new Error("Command failed"), { stderr: "gh: No commit found (HTTP 422)" });
      return { stdout: `${commit}\n` };
    }
    if (command === "npm" && args[0] === "view" && args[2] === "dist-tags") {
      const t = tags[args[1] as string];
      if (!t) throw new Error("E404");
      return { stdout: JSON.stringify([t]) };
    }
    if (command === "npm" && args[0] === "view" && args[2] === "--json") {
      const name = (args[1] as string).slice(0, (args[1] as string).lastIndexOf("@"));
      return { stdout: JSON.stringify([{ name, version: V, dist: { integrity: integrity(tarballName(name, V)) } }]) };
    }
    if (command === "npm" && args[0] === "dist-tag" && args[1] === "add") {
      options.onAdd?.();
      const spec = args[2] as string;
      const at = spec.lastIndexOf("@");
      const name = spec.slice(0, at);
      writes.push(args.join(" "));
      envs.push((opts.env ?? {}) as Record<string, string | undefined>);
      if (options.failAdd === name && spec.endsWith(`@${V}`)) throw new Error("E403 Forbidden");
      (tags[name] as Record<string, string>)[args[3] as string] = spec.slice(at + 1);
      return { stdout: "" };
    }
    throw new Error(`unexpected command in test: ${line}`);
  };
  return { run, tags, calls, writes, envs };
}

function harness() {
  const dir = mkdtempSync(resolve(tmpdir(), "lore-promote-"));
  const record = join(dir, "promotion-record.json");
  const out: string[] = [];
  const err: string[] = [];
  const go = (
    argv: string[],
    w: ReturnType<typeof world>,
    env: Record<string, string | undefined> = { NPM_TOKEN: "" },
  ) =>
    main(argv, {
      run: w.run,
      env,
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      readPackageVersion: async () => V,
      verifyOptions: FAST,
    });
  return {
    dir,
    record,
    out,
    err,
    go,
    text: () => [...out, ...err].join("\n"),
    readRecord: () => JSON.parse(readFileSync(record, "utf8")) as PromotionRecord,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("scripts/promote-latest.mjs: a verifying pair receipt", () => {
  test("--promote records every prior latest BEFORE moving anything, then moves platforms first, launcher last", async () => {
    const h = harness();
    // A holder, not a `let`: tsc narrows a `let` assigned only inside a closure to its initial null.
    const seen: { recordAtFirstWrite: boolean | null } = { recordAtFirstWrite: null };
    const w = world({
      onAdd: () => {
        seen.recordAtFirstWrite ??= existsSync(h.record);
      },
    });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      expect(seen.recordAtFirstWrite).toBe(true);
      expect(w.writes).toEqual(RELEASE_PACKAGES.map((name) => `dist-tag add ${name}@${V} latest`));
      expect(w.writes.at(-1)).toBe(`dist-tag add @opum-ai/lore@${V} latest`);
      const record = h.readRecord();
      expect(record.kind).toBe(RECORD_KIND);
      expect(record.version).toBe(V);
      expect(record.packages).toEqual(RELEASE_PACKAGES.map((name) => ({ name, priorLatest: PRIOR })));
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(V);
      // The prior values are printed as well as written.
      for (const name of RELEASE_PACKAGES) expect(h.out).toContain(`  ${name}  ${PRIOR}`);
      expect(h.text()).toContain(
        `Pair receipt opum-ai/opum-cli-e2e@main:receipts/pair/${V}.json qualifies lore ${V} with quest ${V}`,
      );
    } finally {
      h.cleanup();
    }
  });

  test("--dry-run reads everything, prints the record and each move, and changes NOTHING", async () => {
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--dry-run"], w)).toBe(0);
      expect(w.writes).toEqual([]);
      expect(existsSync(h.record)).toBe(false);
      for (const name of RELEASE_PACKAGES) {
        expect(h.out.join("\n")).toContain(`would    npm dist-tag add ${name}@${V} latest   (now ${PRIOR})`);
        expect(w.tags[name]?.latest).toBe(PRIOR);
      }
      expect(h.text()).toContain('"priorLatest": "5.6.6"');
      expect(h.text()).toContain("Dry run only: nothing was written and no tag moved.");
    } finally {
      h.cleanup();
    }
  });

  test("an override receipt proceeds and prints the override verbatim", async () => {
    const h = harness();
    const receipt = goodReceipt();
    receipt.verdict = "NOT QUALIFIED";
    receipt.override = { by: "op", reason: "unbound row", task: "TASK-9", adr: "docs/adr/x.md@abc" };
    try {
      expect(await h.go(["--record", h.record, "--dry-run"], world({ receipt }))).toBe(0);
      expect(h.text()).toContain("!!! QUALIFICATION OVERRIDE IN USE !!!");
      expect(h.text()).toContain('"reason": "unbound row"');
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs refuses without a verifying pair receipt", () => {
  const bad: Array<[string, Parameters<typeof world>[0], string]> = [
    [
      "no receipt (404)",
      { receipt: undefined },
      "no opum-cli-e2e pair receipt at opum-ai/opum-cli-e2e@main:receipts/pair/5.6.7.json (gh: Not Found (HTTP 404))",
    ],
    ["a malformed receipt", { receipt: "{ nope" }, "no opum-cli-e2e pair receipt at"],
    [
      "step 1: an unknown kind",
      { receipt: { ...goodReceipt(), kind: "opum.qualification-receipt.v1" } },
      "kind must be opum.pair-qualification-receipt.v1",
    ],
    [
      "step 2: NOT QUALIFIED, no override",
      { receipt: { ...goodReceipt(), verdict: "NOT QUALIFIED" } },
      'verdict is "NOT QUALIFIED"',
    ],
    [
      "step 2: a partial override",
      { receipt: { ...goodReceipt(), verdict: "NOT QUALIFIED", override: { by: "x", reason: "y" } } },
      "missing or empty: task, adr",
    ],
    [
      "step 3: another lore version",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: Record<string, unknown> } };
          r.pair.lore.version = "5.6.6";
          return r;
        })(),
      },
      'pair.lore.version is "5.6.6"',
    ],
    [
      "step 3: another quest version (a different pairing)",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { quest: Record<string, unknown> } };
          r.pair.quest.version = "5.6.8";
          return r;
        })(),
      },
      'pair.quest.version is "5.6.8"',
    ],
    ["step 3: a commit the tag does not peel to", { tagCommit: "e".repeat(40) }, `resolves to "${"e".repeat(40)}"`],
    ["step 3: no v<version> tag", { tagCommit: null }, "gh: No commit found (HTTP 422)"],
    [
      "installedFrom not the registry",
      { receipt: { ...goodReceipt(), installedFrom: { lore: { source: "candidate" } } } },
      'installedFrom.lore.source is "candidate"',
    ],
    [
      "step 4: a missing archive",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: { tarballs: Record<string, unknown> } } };
          delete r.pair.lore.tarballs[`opum-ai-lore-${V}.tgz`];
          return r;
        })(),
      },
      `opum-ai-lore-${V}.tgz: not in the pair receipt`,
    ],
    [
      "step 4: a digest npm does not serve",
      {
        receipt: (() => {
          const r = goodReceipt() as { pair: { lore: { tarballs: Record<string, unknown> } } };
          r.pair.lore.tarballs[`opum-ai-lore-linux-arm64-${V}.tgz`] = { distIntegrity: "sha512-else" };
          return r;
        })(),
      },
      "qualified sha512-else, npm serves",
    ],
  ];
  for (const [label, options, reason] of bad) {
    for (const mode of ["--promote", "--dry-run"] as const) {
      test(`${label} (${mode}): exit 1, no record written, no tag moved`, async () => {
        const h = harness();
        const w = world(options);
        try {
          expect(await h.go(["--record", h.record, mode], w)).toBe(1);
          expect(h.err.join("\n")).toContain(`Refusing to promote ${V}: no opum-cli-e2e pair receipt qualifies`);
          expect(h.err.join("\n")).toContain(reason);
          expect(w.writes).toEqual([]);
          expect(existsSync(h.record)).toBe(false);
          expect(w.calls.some((c) => c[0] === "security")).toBe(false);
        } finally {
          h.cleanup();
        }
      });
    }
  }
});

describe("scripts/promote-latest.mjs: the staging precondition and the record", () => {
  test("refuses unless ALL seven are staged at the version under release-candidate", async () => {
    const h = harness();
    const w = world({ tags: { "@opum-ai/lore-win32-x64": { "release-candidate": "5.6.6" } } });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.err.join("\n")).toContain(
        `@opum-ai/lore-win32-x64: release-candidate is "5.6.6", not ${V}; stage it with scripts/publish-release.sh first`,
      );
      expect(w.writes).toEqual([]);
      expect(existsSync(h.record)).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test("refuses to build a fresh record when latest already reads the version (a lost record)", async () => {
    const h = harness();
    const w = world({ tags: { "@opum-ai/lore": { latest: V } } });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(h.err.join("\n")).toContain(
        "latest already reads 5.6.7; a new record would store that as the prior value",
      );
      expect(w.writes).toEqual([]);
    } finally {
      h.cleanup();
    }
  });

  test("a partial failure restores every tag this run moved, and says to retry at the SAME version", async () => {
    const h = harness();
    const w = world({ failAdd: "@opum-ai/lore-linux-arm64" });
    try {
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(1);
      expect(w.writes).toEqual([
        `dist-tag add @opum-ai/lore-darwin-arm64@${V} latest`,
        `dist-tag add @opum-ai/lore-darwin-x64@${V} latest`,
        `dist-tag add @opum-ai/lore-linux-arm64@${V} latest`,
        `dist-tag add @opum-ai/lore-darwin-arm64@${PRIOR} latest`,
        `dist-tag add @opum-ai/lore-darwin-x64@${PRIOR} latest`,
      ]);
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(h.err.join("\n")).toContain("PROMOTION FAILED at @opum-ai/lore-linux-arm64");
      expect(h.err.join("\n")).toContain("never skip to a different number (Article 3 clause 5)");
    } finally {
      h.cleanup();
    }
  });

  test("--rollback restores every recorded prior latest, and is NOT gated on the pair receipt", async () => {
    const h = harness();
    const promoted = world();
    try {
      expect(await h.go(["--record", h.record, "--promote"], promoted)).toBe(0);
      // Later: quest's side failed and lore must be put back. The receipt is gone by now.
      const w = world({
        receipt: undefined,
        tags: Object.fromEntries(RELEASE_PACKAGES.map((n) => [n, { latest: V }])),
      });
      expect(await h.go(["--rollback", h.record], w)).toBe(0);
      expect(w.writes).toEqual(RELEASE_PACKAGES.map((name) => `dist-tag add ${name}@${PRIOR} latest`));
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(PRIOR);
      expect(w.calls.some((c) => c.join(" ").includes("receipts/pair"))).toBe(false);
    } finally {
      h.cleanup();
    }
  });

  test("a rerun reuses the first run's record: prior values are never re-read after a partial move", async () => {
    const h = harness();
    try {
      expect(await h.go(["--record", h.record, "--promote"], world({ failAdd: "@opum-ai/lore" }))).toBe(1);
      // The failure restored everything, but simulate a crash that left two moved: the registry now
      // says latest=V for those, and a fresh read would record V as their "prior".
      const first = h.readRecord();
      const w = world({
        tags: { "@opum-ai/lore-darwin-arm64": { latest: V }, "@opum-ai/lore-darwin-x64": { latest: V } },
      });
      expect(await h.go(["--record", h.record, "--promote"], w)).toBe(0);
      expect(h.readRecord()).toEqual(first);
      expect(h.text()).toContain("prior values are NOT re-read");
      for (const name of RELEASE_PACKAGES) expect(w.tags[name]?.latest).toBe(V);
    } finally {
      h.cleanup();
    }
  });

  test("a record for another release is refused, not reused", async () => {
    const h = harness();
    try {
      writeFileSync(h.record, JSON.stringify({ kind: RECORD_KIND, version: "1.0.0", packages: [] }));
      expect(await h.go(["--record", h.record, "--promote"], world())).toBe(1);
      expect(h.err.join("\n")).toContain('record is for "1.0.0", the release is 5.6.7');
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs: arguments and credentials", () => {
  test("says --dry-run or --promote, exactly one; --record is required", async () => {
    const h = harness();
    try {
      await expect(h.go(["--record", h.record], world())).rejects.toThrow("exactly one");
      await expect(h.go(["--record", h.record, "--dry-run", "--promote"], world())).rejects.toThrow("exactly one");
      await expect(h.go(["--promote"], world())).rejects.toThrow("--record <path> is required");
      await expect(h.go(["--record", h.record, "--promote", "--force"], world())).rejects.toThrow(
        "unknown argument: --force",
      );
    } finally {
      h.cleanup();
    }
  });

  test("a token goes to a private npmrc, only its shape is printed, and a bad shape moves nothing", async () => {
    const token = `npm_${"z".repeat(36)}`;
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--promote"], w, { NPM_TOKEN: token })).toBe(0);
      expect(h.text()).toContain("length=40 prefix=npm_ internal_whitespace=no");
      expect(h.text()).not.toContain(token);
      expect(w.envs.every((e) => typeof e.npm_config_userconfig === "string")).toBe(true);
      expect(existsSync(w.envs[0]?.npm_config_userconfig as string)).toBe(false);
    } finally {
      h.cleanup();
    }
    const h2 = harness();
    const w2 = world();
    try {
      await expect(h2.go(["--record", h2.record, "--promote"], w2, { NPM_TOKEN: "not-a-token" })).rejects.toThrow(
        "does not look like an npm token",
      );
      expect(w2.writes).toEqual([]);
      expect(tokenShape("npm_x y")).toEqual({ length: 7, prefix: "npm_", whitespace: true });
    } finally {
      h2.cleanup();
    }
  });

  test("with no token it uses ~/.npmrc and passes --otp to each move", async () => {
    const h = harness();
    const w = world();
    try {
      expect(await h.go(["--record", h.record, "--promote", "--otp", "123456"], w)).toBe(0);
      expect(w.writes[0]).toBe(`dist-tag add @opum-ai/lore-darwin-arm64@${V} latest --otp 123456`);
    } finally {
      h.cleanup();
    }
  });
});

describe("scripts/promote-latest.mjs as a command", () => {
  const describePosix = process.platform === "win32" ? describe.skip : describe;
  describePosix("with stubs on PATH", () => {
    test("the entrypoint wires the real runner: a missing receipt refuses with exit 1 and moves nothing", () => {
      const dir = mkdtempSync(resolve(tmpdir(), "lore-promote-cli-"));
      try {
        const bin = join(dir, "bin");
        const log = join(dir, "npm.log");
        Bun.spawnSync({ cmd: ["mkdir", "-p", bin] });
        writeFileSync(
          join(bin, "npm"),
          `#!/usr/bin/env bash\necho "$*" >> "${log}"\ncase "$*" in *dist-tag\\ add*) exit 0 ;; *dist-tags*) echo '{"latest":"${PRIOR}","release-candidate":"${V}"}' ;; *) echo '{}' ;; esac\n`,
        );
        writeFileSync(join(bin, "gh"), "#!/usr/bin/env bash\necho 'gh: Not Found (HTTP 404)' >&2\nexit 1\n");
        writeFileSync(join(bin, "security"), "#!/usr/bin/env bash\nexit 44\n");
        Bun.spawnSync({ cmd: ["chmod", "+x", join(bin, "npm"), join(bin, "gh"), join(bin, "security")] });
        const r = Bun.spawnSync({
          cmd: [
            "node",
            join(import.meta.dir, "..", "scripts", "promote-latest.mjs"),
            "--record",
            join(dir, "rec.json"),
            "--promote",
            "--version",
            V,
          ],
          env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, NPM_TOKEN: "" },
        });
        expect(r.exitCode).toBe(1);
        expect(r.stderr.toString()).toContain("gh: Not Found (HTTP 404)");
        expect(readFileSync(log, "utf8")).not.toContain("dist-tag add");
        expect(existsSync(join(dir, "rec.json"))).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("with no arguments it exits 2 and names what it needs", () => {
      const r = Bun.spawnSync({ cmd: ["node", join(import.meta.dir, "..", "scripts", "promote-latest.mjs")] });
      expect(r.exitCode).toBe(2);
      expect(r.stderr.toString()).toContain("--record <path> is required");
    });
  });
});
