/**
 * agents.test.ts — `lore agents` (LORE-36): the SKILL.md + CLAUDE.md-nudge agent bridge.
 *
 * The two acceptance criteria are exercised directly:
 *   AC#1 — re-running makes no changes (idempotent): a second run reports `unchanged` and touches
 *          zero bytes; `--check` on a current bridge exits 0, on a stale one exits 6.
 *   AC#2 — SKILL.md stays small and points at `lore instructions`.
 *
 * Plus the bridge's load-bearing guarantees: the CLAUDE.md nudge is a managed block that never
 * clobbers surrounding prose or an unrelated block; `--force` overwrites a differing (hand-edited)
 * SKILL.md while the default leaves it `protected`; and — guarding the exact LORE-37 failure mode —
 * the generated content names only commands the real dispatcher actually handles.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { commandHandlerNames, run } from "../src/cli";
import { type AgentsResult, applyAgentsBridge, bridgeActionColor, runAgents } from "../src/commands/agents";
import {
  buildNudgeBody,
  buildSkillDoc,
  CLAUDE_MD_REL_PATH,
  LORE_COMMANDS,
  planBridge,
  SKILL_REL_PATH,
} from "../src/core/agent-bridge";
import {
  AGENTS_MD_REL_PATH,
  buildCodexNudgeBody,
  buildCodexSkillDoc,
  CODEX_AGENT_BLOCK_LABEL,
  CODEX_SKILL_REL_PATH,
} from "../src/core/codex-bridge";
import { upsertManagedBlock } from "../src/core/managed-block";
import { ANSI, LoreError } from "../src/errors";
import type { OutputContext } from "../src/output";
import { capture } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-agents-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Run `agents` in JSON mode and return the parsed `data` payload plus the exit code. */
function agents(args: string[] = []): { code: number; result: AgentsResult } {
  const stdout = capture();
  const code = runAgents({ root, output: JSON_CTX, args, stdout });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: AgentsResult };
  expect(envelope.kind).toBe("agents.result");
  return { code, result: envelope.data };
}

/** The action recorded for a given repo-relative path in a result. */
function actionFor(result: AgentsResult, path: string): string | undefined {
  return result.files.find((file) => file.path === path)?.action;
}

const skillAbs = (): string => join(root, SKILL_REL_PATH);
const claudeAbs = (): string => join(root, CLAUDE_MD_REL_PATH);

describe("generated content (AC#2) — small, grounded, points at `lore instructions`", () => {
  test("buildSkillDoc is deterministic (timestamp-free) so re-generation is byte-identical", () => {
    expect(buildSkillDoc()).toBe(buildSkillDoc());
  });

  test("SKILL.md carries the skill frontmatter and points the agent at `lore instructions`", () => {
    const skill = buildSkillDoc();
    expect(skill.startsWith("---\nname: lore\n")).toBe(true);
    expect(skill).toContain("lore instructions");
    expect(skill).toContain("source of truth");
  });

  test("SKILL.md surfaces self-committing commands before canonical workflow steps", () => {
    const skill = buildSkillDoc();
    const preflight = skill.indexOf("## Commit-side-effect preflight");
    const start = skill.indexOf("## Start here");
    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(start);
    for (const command of ["link", "unlink", "rename", "sync"]) {
      expect(skill.slice(preflight, start)).toContain(`\`lore ${command}\``);
    }
    expect(skill.slice(preflight, start)).toContain("explicit commit authority");
  });

  test("the CLAUDE.md nudge points at both the skill and `lore instructions`", () => {
    const nudge = buildNudgeBody();
    expect(nudge).toContain(SKILL_REL_PATH);
    expect(nudge).toContain("lore instructions");
  });

  test("generated guidance routes cross-repository work through workspace instructions", () => {
    const skill = buildSkillDoc();
    expect(skill).toContain("multi-repository workspaces");
    expect(skill).toContain("`workspace`");
    expect(buildNudgeBody()).toContain("`workspace`");
  });

  test("generated content names every real command and NOTHING unshipped (the LORE-37 trap)", () => {
    const skill = buildSkillDoc();
    for (const cmd of LORE_COMMANDS) {
      expect(skill).toContain(`\`${cmd.name}\``);
    }
    // The bridge must never teach a command the router does not dispatch (the LORE-37 phantom trap).
    const shipped = new Set(LORE_COMMANDS.map((c) => c.name));
    for (const phantom of ["obsidian-scaffold-does-not-exist"]) {
      expect(shipped.has(phantom)).toBe(false);
      expect(skill).not.toContain(`\`${phantom}\``);
    }
  });
});

