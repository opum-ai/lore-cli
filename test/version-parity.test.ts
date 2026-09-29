/**
 * version-parity.test.ts — constitution Article 3 clause 6 (LCLI-613).
 *
 * "Each CLI's release workflow refuses to publish when the two version numbers differ." lore's
 * check is scripts/version-parity.mjs, the mirror of quest-cli's
 * scripts/qualification/version-parity.mjs. Three things are proven here:
 *
 *   1. The verdict, with a stubbed reader: a match passes; a mismatch, each read-failure class
 *      and a wrong package name refuse.
 *   2. The READ is pinned: host, media type, repository, path and ref, via the argv it builds.
 *   3. It is quest's RULE. quest's own file is vendored verbatim (test/fixtures/quest-cli/), its
 *      git blob id re-derived from the bytes, and both implementations are run over the same
 *      inputs. A divergence in what either accepts fails here.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import {
  checkVersionParity,
  PEER,
  type PeerRead,
  peerReadArgs,
  readPeerVersion,
  requireVersionParity,
} from "../scripts/version-parity.mjs";

const SCRIPT = join(import.meta.dir, "..", "scripts", "version-parity.mjs");
const QUEST_FIXTURE = join(import.meta.dir, "fixtures", "quest-cli", "version-parity.mjs");
// quest-cli main eb1d9f46, scripts/qualification/version-parity.mjs, introduced by 481f4654 (#308).
//
// RE-VENDOR WHEN QCLI-404 LANDS (LCLI-637, AC5). The fixture is still byte-for-byte upstream's
// blob, so nothing here diverges from quest-cli — what has diverged is lore's own script: the
// fixture's is-main guard (line 117) is the old `resolve(argv[1]) === fileURLToPath(import.meta.url)`,
// which lore replaced with scripts/is-main.mjs on LCLI-637, and quest-cli has not fixed its twin
// yet. Measured 2026-09-28 by ref, three readings rather than one inference (LCLI-637 review F3 —
// a task file sitting in tasks/ is consistent with a fix that landed without the record moving, so
// the record is not the decisive read): the QCLI-404 record is `status: "To Do"` in
// `.quest/tasks/`; `gh api repos/opum-ai/quest-cli/git/trees/dev?recursive=1 --jq .truncated`
// answers `false`, so that listing really is complete; and quest-cli's own
// `scripts/qualification/version-parity.mjs` has blob 249c28dc at BOTH dev and main, still
// carrying the old guard. It is invisible to this file, which only IMPORTS the fixture and never
// runs it as a CLI. When QCLI-404 lands, re-vendor the fixture from the fixing commit and update
// QUEST_BLOB with it.
const QUEST_BLOB = "249c28dc19525d17f799cfd0ec9d0481998d62a6";
const SOURCE = "opum-ai/quest-cli@main:package.json";

type ExecFile = (file: string, args: string[]) => Promise<{ stdout: string }>;

/** A reader answering with `stdout`, or failing the way execFile does. */
function answering(stdout: string): ExecFile {
  return async () => ({ stdout });
}
function failing(error: Error & { stderr?: string; code?: string }): ExecFile {
  return async () => {
    throw error;
  };
}
const execError = (message: string, stderr?: string, code?: string) =>
  Object.assign(new Error(message), stderr === undefined ? {} : { stderr }, code === undefined ? {} : { code });

describe("scripts/version-parity.mjs: the verdict", () => {
  const read = (version: string | null, error?: string): PeerRead =>
    version === null ? { version, source: SOURCE, error: error ?? "x" } : { version, source: SOURCE };

  test("a match passes and names both versions, both refs and the clause", () => {
    const v = checkVersionParity({ version: "1.2.3", versionSource: "lore-side ref", peerRead: read("1.2.3") });
    expect(v.ok).toBe(true);
    expect(v.problem).toBeNull();
    expect(v.message).toBe(`lore 1.2.3 (lore-side ref) and quest 1.2.3 (${SOURCE}) are one version (Article 3.6).`);
  });

  test("a mismatch refuses and names both versions, both refs and the clause", () => {
    const v = checkVersionParity({ version: "1.2.3", versionSource: "lore-side ref", peerRead: read("1.2.4") });
    expect(v.ok).toBe(false);
    expect(v.problem).toBe(
      `lore is 1.2.3 (lore-side ref) but quest is 1.2.4 (${SOURCE}); Article 3.6: lore and quest publish at one version, or not at all`,
    );
  });

  test("an unread peer refuses rather than assumes", () => {
    const v = checkVersionParity({ version: "1.2.3", peerRead: read(null, "HTTP 404") });
    expect(v.ok).toBe(false);
    expect(v.problem).toBe(
      `quest's version could not be read from ${SOURCE} (HTTP 404); Article 3.6 refuses rather than assumes`,
    );
  });

  test("a lore side with no version refuses even against a real quest version", () => {
    expect(checkVersionParity({ version: undefined, peerRead: read("1.2.3") }).ok).toBe(false);
  });

  test("requireVersionParity reads through the injected reader and nothing else", async () => {
    let calls = 0;
    const verdict = await requireVersionParity({
      version: "2.0.0",
      read: async () => {
        calls++;
        return read("2.0.0");
      },
    });
    expect(calls).toBe(1);
    expect(verdict.ok).toBe(true);
  });
});

