/**
 * cli-exit-flush.test.ts — `process.exit()` after `run()` does not truncate large piped
 * `--json` output (LORE-70).
 *
 * `run()`'s own in-process tests (`cli.test.ts`) inject `stdout`/`stderr`, so they never
 * exercise `cli.ts`'s `import.meta.main` block — the real entrypoint that used to call
 * `process.exit(code)` immediately after `run()` resolved. Writes to a real pipe are async;
 * exiting before they drain silently truncates output while still reporting exit 0. This
 * suite spawns the real `bun src/cli.ts` entrypoint as a subprocess and reproduces the bug's
 * own shape: piped through a **separate downstream process** (`sh -c "... | cat"`), not
 * Bun.spawnSync's own `stdout: "pipe"` capture directly on the CLI — the direct-capture
 * reader drains fast enough from the first byte that the race this bug depends on (the
 * pipe's consumer not yet reading when the CLI writes and exits) never triggers, so a test
 * built that way would pass even against the unfixed code. Verified against pre-fix `cli.ts`
 * (`git stash`): all three commands below truncated at exactly 65536 bytes with invalid JSON
 * and exit code 0 — the exact silent-corruption shape AC1 describes.
 *
 * POSIX-only, same as `bin-lore.test.ts`'s subprocess suite: `sh -c "... | cat"` needs a real
 * POSIX shell/pipe, and the bug itself is a POSIX pipe-buffer/async-write race with no
 * equivalent Windows named-pipe behavior to pin down.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_ENTRY = join(import.meta.dir, "..", "src", "cli.ts");

/** Comfortably above the ~64KB pipe-buffer size the truncation bug cuts output at. */
const PIPE_BUFFER_BYTES = 65536;

/** The hub concept's body length — alone enough to exceed {@link PIPE_BUFFER_BYTES} many times over. */
const HUB_BODY_LEN = 300_000;
const SPOKE_COUNT = 80;
/** Each spoke's `title`/`summary` length — large enough that `SPOKE_COUNT` of them exceed {@link PIPE_BUFFER_BYTES}. */
const SPOKE_FIELD_LEN = 4_000;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-cli-exit-flush-"));
  const docsDir = join(root, "docs");
  const spokesDir = join(docsDir, "spokes");
  mkdirSync(spokesDir, { recursive: true });

  // One concept whose full body alone exceeds the pipe buffer — feeds the `context` case
  // (the target's full body is always emitted verbatim, never trimmed).
  writeFileSync(join(docsDir, "hub.md"), `---\ntype: Reference\ntitle: Hub\n---\n${"h".repeat(HUB_BODY_LEN)}\n`);

  // Many concepts with a long title/summary — feeds the `graph` (title per node) and `query`
  // (title + snippet per hit) cases, each tagged so a single `--tag` filter selects all of them.
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const n = String(i).padStart(3, "0");
    const field = String.fromCharCode(97 + (i % 26)).repeat(SPOKE_FIELD_LEN);
    writeFileSync(
      join(spokesDir, `spoke-${n}.md`),
      `---\ntype: Reference\ntags:\n  - bulk\ntitle: "${field}"\nsummary: "${field}"\n---\nSpoke ${n} body.\n`,
    );
  }
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Run the real `cli.ts` entrypoint as a subprocess, piped through a downstream `cat` — the
 * shape that reproduces LORE-70 (see module docstring for why a direct `stdout: "pipe"`
 * capture on the CLI itself does not). stderr is discarded: large `title`/`summary` fields
 * trip the bundle's own advisory length warnings, which are expected noise here, not signal.
 */
function runCliThroughPipe(args: readonly string[]): { code: number; stdout: string } {
  const quoted = [CLI_ENTRY, ...args].map((a) => JSON.stringify(a)).join(" ");
  const proc = Bun.spawnSync(["sh", "-c", `bun ${quoted} | cat`], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { code: proc.exitCode, stdout: proc.stdout.toString("utf8") };
}

describe.skipIf(process.platform === "win32")(
  "cli entrypoint — large piped --json output is not truncated (LORE-70)",
  () => {
    test("graph --json: whole-bundle export", () => {
      const { code, stdout } = runCliThroughPipe(["graph", "--json"]);
      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);

      const envelope = JSON.parse(stdout) as { kind: string; data: { nodes: { id: string; title?: string }[] } };
      expect(envelope.kind).toBe("graph.export");
      expect(envelope.data.nodes).toHaveLength(SPOKE_COUNT + 1);
      const spokeNode = envelope.data.nodes.find((n) => n.id === "spokes/spoke-000");
      expect(spokeNode?.title).toHaveLength(SPOKE_FIELD_LEN);
    });

    test("query --json: matches exceeding the limit", () => {
      const { code, stdout } = runCliThroughPipe(["query", "--tag", "bulk", "--limit", "1000", "--json"]);
      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(PIPE_BUFFER_BYTES);

      const envelope = JSON.parse(stdout) as {
        kind: string;
        data: { hits: { id: string; title?: string; snippet?: string }[]; total: number; shown: number };
      };
      expect(envelope.kind).toBe("query.results");
      expect(envelope.data.total).toBe(SPOKE_COUNT);
      expect(envelope.data.shown).toBe(SPOKE_COUNT);
      expect(envelope.data.hits).toHaveLength(SPOKE_COUNT);
      const hit = envelope.data.hits.find((h) => h.id === "spokes/spoke-079");
      expect(hit?.title).toHaveLength(SPOKE_FIELD_LEN);
      expect(hit?.snippet).toHaveLength(SPOKE_FIELD_LEN);
    });

    test("context --json: a target whose full body alone exceeds the pipe buffer", () => {
      const { code, stdout } = runCliThroughPipe(["context", "hub", "--depth", "0", "--json"]);
      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(HUB_BODY_LEN);

      const envelope = JSON.parse(stdout) as { kind: string; data: { target: { body: string } } };
      expect(envelope.kind).toBe("context.export");
      // The body is exactly `HUB_BODY_LEN` "h"s plus a trailing newline stripped/kept verbatim by
      // the parser — assert the full run of "h"s survived intact rather than pinning the exact
      // trailing-newline handling, which is a concept-body parsing concern, not this bug's.
      expect(envelope.data.target.body.startsWith("h".repeat(HUB_BODY_LEN))).toBe(true);
    });
  },
);