describe("planBridge (pure) — write disciplines", () => {
  test("a fresh repo plans to create both files with their generated bytes", () => {
    const plan = planBridge({ skillOnDisk: null, claudeOnDisk: null, force: false, check: false });
    const skill = plan.files.find((f) => f.path === SKILL_REL_PATH);
    const claude = plan.files.find((f) => f.path === CLAUDE_MD_REL_PATH);
    expect(skill?.action).toBe("created");
    expect(skill?.contents).toBe(buildSkillDoc());
    expect(claude?.action).toBe("created");
    expect(claude?.contents).toContain("<!-- lore:agents:begin -->");
  });

  test("applying the plan then re-planning yields `unchanged` for both (idempotent)", () => {
    const first = planBridge({ skillOnDisk: null, claudeOnDisk: null, force: false, check: false });
    const skillBytes = first.files.find((f) => f.path === SKILL_REL_PATH)?.contents ?? null;
    const claudeBytes = first.files.find((f) => f.path === CLAUDE_MD_REL_PATH)?.contents ?? null;
    const second = planBridge({ skillOnDisk: skillBytes, claudeOnDisk: claudeBytes, force: false, check: false });
    expect(second.files.every((f) => f.action === "unchanged")).toBe(true);
    expect(second.files.every((f) => f.contents === null)).toBe(true);
  });

  test("a differing SKILL.md is `protected` without --force and `updated` with it", () => {
    const edited = `${buildSkillDoc()}\nhand edit`;
    const withoutForce = planBridge({ skillOnDisk: edited, claudeOnDisk: null, force: false, check: false });
    expect(withoutForce.files.find((f) => f.path === SKILL_REL_PATH)?.action).toBe("protected");
    expect(withoutForce.files.find((f) => f.path === SKILL_REL_PATH)?.contents).toBeNull();

    const withForce = planBridge({ skillOnDisk: edited, claudeOnDisk: null, force: true, check: false });
    expect(withForce.files.find((f) => f.path === SKILL_REL_PATH)?.action).toBe("updated");
    expect(withForce.files.find((f) => f.path === SKILL_REL_PATH)?.contents).toBe(buildSkillDoc());
  });

  test("LORE-129: `--check --force` still reports `protected`, never `updated` — a check never writes", () => {
    const edited = `${buildSkillDoc()}\nhand edit`;
    const checkedAndForced = planBridge({ skillOnDisk: edited, claudeOnDisk: null, force: true, check: true });
    const skill = checkedAndForced.files.find((f) => f.path === SKILL_REL_PATH);
    expect(skill?.action).toBe("protected");
    expect(skill?.contents).toBeNull();
  });
});

describe("lore agents — fresh generation (AC#1)", () => {
  test("creates both bridge files and exits 0", () => {
    const { code, result } = agents();
    expect(code).toBe(0);
    expect(actionFor(result, SKILL_REL_PATH)).toBe("created");
    expect(actionFor(result, CLAUDE_MD_REL_PATH)).toBe("created");
    expect(readFileSync(skillAbs(), "utf8")).toBe(buildSkillDoc());
    expect(readFileSync(claudeAbs(), "utf8")).toContain("<!-- lore:agents:begin -->");
  });
});