describe("scripts/version-parity.mjs: the read, with a stubbed gh", () => {
  test("the read is pinned: gh, github.com, the raw media type, quest-cli's package.json at main", async () => {
    const seen: Array<{ file: string; args: string[] }> = [];
    await readPeerVersion({
      execFile: async (file, args) => {
        seen.push({ file, args });
        return { stdout: JSON.stringify({ name: "@opum-ai/quest", version: "1.0.0" }) };
      },
    });
    expect(seen).toEqual([
      {
        file: "gh",
        args: [
          "api",
          "--hostname",
          "github.com",
          "-H",
          "Accept: application/vnd.github.raw",
          "repos/opum-ai/quest-cli/contents/package.json?ref=main",
        ],
      },
    ]);
    expect(peerReadArgs()).toEqual(seen[0]?.args as string[]);
    expect(PEER).toEqual({ repository: "opum-ai/quest-cli", ref: "main", packageName: "@opum-ai/quest" });
  });

  test("a well-formed @opum-ai/quest package.json yields its version", async () => {
    const r = await readPeerVersion({
      execFile: answering(JSON.stringify({ name: "@opum-ai/quest", version: "0.11.0" })),
    });
    expect(r).toEqual({ version: "0.11.0", source: SOURCE });
  });

  // Every read-failure class: each must come back version:null with a reason, never thrown and
  // never defaulted, and each must then REFUSE through the verdict.
  const failures: Array<[string, ExecFile, string]> = [
    ["a 404", failing(execError("Command failed", "gh: Not Found (HTTP 404)\nmore")), "gh: Not Found (HTTP 404)"],
    ["a 403", failing(execError("Command failed", "gh: Forbidden (HTTP 403)")), "gh: Forbidden (HTTP 403)"],
    [
      "a network failure",
      failing(execError("Command failed", "error connecting to api.github.com")),
      "error connecting",
    ],
    ["no gh on PATH", failing(execError("spawn gh ENOENT", undefined, "ENOENT")), "spawn gh ENOENT"],
    ["malformed JSON", answering("{ not json"), "JSON"],
    ["an empty body", answering(""), "JSON"],
    ["JSON null", answering("null"), "names package undefined, not @opum-ai/quest"],
    ["a JSON array", answering("[]"), "names package undefined, not @opum-ai/quest"],
    [
      "another package's manifest",
      answering(JSON.stringify({ name: "@opum-ai/lore", version: "0.11.0" })),
      'names package "@opum-ai/lore", not @opum-ai/quest',
    ],
    ["an unscoped quest", answering(JSON.stringify({ name: "quest", version: "0.11.0" })), 'names package "quest"'],
    ["a missing version", answering(JSON.stringify({ name: "@opum-ai/quest" })), "carries no version"],
    ["an empty version", answering(JSON.stringify({ name: "@opum-ai/quest", version: "" })), "carries no version"],
    ["a numeric version", answering(JSON.stringify({ name: "@opum-ai/quest", version: 11 })), "carries no version"],
  ];
  for (const [label, execFile, reason] of failures) {
    test(`${label} reads as no version, and refuses`, async () => {
      const peerRead = await readPeerVersion({ execFile });
      expect(peerRead.version).toBeNull();
      expect(peerRead.source).toBe(SOURCE);
      expect(peerRead.error).toContain(reason);
      const verdict = checkVersionParity({ version: "0.11.0", peerRead });
      expect(verdict.ok).toBe(false);
      expect(verdict.problem).toContain("Article 3.6 refuses rather than assumes");
    });
  }
});

