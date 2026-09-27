/**
 * link-quest-race.test.ts — LCLI-614 against the REAL installed `quest` binary.
 *
 * opum-cli-e2e's "same-value competing removal" row (suites/40-cross-product.mjs, TASK-90) races
 * `lore unlink` against a concurrent `quest task edit --remove-label doc:<id>` on the same record.
 * The scheduler decides who wins there; this test removes the scheduler and pins the losing
 * interleaving deterministically: the real Quest adapter reads the task (and its revision), then —
 * between that read and lore's guarded edit — the competing writer's exact command runs against
 * the same workspace. Quest 0.10.0 then answers lore's stale `--if-revision` with exit-6
 * `validation` ("no entry matches") rather than exit-5 `conflict`, which is the defect lore must
 * absorb: the unlink has to end `already-absent`, exit 0.
 *
 * Skipped when no `quest` is on PATH. CI's `lint · typecheck · test` job installs none, so this runs
 * on a workstation (and wherever quest is installed), never as a CI gate; the stub-adapter tests in
 * link.test.ts are the gate.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BacklogAdapter, EditTaskPatch } from "../src/adapters/backlog";
import { createQuestAdapter } from "../src/adapters/quest";
import { type LinkOptions, runLink, runUnlink, type UnlinkReport } from "../src/commands/link";
import { EXIT_OK, LoreError } from "../src/errors";
import { capture, cleanGitSpawn } from "./helpers";

const questBinary = Bun.which("quest");
const HUMAN = ["--actor", "lcli-614-test", "--actor-kind", "human"] as const;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lore-quest-race-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(cmd: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync([...cmd], { cwd: root, stdout: "pipe", stderr: "pipe" });
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

function quest(args: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  return run([questBinary as string, ...args]);
}

describe("lore unlink vs a same-value competing removal, real quest (LCLI-614)", () => {
  test.skipIf(questBinary === null)(
    "the edit that loses the race is retried and the unlink ends already-absent, exit 0",
    async () => {
      expect(run(["git", "init", "-q", "."]).exitCode).toBe(0);
      expect(quest(["init", "--json"]).exitCode).toBe(0);
      const created = quest(["task", "create", "Race target", "--label", "doc:stories/x", ...HUMAN, "--json"]);
      expect(created.exitCode).toBe(0);
      const taskId = (JSON.parse(created.stdout) as { data: { id: string } }).data.id;

      mkdirSync(join(root, "docs", "stories"), { recursive: true });
      writeFileSync(join(root, "docs", "stories", "x.md"), `---\ntype: Story\ntasks:\n  - ${taskId}\n---\nBody.\n`);

      const real = createQuestAdapter(root, { actor: { id: "lcli-614-test", kind: "human" } });
      const editErrors: unknown[] = [];
      const sentPatches: EditTaskPatch[] = [];
      let competitorExit: number | undefined;
      const adapter: BacklogAdapter = {
        ...real,
        async editTask(id: string, patch: EditTaskPatch): Promise<void> {
          sentPatches.push(patch);
          if (competitorExit === undefined) {
            // The competing writer lands between lore's read and its write -- the harness's exact
            // competitor command, against the same record and the same label.
            competitorExit = quest([
              "task",
              "edit",
              id,
              "--remove-label",
              "doc:stories/x",
              ...HUMAN,
              "--json",
            ]).exitCode;
          }
          try {
            await real.editTask(id, patch);
          } catch (error) {
            editErrors.push(error);
            throw error;
          }
        },
      };

      const stdout = capture();
      const code = await runUnlink({
        root,
        output: { mode: "json", color: false },
        args: ["stories/x", taskId],
        stdout,
        stderr: capture(),
        adapter,
        gitSpawn: cleanGitSpawn(),
        backend: "quest",
      });

      // The race was genuinely lost: the competitor won, and lore's guarded edit was refused. The
      // refusal's type is what Quest reports (0.10.0: `validation`; a fixed Quest: `conflict`) --
      // recorded rather than pinned, so a Quest fix does not turn this into a false red.
      expect(competitorExit).toBe(0);
      expect(sentPatches[0]?.ifRevision).toBeString();
      expect(editErrors).toHaveLength(1);
      expect(editErrors[0]).toBeInstanceOf(LoreError);
      expect(["validation", "conflict"]).toContain((editErrors[0] as LoreError).type);

      expect(code).toBe(EXIT_OK);
      const report = (JSON.parse(stdout.text()) as { data: UnlinkReport }).data;
      expect(report.tasks).toEqual([{ task: taskId, status: "removed", backRef: "already-absent" }]);
      const labels = (JSON.parse(quest(["task", "view", taskId, "--json"]).stdout) as { data: { labels: string[] } })
        .data.labels;
      expect(labels).not.toContain("doc:stories/x");
    },
    30_000,
  );

  test.skipIf(questBinary === null)(
    "the competitor wins BEFORE lore reads (label gone, --doc left): unlink exits 0 with no write",
    async () => {
      // The interleaving that actually failed the harness row: `lore link` writes label + --doc,
      // the competitor removes only the label, and lore's read lands after it -- so the revision
      // lore sends is current and nothing raced. Before LCLI-614, unlink still asked Quest to
      // remove the absent label and Quest failed it loudly (QCLI-297).
      expect(run(["git", "init", "-q", "."]).exitCode).toBe(0);
      expect(quest(["init", "--json"]).exitCode).toBe(0);
      const created = quest(["task", "create", "Race target", ...HUMAN, "--json"]);
      expect(created.exitCode).toBe(0);
      const taskId = (JSON.parse(created.stdout) as { data: { id: string } }).data.id;
      mkdirSync(join(root, "docs", "stories"), { recursive: true });
      writeFileSync(join(root, "docs", "stories", "x.md"), "---\ntype: Story\n---\nBody.\n");

      const adapter = createQuestAdapter(root, { actor: { id: "lcli-614-test", kind: "human" } });
      const base = (args: string[]): LinkOptions => ({
        root,
        output: { mode: "json", color: false },
        args,
        stdout: capture(),
        stderr: capture(),
        adapter,
        gitSpawn: cleanGitSpawn(),
        backend: "quest",
      });
      const view = () =>
        (
          JSON.parse(quest(["task", "view", taskId, "--json"]).stdout) as {
            data: { labels: string[]; documentation: string[]; revision: string };
          }
        ).data;

      // A real, now-guarded `lore link` against real quest.
      expect(await runLink(base(["stories/x", taskId]))).toBe(EXIT_OK);
      expect(view().labels).toContain("doc:stories/x");
      expect(view().documentation).toContain("docs/stories/x.md");

      expect(quest(["task", "edit", taskId, "--remove-label", "doc:stories/x", ...HUMAN, "--json"]).exitCode).toBe(0);

      const revisionBefore = view().revision;

      const stdout = capture();
      const code = await runUnlink({ ...base(["stories/x", taskId]), stdout });

      expect(code).toBe(EXIT_OK);
      const report = (JSON.parse(stdout.text()) as { data: UnlinkReport }).data;
      // The label is gone and the only doc entry cannot be cleared by --doc, so there is nothing
      // to send: `already-absent`, with no write at all (N1) -- Quest's revision is unmoved.
      expect(report.tasks[0]?.backRef).toBe("already-absent");
      expect(view().labels).not.toContain("doc:stories/x");
      expect(view().revision).toBe(revisionBefore);
    },
    30_000,
  );

  test.skipIf(questBinary === null)(
    "an unrelated write to ANOTHER task does not turn a missing-actor refusal into a retry (SF1: revision is workspace-wide)",
    async () => {
      // The review's reproduction: `lore unlink <gone> T-1 --allow-missing` with no actor, while
      // something edits only T-2. Quest's revision is workspace-wide, so T-1's viewed revision moves;
      // converting on that alone reported "task T-1 changed ..." as drift instead of the LCLI-459
      // actor-context validation error.
      expect(run(["git", "init", "-q", "."]).exitCode).toBe(0);
      expect(quest(["init", "--json"]).exitCode).toBe(0);
      const t1 = quest(["task", "create", "Target", "--label", "doc:stories/gone", ...HUMAN, "--json"]);
      const t2 = quest(["task", "create", "Bystander", ...HUMAN, "--json"]);
      const t1Id = (JSON.parse(t1.stdout) as { data: { id: string } }).data.id;
      const t2Id = (JSON.parse(t2.stdout) as { data: { id: string } }).data.id;
      mkdirSync(join(root, "docs"), { recursive: true });

      const saved = { ...process.env };
      delete process.env.LORE_QUEST_ACTOR;
      delete process.env.LORE_QUEST_ACTOR_KIND;
      delete process.env.LORE_QUEST_ACCOUNTABLE_HUMAN;
      try {
        const real = createQuestAdapter(root); // no actor anywhere
        const revisions: string[] = [];
        const adapter: BacklogAdapter = {
          ...real,
          async editTask(id: string, patch: EditTaskPatch): Promise<void> {
            revisions.push(patch.ifRevision ?? "");
            quest(["task", "edit", t2Id, "--add-label", `bump-${revisions.length}`, ...HUMAN, "--json"]);
            await real.editTask(id, patch);
          },
        };

        const err = await runUnlink({
          root,
          output: { mode: "json", color: false },
          args: ["stories/gone", t1Id, "--allow-missing"],
          stdout: capture(),
          stderr: capture(),
          adapter,
          gitSpawn: cleanGitSpawn(),
          backend: "quest",
        }).then(
          () => null,
          (e: unknown) => e,
        );

        expect(err).toBeInstanceOf(LoreError);
        expect((err as LoreError).type).toBe("validation");
        expect((err as LoreError).message).toContain("explicit actor declaration");
        expect(revisions).toHaveLength(1); // one attempt: not retried
        // Positive control: T-1's viewed revision really did move under the T-2 write.
        const after = (JSON.parse(quest(["task", "view", t1Id, "--json"]).stdout) as { data: { revision: string } })
          .data.revision;
        expect(after).not.toBe(revisions[0]);
      } finally {
        process.env = saved;
      }
    },
    30_000,
  );
});