describe("lore agents — refuses to write through a symlinked ancestor directory (LORE-93)", () => {
  // POSIX-only, matching this codebase's existing symlink tests' own skip guard (e.g. init.test.ts).
  test.skipIf(process.platform === "win32")(
    "regression: a symlinked .claude/skills/lore refuses, writes neither bridge file (AC#3)",
    () => {
      // Note on AC#5 coverage: this does NOT independently discriminate the preflight sweep
      // (assertNoSymlinkInAnyPath) from ensureDir's own per-call guard alone — `plan.files`
      // (core/agent-bridge.ts) always orders SKILL.md first, and SKILL.md's own directory is the
      // one symlinked here, so ensureDir's reactive guard already throws on the very first loop
      // iteration regardless of whether the sweep runs at all. The describe block directly below
      // this one ("the up-front sweep, not ensureDir's reactive guard, catches a NON-FIRST target
      // (LORE-266)") is what exercises the sweep's ordering property for `lore agents`: it symlinks
      // CLAUDE.md — the SECOND target — and (verified by neutering the sweep directly) without it,
      // SKILL.md (the FIRST target) gets written and the CLAUDE.md symlink itself gets destroyed —
      // not "followed" to write outside the repo, but replaced outright, since writeFileAtomic's
      // renameSync commit blows away whatever already sits at the destination path, symlink or
      // not. That replacement is exactly the failure the sweep exists to prevent, so see that
      // describe block for the ordering-property coverage. test/rename.test.ts's own AC#5 test
      // proves the same ordering property for `lore rename`, but only as of this same branch: its
      // symlinked fixture destination was renamed from "evil" to "zzz-evil" (see that test's own
      // comment) specifically so the bad target sorts AFTER the legitimate rewrite in write order —
      // before that reorder, the test was non-discriminating under mutation, same as this one still
      // is here.
      const outsideDir = mkdtempSync(join(tmpdir(), "lore-agents-outside-"));
      try {
        mkdirSync(join(root, ".claude/skills"), { recursive: true });
        symlinkSync(outsideDir, join(root, ".claude/skills/lore"));
        let thrown: unknown;
        try {
          runAgents({ root, output: JSON_CTX, args: [], stdout: capture() });
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(LoreError);
        expect((thrown as LoreError).type).toBe("conflict");
        expect(existsSync(join(outsideDir, "SKILL.md"))).toBe(false);
        expect(existsSync(claudeAbs())).toBe(false);
      } finally {
        rmSync(outsideDir, { recursive: true, force: true });
      }
    },
  );
});

describe("lore agents — the up-front sweep, not ensureDir's reactive guard, catches a NON-FIRST target (LORE-266)", () => {
  // POSIX-only, matching this codebase's existing symlink tests' own skip guard.
  test.skipIf(process.platform === "win32")(
    "a symlink at CLAUDE.md (the SECOND bridge target) refuses before SKILL.md (the FIRST target) is ever written",
    () => {
      // core/agent-bridge.ts's planBridge always orders `files` as [SKILL.md, CLAUDE.md]. A fresh
      // repo (this test's default tmpdir) plans to CREATE both, so both are non-null targets for
      // assertNoSymlinkInAnyPath. Planting the symlink at CLAUDE.md — the SECOND target — means
      // ensureDir's own per-call guard (which only checks each file's PARENT directory, one file at
      // a time, as the write loop reaches it) would let SKILL.md's write proceed first, before the
      // loop ever reaches CLAUDE.md at all: ensureDir(root, ".") for CLAUDE.md's parent never
      // inspects the CLAUDE.md leaf itself, and writeFileAtomic's own commit `renameSync` replaces
      // whatever sits at the destination (symlink or not) without erroring. Only a preflight sweep
      // over the WHOLE planned write set, run BEFORE the loop starts, can refuse before SKILL.md is
      // written at all — the property this test discriminates, which the LORE-93 regression test
      // just above this describe block explicitly could NOT: there, the symlinked ancestor sits
      // under SKILL.md itself (the FIRST target), so ensureDir's own reactive guard already throws
      // on the very first loop iteration regardless of whether the sweep runs at all.
      symlinkSync(join(root, "this-target-does-not-exist"), claudeAbs());

      let thrown: unknown;
      try {
        runAgents({ root, output: JSON_CTX, args: [], stdout: capture() });
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(LoreError);
      expect((thrown as LoreError).type).toBe("conflict"); // exit 5 (cli-contract §5.3 / EXIT_CODES.conflict)

      // The whole point (distinguishing the up-front sweep from ensureDir's reactive guard): the
      // FIRST target, SKILL.md, must never have been written — even though it sorts before
      // CLAUDE.md in plan.files and has nothing wrong with its own path.
      expect(existsSync(skillAbs())).toBe(false);
      // The CLAUDE.md symlink itself is untouched — neither followed nor replaced.
      expect(lstatSync(claudeAbs()).isSymbolicLink()).toBe(true);
    },
  );
});

describe("lore agents — idempotent re-run (AC#1)", () => {
  test("a second run reports `unchanged` for both and touches zero bytes", () => {
    agents();
    const skillBefore = readFileSync(skillAbs(), "utf8");
    const claudeBefore = readFileSync(claudeAbs(), "utf8");

    const { code, result } = agents();
    expect(code).toBe(0);
    expect(actionFor(result, SKILL_REL_PATH)).toBe("unchanged");
    expect(actionFor(result, CLAUDE_MD_REL_PATH)).toBe("unchanged");
    expect(readFileSync(skillAbs(), "utf8")).toBe(skillBefore);
    expect(readFileSync(claudeAbs(), "utf8")).toBe(claudeBefore);
  });
});

describe("lore agents — --check (the CI drift gate)", () => {
  test("exits 0 on a current bridge and writes nothing", () => {
    agents();
    const skillBefore = readFileSync(skillAbs(), "utf8");
    const { code } = agents(["--check"]);
    expect(code).toBe(0);
    expect(readFileSync(skillAbs(), "utf8")).toBe(skillBefore);
  });

  test("exits 6 on a stale bridge and still writes nothing", () => {
    agents();
    const stale = `${buildSkillDoc()}\ndrifted`;
    writeFileSync(skillAbs(), stale);
    const { code } = agents(["--check"]);
    expect(code).toBe(6);
    // A --check run must not repair the drift it reports.
    expect(readFileSync(skillAbs(), "utf8")).toBe(stale);
  });

  test("exits 6 when a bridge file is missing entirely", () => {
    agents();
    rmSync(skillAbs());
    expect(agents(["--check"]).code).toBe(6);
  });

  test("does not force the plan: a hand-edited SKILL.md is `protected` (consistent with force:false), not `updated`", () => {
    // Regression: forcing the plan under --check reported action `updated` alongside force:false and
    // printed an inert "run `lore agents`" remedy that leaves the file protected (permanently-red CI).
    agents();
    writeFileSync(skillAbs(), `${buildSkillDoc()}\nhand edit`);
    const { code, result } = agents(["--check"]);
    expect(code).toBe(6);
    expect(result.force).toBe(false);
    expect(actionFor(result, SKILL_REL_PATH)).toBe("protected");
  });

  test("LORE-271: protected drift names the file and --force need without relying on colour", () => {
    agents();
    writeFileSync(skillAbs(), `${buildSkillDoc()}\nhand edit`);

    const plainOut = capture();
    runAgents({ root, output: PLAIN_CTX, args: ["--check"], stdout: plainOut });
    expect(plainOut.lines()).toContain(`out-of-date-protected ${SKILL_REL_PATH}`);

    const prettyOut = capture();
    runAgents({ root, output: { mode: "pretty", color: false }, args: ["--check"], stdout: prettyOut });
    expect(prettyOut.lines()).toContain(`  out of date (protected; needs --force) ${SKILL_REL_PATH}`);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting NO ANSI escape is present.
    expect(prettyOut.text()).not.toMatch(/\x1b\[/);
  });

  test("LORE-129: `--check --force` together still report `protected` and recommend `--force`, not the inert plain remedy", () => {
    // Regression: `--check --force` against a hand-edited SKILL.md used to report action `updated`
    // (a --check run writes nothing, so that falsely claimed a write) and, because no file was ever
    // `protected`, the trailer fell through to "run `lore agents`" — a remedy that leaves the file
    // protected again on a real, non-forced run, so the drift (and CI-red) would never clear.
    agents();
    writeFileSync(skillAbs(), `${buildSkillDoc()}\nhand edit`);
    const before = readFileSync(skillAbs(), "utf8");

    const { code, result } = agents(["--check", "--force"]);
    expect(code).toBe(6);
    expect(result.force).toBe(true);
    expect(actionFor(result, SKILL_REL_PATH)).toBe("protected");
    // Still read-only: --check must not write even when --force is also given.
    expect(readFileSync(skillAbs(), "utf8")).toBe(before);

    const stdout = capture();
    runAgents({ root, output: PLAIN_CTX, args: ["--check", "--force"], stdout });
    const plain = stdout.text();
    expect(plain).toContain("lore agents --force");
    expect(plain).not.toMatch(/run `lore agents` to regenerate/);
  });
});

describe("lore agents — --force vs. the default protection", () => {
  test("a hand-edited SKILL.md is left untouched by default (protected) and overwritten by --force", () => {
    agents();
    const handEdited = `${buildSkillDoc()}\nmy customization`;
    writeFileSync(skillAbs(), handEdited);

    const def = agents();
    expect(def.code).toBe(0);
    expect(actionFor(def.result, SKILL_REL_PATH)).toBe("protected");
    expect(readFileSync(skillAbs(), "utf8")).toBe(handEdited);

    const forced = agents(["--force"]);
    expect(forced.code).toBe(0);
    expect(actionFor(forced.result, SKILL_REL_PATH)).toBe("updated");
    expect(readFileSync(skillAbs(), "utf8")).toBe(buildSkillDoc());
  });
});

describe("lore agents — CLAUDE.md nudge is a non-clobbering managed block", () => {
  test("inserts the lore block into an existing CLAUDE.md, preserving an unrelated block and prose", () => {
    const existing = [
      "# Project memory",
      "",
      "<!-- BACKLOG.MD GUIDELINES START -->",
      "Use the backlog CLI.",
      "<!-- BACKLOG.MD GUIDELINES END -->",
      "",
      "Hand-authored prose.",
      "",
    ].join("\n");
    writeFileSync(claudeAbs(), existing);

    const { result } = agents();
    expect(actionFor(result, CLAUDE_MD_REL_PATH)).toBe("updated");
    const after = readFileSync(claudeAbs(), "utf8");
    expect(after).toContain(
      "<!-- BACKLOG.MD GUIDELINES START -->\nUse the backlog CLI.\n<!-- BACKLOG.MD GUIDELINES END -->",
    );
    expect(after).toContain("Hand-authored prose.");
    expect(after).toContain("<!-- lore:agents:begin -->");
    // And it is idempotent from this seeded state.
    expect(agents().result.files.find((f) => f.path === CLAUDE_MD_REL_PATH)?.action).toBe("unchanged");
  });

  test("a malformed lore:agents marker pair in CLAUDE.md is a fail-loud validation error (exit 6)", () => {
    writeFileSync(claudeAbs(), "<!-- lore:agents:begin -->\nx\n<!-- lore:agents:begin -->\n<!-- lore:agents:end -->\n");
    let thrown: unknown;
    try {
      runAgents({ root, output: JSON_CTX, args: [], stdout: capture() });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoreError);
    expect((thrown as LoreError).type).toBe("validation");
  });
});

describe("lore agents — preserves the on-disk BOM/EOL convention (LORE-128)", () => {
  test("refreshing the managed block in a CRLF + BOM CLAUDE.md keeps the rest of the file CRLF + BOM", () => {
    // A stale block (drift) so this run is a real `updated`, not a no-write `unchanged`.
    const bodyLines = [
      "# Project memory",
      "",
      "<!-- lore:agents:begin -->",
      "stale",
      "<!-- lore:agents:end -->",
      "",
      "Hand-authored prose.",
      "",
    ];
    const crlf = bodyLines.join("\r\n");
    const withBom = `﻿${crlf}`;
    writeFileSync(claudeAbs(), withBom);

    const { result } = agents();
    expect(actionFor(result, CLAUDE_MD_REL_PATH)).toBe("updated");

    const afterRaw = readFileSync(claudeAbs(), "utf8");
    // The whole file — not just the surrounding prose — keeps the original BOM and CRLF, including
    // the freshly-written managed block itself: no bare `\n` anywhere, and CRLF count matches `\n` count.
    expect(afterRaw.startsWith("﻿")).toBe(true);
    const bare = afterRaw.slice(1);
    const lfCount = (bare.match(/\n/g) ?? []).length;
    const crlfCount = (bare.match(/\r\n/g) ?? []).length;
    expect(crlfCount).toBe(lfCount);
    expect(bare.startsWith("# Project memory\r\n")).toBe(true); // sanity: still readable text
    expect(bare).toContain("Hand-authored prose.\r\n");
    expect(bare).toContain("<!-- lore:agents:begin -->\r\n");
    expect(bare).not.toContain("stale");
    // Idempotent from this refreshed state too: a second run reports unchanged and touches nothing.
    const before = readFileSync(claudeAbs(), "utf8");
    const second = agents();
    expect(actionFor(second.result, CLAUDE_MD_REL_PATH)).toBe("unchanged");
    expect(readFileSync(claudeAbs(), "utf8")).toBe(before);
  });

  test("a plain LF/no-BOM CLAUDE.md is unaffected (no spurious CRLF/BOM introduced)", () => {
    writeFileSync(claudeAbs(), "# Project memory\n\nHand-authored prose.\n");
    const { result } = agents();
    expect(actionFor(result, CLAUDE_MD_REL_PATH)).toBe("updated");
    const after = readFileSync(claudeAbs(), "utf8");
    expect(after.startsWith("﻿")).toBe(false);
    expect(after).not.toContain("\r\n");
  });
});

describe("lore agents — output rendering", () => {
  test("plain mode lists one `<action> <path>` line per file", () => {
    const stdout = capture();
    runAgents({ root, output: PLAIN_CTX, args: [], stdout });
    const lines = stdout.lines();
    expect(lines).toContain(`created ${SKILL_REL_PATH}`);
    expect(lines).toContain(`created ${CLAUDE_MD_REL_PATH}`);
  });

  test("--json emits the agents.result envelope", () => {
    const stdout = capture();
    runAgents({ root, output: JSON_CTX, args: [], stdout });
    const envelope = JSON.parse(stdout.text()) as { schemaVersion: number; kind: string };
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.kind).toBe("agents.result");
  });
});

describe("lore agents — pretty-mode colour is pinned per BridgeAction (LORE-267, AC#1-3)", () => {
  test("bridgeActionColor maps every BridgeAction exactly: created/updated green, unchanged dim, protected yellow", () => {
    // Exhaustive over agent-bridge.ts's BridgeAction union (created | updated | unchanged |
    // protected). This test only pins today's four values; the guard against a *future* action
    // added to the union without a mapping update is a compile-time one — `bridgeActionColor`
    // (src/commands/agents.ts) is backed by a `Record<BridgeAction, string>`, so `bun run
    // typecheck` fails (TS2741, missing property) the moment the union grows and this object
    // literal doesn't, before any test ever runs. `lore init`'s renderer (init.ts) imports this
    // exact function, so pinning it here also pins init's colour — the two commands cannot
    // diverge again (AC#3).
    expect(bridgeActionColor("created")).toBe(ANSI.green);
    expect(bridgeActionColor("updated")).toBe(ANSI.green);
    expect(bridgeActionColor("unchanged")).toBe(ANSI.dim);
    expect(bridgeActionColor("protected")).toBe(ANSI.yellow);
  });

  test("a hand-edited SKILL.md renders `protected` in yellow, never green, under pretty+color (AC#1)", () => {
    mkdirSync(join(root, ".claude/skills/lore"), { recursive: true });
    writeFileSync(skillAbs(), "hand-edited, not lore-generated\n");

    const stdout = capture();
    runAgents({ root, output: { mode: "pretty", color: true }, args: [], stdout });
    const text = stdout.text();
    // ANSI.yellow is \x1b[33m, ANSI.green is \x1b[32m — the exact bug LORE-267 fixes: `protected`
    // used to fall through the old two-way `unchanged`-or-green split and paint green (success),
    // reading as though the stale, hand-edited file were fine.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence.
    expect(text).toMatch(/\x1b\[33mprotected\x1b\[0m/);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence is ABSENT.
    expect(text).not.toMatch(/\x1b\[32mprotected\x1b\[0m/);
  });

  test("created and unchanged keep their own colours — no unintended recolouring (AC#2)", () => {
    const first = capture();
    runAgents({ root, output: { mode: "pretty", color: true }, args: [], stdout: first });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence.
    expect(first.text()).toMatch(/\x1b\[32mcreated\x1b\[0m/);

    // Re-run against the now-current bridge: every file reports `unchanged`.
    const second = capture();
    runAgents({ root, output: { mode: "pretty", color: true }, args: [], stdout: second });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence.
    expect(second.text()).toMatch(/\x1b\[2munchanged\x1b\[0m/);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting the exact ANSI sequence is ABSENT.
    expect(second.text()).not.toMatch(/\x1b\[32munchanged\x1b\[0m/);
  });

  test("colour is suppressed on a non-TTY run regardless of action (LORE-250 discipline)", () => {
    mkdirSync(join(root, ".claude/skills/lore"), { recursive: true });
    writeFileSync(skillAbs(), "hand-edited, not lore-generated\n");

    const stdout = capture();
    runAgents({ root, output: { mode: "pretty", color: false }, args: [], stdout });
    const text = stdout.text();
    expect(text).toContain("protected");
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting NO ANSI escape is present.
    expect(text).not.toMatch(/\x1b\[/);
  });
});

describe("lore agents — argument validation", () => {
  test("a positional argument is a usage error (exit 2)", () => {
    const err = usageError(["nope"]);
    expect(err.type).toBe("usage");
    expect(err.message).toContain("takes no arguments");
  });

  test("an unknown flag is a usage error (exit 2)", () => {
    expect(usageError(["--bogus"]).type).toBe("usage");
  });

  /** Run `agents` with `args` and return the {@link LoreError} it throws. */
  function usageError(args: string[]): LoreError {
    try {
      runAgents({ root, output: JSON_CTX, args, stdout: capture() });
    } catch (err) {
      if (err instanceof LoreError) {
        return err;
      }
      throw err;
    }
    throw new Error("expected a LoreError, but runAgents returned");
  }
});

describe("command-surface lockstep — the bridge names only real commands", () => {
  /** Drive the real router for `argv` in an empty cwd, returning captured stderr. */
  async function runCli(argv: string[]): Promise<string> {
    const stderr = capture();
    const cwd = mkdtempSync(join(tmpdir(), "lore-agents-probe-"));
    try {
      await run(["bun", "lore", ...argv], { cwd, stdout: capture(), stderr, isTTY: false, env: {} });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
    return stderr.text();
  }

  test("the probe is valid: an unknown command DOES report `unknown command`", async () => {
    expect(await runCli(["definitely-not-a-command"])).toContain("unknown command");
  });

  test("every command the bridge advertises is dispatched by the real router (not a phantom)", async () => {
    for (const cmd of LORE_COMMANDS) {
      // A bogus flag reaches (or is rejected by) the command itself — never the router's
      // `unknown command` path, which only fires for an unrecognized subcommand name.
      const stderr = await runCli([cmd.name, "--zzz-not-a-real-flag"]);
      expect(stderr).not.toContain("unknown command");
    }
  });

  test("every real Commander handler is advertised by the bridge (not omitted, LORE-142)", () => {
    const dispatched = commandHandlerNames();
    expect(dispatched.length).toBeGreaterThan(10);
    const advertised = new Set(LORE_COMMANDS.map((c) => c.name));
    for (const name of dispatched) {
      expect(advertised.has(name)).toBe(true);
    }
  });
});

describe("lore agents — the codex bridge is covered too, but only where one already exists (LCLI-364)", () => {
  /**
   * The gap this closes: `lore agents --check` gated ONLY the Claude bridge, and no workflow
   * referenced codex at all, so `.codex/skills/lore/SKILL.md` and AGENTS.md's managed block could
   * drift from their generators indefinitely. That is not hypothetical — AGENTS.md was found
   * missing the `workspace` topic on 2026-08-29 (LCLI-362) while CLAUDE.md, which HAS a gate, was
   * current. One artifact enumerated and checked, its twin not, and the green check on the first
   * reading as coverage of both.
   *
   * The load-bearing constraint is the CONDITIONAL: a repository that never opted into Codex has
   * no `.codex/` tree and no `lore:agents` block in AGENTS.md, and must stay at exit 0. Checking
   * unconditionally would report `created` — drift — for every Claude-only repository and turn a
   * real gate into one everybody disables. Presence, not absence, is what arms the codex half.
   */
  const codexSkillAbs = (): string => join(root, CODEX_SKILL_REL_PATH);
  const agentsMdAbs = (): string => join(root, AGENTS_MD_REL_PATH);

  /** Lay down a current codex bridge beside the Claude one. */
  function withCodexBridge(): void {
    mkdirSync(dirname(codexSkillAbs()), { recursive: true });
    writeFileSync(codexSkillAbs(), buildCodexSkillDoc());
    writeFileSync(
      agentsMdAbs(),
      upsertManagedBlock("", { label: CODEX_AGENT_BLOCK_LABEL, body: buildCodexNudgeBody() }),
    );
  }

  test("a Claude-only repository is untouched and stays at exit 0 — no codex file is reported or created", () => {
    agents();
    const { code, result } = agents(["--check"]);
    expect(code).toBe(0);
    expect(result.files.some((f) => f.path === CODEX_SKILL_REL_PATH)).toBe(false);
    expect(result.files.some((f) => f.path === AGENTS_MD_REL_PATH)).toBe(false);
    expect(existsSync(codexSkillAbs())).toBe(false);
    expect(existsSync(agentsMdAbs())).toBe(false);
  });

  test("applyAgentsBridge does NOT touch codex by default — `lore init --claude` is a scoped request", () => {
    // Caught by the docker E2E harness, not by this suite, on the first version of LCLI-364:
    // `lore init --claude` shares applyAgentsBridge, and covering codex unconditionally made a
    // scoped "set up the Claude bridge" request report and regenerate files the user never asked
    // about. The E2E case LCLI-298 AC3 pins that file list to exactly the two Claude files, and it
    // went red. `lore init --codex` owns the other half; only `lore agents` wants both.
    agents();
    withCodexBridge();
    const scoped = applyAgentsBridge({ root, force: false, check: true });
    expect(scoped.files.map((f) => f.path).sort()).toEqual([CLAUDE_MD_REL_PATH, SKILL_REL_PATH].sort());
    // ...while `lore agents` itself, which means "the bridges are current", does cover both.
    expect(agents(["--check"]).result.files.length).toBe(4);
  });

  test("a current codex bridge is reported unchanged and the run stays at exit 0", () => {
    agents();
    withCodexBridge();
    const { code, result } = agents(["--check"]);
    expect(code).toBe(0);
    expect(actionFor(result, CODEX_SKILL_REL_PATH)).toBe("unchanged");
    expect(actionFor(result, AGENTS_MD_REL_PATH)).toBe("unchanged");
  });

  test("a drifted AGENTS.md managed block fails the gate at exit 6 and NAMES AGENTS.md", () => {
    // This is the exact defect LCLI-362 found by hand: the block loses a topic the generator emits.
    agents();
    withCodexBridge();
    const drifted = readFileSync(agentsMdAbs(), "utf8").replace(", `workspace`", "");
    expect(drifted).not.toBe(readFileSync(agentsMdAbs(), "utf8")); // the edit actually landed
    writeFileSync(agentsMdAbs(), drifted);
    const { code, result } = agents(["--check"]);
    expect(code).toBe(6);
    expect(actionFor(result, AGENTS_MD_REL_PATH)).not.toBe("unchanged");
    // ...and reports it without repairing it.
    expect(readFileSync(agentsMdAbs(), "utf8")).toBe(drifted);
  });

  test("a drifted .codex SKILL.md fails the gate at exit 6 and names that file", () => {
    agents();
    withCodexBridge();
    writeFileSync(codexSkillAbs(), `${buildCodexSkillDoc()}\ndrifted`);
    const { code, result } = agents(["--check"]);
    expect(code).toBe(6);
    expect(actionFor(result, CODEX_SKILL_REL_PATH)).not.toBe("unchanged");
  });

  test("a plain run regenerates a drifted AGENTS.md block, so the gate has a remedy that works", () => {
    agents();
    withCodexBridge();
    const current = readFileSync(agentsMdAbs(), "utf8");
    writeFileSync(agentsMdAbs(), current.replace(", `workspace`", ""));
    expect(agents().code).toBe(0);
    expect(readFileSync(agentsMdAbs(), "utf8")).toBe(current);
    expect(agents(["--check"]).code).toBe(0);
  });

  test("a --check run leaves NO untracked files behind: it must compare, never regenerate in place", () => {
    // A check implemented by shelling out to `lore init --codex` would create .lore/profile.toml
    // and friends as a side effect (observed 2026-08-29). Assert the codex tree is exactly what
    // was laid down -- the check adds nothing.
    agents();
    withCodexBridge();
    const before = readdirSync(join(root, ".codex/skills/lore")).sort();
    agents(["--check"]);
    expect(readdirSync(join(root, ".codex/skills/lore")).sort()).toEqual(before);
    expect(existsSync(join(root, ".lore/profile.toml"))).toBe(false);
  });
});