describe("scripts/version-parity.mjs is quest-cli's rule (Article 3: ONE mechanism)", () => {
  test("the vendored oracle is byte-for-byte quest-cli's blob 249c28dc", () => {
    const bytes = readFileSync(QUEST_FIXTURE);
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    expect(blob).toBe(QUEST_BLOB);
  });

  test("both implementations reach the same verdict on every combination of inputs", async () => {
    const quest = (await import(QUEST_FIXTURE)) as {
      checkVersionParity: (a: { version: unknown; peerRead: PeerRead }) => { ok: boolean };
      readPeerVersion: (o: { peer: unknown; execFile: ExecFile }) => Promise<PeerRead>;
    };
    const versions = ["0.11.0", "0.11.1", "0.11.0-rc.1", "", " 0.11.0", undefined];
    const reads: PeerRead[] = [
      { version: null, source: SOURCE, error: "x" },
      ...["0.11.0", "0.11.1", "0.11.0-rc.1", "v0.11.0"].map((version) => ({ version, source: SOURCE })),
    ];
    const outcomes: boolean[] = [];
    for (const version of versions)
      for (const peerRead of reads) {
        const ours = checkVersionParity({ version, peerRead });
        const theirs = quest.checkVersionParity({ version, peerRead });
        expect([version, peerRead.version, ours.ok]).toEqual([version, peerRead.version, theirs.ok]);
        outcomes.push(ours.ok);
      }
    // A positive control on the matrix itself: every case ran, and both verdicts actually occur,
    // so agreement is not the trivial agreement of two functions that always say no.
    expect(outcomes.length).toBe(versions.length * reads.length);
    expect(outcomes.filter(Boolean).length).toBe(3);
    expect(outcomes.filter((ok) => !ok).length).toBeGreaterThan(0);

    // The reader too: quest's readPeerVersion, pointed at the same peer through the same stub,
    // accepts and refuses exactly what lore's does.
    const bodies = [
      JSON.stringify({ name: "@opum-ai/quest", version: "0.11.0" }),
      JSON.stringify({ name: "@opum-ai/lore", version: "0.11.0" }),
      JSON.stringify({ name: "@opum-ai/quest" }),
      JSON.stringify({ name: "@opum-ai/quest", version: "" }),
      JSON.stringify({ name: "@opum-ai/quest", version: 1 }),
      "null",
      "{ nope",
    ];
    for (const body of bodies) {
      const ours = await readPeerVersion({ execFile: answering(body) });
      const theirs = await quest.readPeerVersion({ peer: PEER, execFile: answering(body) });
      expect([body, ours.version]).toEqual([body, theirs.version]);
    }
  });
});

describe("scripts/version-parity.mjs as a command", () => {
  function withGh(body: string | null) {
    const root = mkdtempSync(resolve(tmpdir(), "lore-parity-"));
    const bin = resolve(root, "bin");
    mkdirSync(bin);
    writeFileSync(
      resolve(bin, "gh"),
      body === null
        ? "#!/usr/bin/env bash\necho 'gh: Not Found (HTTP 404)' >&2\nexit 1\n"
        : `#!/usr/bin/env bash\ncat <<'JSON'\n${body}\nJSON\n`,
    );
    chmodSync(resolve(bin, "gh"), 0o755);
    const run = (args: string[], env: Record<string, string> = {}) => {
      const r = Bun.spawnSync({
        cmd: ["node", SCRIPT, ...args],
        env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, ...env },
      });
      return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
    };
    return { run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
  }
  const describePosix = process.platform === "win32" ? describe.skip : describe;

  describePosix("with a stub gh on PATH", () => {
    test("--version names the lore side; a match exits 0", () => {
      const gh = withGh(JSON.stringify({ name: "@opum-ai/quest", version: "7.7.7" }));
      try {
        const r = gh.run(["--require", "--version", "7.7.7"]);
        expect(r.code).toBe(0);
        expect(r.stdout).toContain("lore 7.7.7 (the version publish-release.sh is publishing) and quest 7.7.7");
      } finally {
        gh.cleanup();
      }
    });

    test("a mismatch exits 1 with 'Refusing to publish'", () => {
      const gh = withGh(JSON.stringify({ name: "@opum-ai/quest", version: "7.7.8" }));
      try {
        const r = gh.run(["--require", "--version", "7.7.7"]);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("Refusing to publish: lore is 7.7.7");
      } finally {
        gh.cleanup();
      }
    });

    test("with no --version it compares this checkout's package.json, naming the ref it read", () => {
      const own = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).version as string;
      const gh = withGh(JSON.stringify({ name: "@opum-ai/quest", version: own }));
      try {
        const r = gh.run(["--require"], {
          GITHUB_SHA: "a".repeat(40),
          GITHUB_REF_NAME: "v-test",
          GITHUB_REPOSITORY: "opum-ai/lore-cli",
        });
        expect(r.code).toBe(0);
        expect(r.stdout).toContain(`lore ${own} (package.json at opum-ai/lore-cli@v-test (${"a".repeat(12)}))`);
      } finally {
        gh.cleanup();
      }
    });

    test("a 404 exits 1 and no environment variable changes that", () => {
      const gh = withGh(null);
      try {
        const r = gh.run(["--require", "--version", "7.7.7"], {
          SKIP_VERSION_PARITY: "1",
          VERSION_PARITY: "off",
          GH_HOST: "evil.example",
        });
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("gh: Not Found (HTTP 404)");
      } finally {
        gh.cleanup();
      }
    });

    test("without --require it refuses to run at all (exit 2), and --version needs a value", () => {
      const gh = withGh(JSON.stringify({ name: "@opum-ai/quest", version: "7.7.7" }));
      try {
        expect(gh.run([]).code).toBe(2);
        expect(gh.run(["--require", "--version"]).code).toBe(2);
      } finally {
        gh.cleanup();
      }
    });
  });
});
