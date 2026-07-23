import { describe, expect, test } from "bun:test";
import { run } from "../src/cli";
import { type InstructionsData, type InstructionsOptions, runInstructions } from "../src/commands/instructions";
import { INSTRUCTION_TOPICS } from "../src/core/instructions";
import type { OutputContext } from "../src/output";
import { capture, expectError } from "./helpers";

const JSON_CTX: OutputContext = { mode: "json", color: false };
const PLAIN_CTX: OutputContext = { mode: "plain", color: false };

/** Run `instructions` in JSON mode and return the parsed `data` payload plus the exit code. */
function instructions(
  args: string[],
  options?: Partial<InstructionsOptions>,
): { code: number; data: InstructionsData } {
  const stdout = capture();
  const code = runInstructions({ output: JSON_CTX, args, stdout, ...options });
  const envelope = JSON.parse(stdout.text()) as { kind: string; data: InstructionsData };
  expect(envelope.kind).toBe("instructions.text");
  return { code, data: envelope.data };
}

describe("core/instructions — topic registry", () => {
  test("overview is first and every key is unique", () => {
    expect(INSTRUCTION_TOPICS[0]?.key).toBe("overview");
    const keys = INSTRUCTION_TOPICS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("the overview body lists every detail topic's key", () => {
    const overview = INSTRUCTION_TOPICS.find((t) => t.key === "overview");
    for (const topic of INSTRUCTION_TOPICS.filter((t) => t.key !== "overview")) {
      expect(overview?.body).toContain(topic.key);
    }
  });

  test("linking topic no longer claims link/unlink leave backlog/tasks uncommitted for sync", () => {
    const linking = INSTRUCTION_TOPICS.find((t) => t.key === "linking");
    const normalized = linking?.body.replace(/\s+/g, " ") ?? "";
    // LORE-146: link.ts's runLink/runUnlink now call `commitBacklogFiles` themselves, so the old
    // "edit but do not commit; only `lore sync` commits it" claim must be gone.
    expect(normalized).not.toContain("do not commit it");
    expect(normalized).not.toContain("let `lore sync` commit them");
    // The replacement prose must say link/unlink commit their own edits (scoped to the touched
    // files, via `commitBacklogFiles`) and that `lore sync`'s commit step is now just a catch-all
    // sweep for anything else left dirty under `backlog/`.
    expect(normalized).toContain("commit those edits themselves");
    expect(normalized).toContain("commitBacklogFiles");
    expect(normalized).toContain("catch-all sweep");
  });

  test("check topic enumerates all of check's throw cases, not just usage/not_found", () => {
    const check = INSTRUCTION_TOPICS.find((t) => t.key === "check");
    const normalized = check?.body.replace(/\s+/g, " ") ?? "";
    // LORE-147: expandRoot (src/commands/check.ts) also throws `denied` for an unreadable
    // bundle root, and reconciliation (reconcile-shared.ts's resolveReconcileConfig /
    // gatherReconciliation) can throw `validation` for a malformed status flow/overrides and
    // `not_found` for a linked task id that no longer exists. The old claim that usage/not_found
    // are the ONLY throwing cases must be gone.
    expect(normalized).not.toContain("are the only cases that");
    // The replacement prose must name every throw case lore check can actually raise.
    expect(normalized).toContain("`usage`");
    expect(normalized).toContain("`not_found`");
    expect(normalized).toContain("`denied`");
    expect(normalized).toContain("`validation`");
    // ...with the exit codes that back cli-contract.md's exit table (errors.ts's EXIT_CODES).
    expect(normalized).toContain("exit 2");
    expect(normalized).toContain("exit 3");
    expect(normalized).toContain("exit 4");
    expect(normalized).toContain("exit 6");
  });

  test("check topic's validation cause names corrupted managed-block markers, not just reconcile-config timing", () => {
    const check = INSTRUCTION_TOPICS.find((t) => t.key === "check");
    const normalized = check?.body.replace(/\s+/g, " ") ?? "";
    // LORE-190: reconcileDriftFindings (core/check.ts's regenerateTaskBlock call) also throws
    // `validation` when a concept's managed-block markers are corrupted -- per-concept, AFTER that
    // concept's own tasks are already resolved. The old prose attributed `validation` solely to "a
    // malformed status flow or override in the reconcile config, thrown before any task
    // resolution", omitting the marker-corruption cause and wrongly implying that timing holds for
    // every `validation` throw check can raise.
    expect(normalized).not.toContain(
      "a malformed status flow or override in the reconcile config, thrown before any task resolution",
    );
    // The replacement prose must name the marker-corruption cause explicitly, and must place its
    // timing AFTER task resolution (the opposite of the old blanket claim).
    expect(normalized).toContain("managed-block markers");
    expect(normalized).toContain("already resolved");
  });
});

describe("runInstructions — topic resolution", () => {
  test("no args defaults to the overview topic", () => {
    const { code, data } = instructions([]);
    expect(code).toBe(0);
    expect(data.topic).toBe("overview");
    expect(data.body).toContain("canonical");
  });

  test("`overview` explicitly is the same as no args", () => {
    const { data } = instructions(["overview"]);
    expect(data.topic).toBe("overview");
  });

  test("each detail topic resolves to its own body", () => {
    for (const key of ["linking", "sync", "check", "validation"]) {
      const { code, data } = instructions([key]);
      expect(code).toBe(0);
      expect(data.topic).toBe(key);
      expect(data.body.length).toBeGreaterThan(0);
    }
  });

  test("the data payload always carries the full topic index", () => {
    const { data } = instructions(["check"]);
    expect(data.topics.map((t) => t.key)).toEqual(INSTRUCTION_TOPICS.map((t) => t.key));
  });

  test("an unknown topic is a not_found error whose hint lists the valid keys", () => {
    const err = expectError("not_found", () => runInstructions({ output: JSON_CTX, args: ["bogus"] }));
    expect(err.message).toContain("bogus");
    expect(err.hint).toContain("overview");
    expect(err.hint).toContain("linking");
  });
});

describe("runInstructions — argument parsing (usage errors)", () => {
  test("an unknown flag is a usage error", () => {
    expectError("usage", () => runInstructions({ output: JSON_CTX, args: ["--bogus"] }));
  });

  test("a second positional is a usage error", () => {
    expectError("usage", () => runInstructions({ output: JSON_CTX, args: ["sync", "extra"] }));
  });
});

describe("runInstructions — output modes", () => {
  test("--plain renders ANSI-free text with the title and body", () => {
    const stdout = capture();
    const code = runInstructions({ output: PLAIN_CTX, args: ["check"], stdout });
    expect(code).toBe(0);
    const text = stdout.text();
    expect(text).not.toContain("\x1b[");
    expect(text).toContain("lore check");
  });
});

describe("cli — instructions wiring", () => {
  function argv(...args: string[]): string[] {
    return ["bun", "lore", ...args];
  }

  test("`lore instructions` runs through the router and exits 0", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("instructions"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(0);
    expect(stdout.text().length).toBeGreaterThan(0);
  });

  test("`lore instructions <bogus>` exits 3 through the router", () => {
    const stdout = capture();
    const stderr = capture();
    const code = run(argv("instructions", "bogus"), { stdout, stderr, isTTY: false, env: {} });
    expect(code).toBe(3);
  });

  test("`lore --help` lists the instructions command", () => {
    const stdout = capture();
    const stderr = capture();
    run(argv("--help"), { stdout, stderr, isTTY: false, env: {} });
    expect(stdout.text()).toContain("instructions");
  });
});
