/**
 * core/instructions.ts — the static guidance `lore instructions` serves.
 *
 * `lore instructions [<topic>]` is the just-in-time channel described in
 * docs/runbooks/agent-onboarding.md §2.3: instead of carrying lore's guidance
 * resident in an agent's context, it prints exactly the topic needed for the
 * current step of the canonical loop, mirroring the `backlog instructions
 * <topic>` idiom this project itself uses.
 *
 * Every topic here is a condensed restatement of guidance that already lives
 * elsewhere (the runbook, the ADRs, the CLI contract) — this module invents no
 * new policy, it only makes existing policy pullable on demand. Content is
 * static and root-independent: no bundle load, no config read, so the command
 * layer needs no `root`.
 */

/** One guidance topic `lore instructions` can print. */
export interface InstructionTopic {
  /** The key passed as `lore instructions <key>` (`overview` is the no-arg default). */
  readonly key: string;
  /** A one-line description — the pretty-mode heading and the topic-index entry. */
  readonly title: string;
  /** The full guidance body: plain prose, no ANSI, no trailing newline. */
  readonly body: string;
}

const LINKING: InstructionTopic = {
  key: "linking",
  title: "Story <-> Task coupling (`lore link` / `lore tasks`)",
  body: `A Story concept's frontmatter \`tasks:\` list is the source of coupling to
Backlog.md -- those are the task ids the Story owns. Use \`lore tasks <story>
--json\` for the LIVE task rollup (kind: tasks.rollup); never re-derive status
from the Story's markdown, which only refreshes when \`lore sync\` runs.

To couple a new task to a Story, create it in Backlog (\`backlog task create
...\`) then run \`lore link <story> <taskId...>\` -- this updates both the
Story's frontmatter \`tasks:\` list and the task's \`doc:<conceptId>\`
back-reference label in one step. \`lore unlink <story> <taskId...>\` removes
the coupling the same way.

lore is the sole committer of \`backlog/\` -- let \`lore link\`/\`lore
unlink\`/\`lore sync\` commit task-file changes; never hand-edit or \`git add\`
files under \`backlog/tasks/\` yourself.

A task id not found in Backlog, or a concept id lore doesn't recognize,
surfaces as exit 3 (not_found). See ADR-0009 (Story <-> Task coupling &
reconciliation) and ADR-0012 (Backlog coexistence & git ownership).`,
};

const SYNC: InstructionTopic = {
  key: "sync",
  title: "Reconciling status and managed blocks (`lore sync`)",
  body: `\`lore sync [paths...]\` is the write step that makes the bundle coherent:
it recomputes each Story's \`status\` from its coupled tasks' live Backlog
state (ADR-0009's reconciliation rules), rewrites the
\`<!-- lore:tasks:begin -->\` ... \`<!-- lore:tasks:end -->\` managed blocks from
that live data, and regenerates the bundle's index/log.

It is idempotent: run it again with no upstream change and it produces
byte-identical output -- a clean, empty diff. The \`--json\` payload is
\`kind: sync.summary\` and reports exactly what changed (status rewrites,
managed-block diffs, regenerated files).

Never hand-edit inside a managed block -- those edits are silently
overwritten on the next sync, and a targeted write to one is refused outright
(exit 4, denied). Author prose only outside the markers; run \`lore sync\` to
refresh the block instead.

Run \`lore sync\` after any task status change or after linking/unlinking a
task, before \`lore check\` -- check is read-only and will only tell you sync
is needed (exit 6, drift), not fix it for you.`,
};

const CHECK: InstructionTopic = {
  key: "check",
  title: "The CI gate: drift, links, anchors, portability (`lore check`)",
  body: `\`lore check [paths...]\` is lore's read-only CI gate. It reports: a Story
whose written status no longer matches its live tasks (drift), a stale
managed task block, broken internal links, missing heading anchors, and
non-portable Markdown link syntax. It also surfaces per-doc/bundle token
estimates.

On any failing condition it exits 6 (\`error_type\` \`drift\` for a stale
status/managed block, \`validation\` for a structural non-conformance flagged
by the same pass). The fix for drift is always \`lore sync\`, then re-run
check and commit.

Because check writes nothing and lore's core has no LLM dependency, it is
deterministic: a clean \`lore check\` locally means a clean \`lore check\` in
CI, with no flakiness to chase. A typical loop: run check; exit 0 means done;
exit 6 means run \`lore sync\` and re-check; any other non-zero exit (3 for a
missing link/anchor target, or an uncaught 1) needs investigation, not a
blind sync.

Treat \`lore check\` exiting 0 as the actual definition of "done" for any
docs-touching change -- not typecheck or lint alone.`,
};

const VALIDATION: InstructionTopic = {
  key: "validation",
  title: "Per-file OKF/schema conformance (`lore validate`)",
  body: `\`lore validate [paths...]\` is a tiered, per-file conformance reporter,
distinct from \`check\`'s cross-file drift/link/portability pass. It
validates: OKF §9 conformance (frontmatter parses, \`type\` is present and
non-empty) as an error if violated; per-type frontmatter shape and required
sections against the strict Zod schema (the single source of truth,
ADR-0006) as an error if violated for known types; an unknown \`type\` or
extra frontmatter keys as a warning only (OKF tolerates unknown fields --
custom frontmatter passes through untouched); and frontmatter values that
would serialize ambiguously (ADR-0011) as a warning.

With no path arguments it walks the whole bundle; pass explicit \`[paths...]\`
to scope it (e.g. from a pre-commit hook checking only staged files).
\`--type <T>\` narrows the report to one concept type; \`--strict\` treats any
warning as a failure for the exit code.

It emits the full \`validate.report\` on stdout regardless of outcome, then
returns exit 6 when any error-tier finding exists (or any warning under
\`--strict\`) -- the report is the payload, the exit code is the gate signal.`,
};

/** The detailed, task-scoped topics (everything except `overview`). */
const DETAIL_TOPICS: readonly InstructionTopic[] = [LINKING, SYNC, CHECK, VALIDATION];

/** Render the `key   title` topic-index lines shared by the overview body and (indirectly) its JSON `topics` field. */
function topicIndexLines(topics: readonly InstructionTopic[]): string {
  const width = Math.max(...topics.map((topic) => topic.key.length));
  return topics.map((topic) => `  ${topic.key.padEnd(width)}  ${topic.title}`).join("\n");
}

const OVERVIEW: InstructionTopic = {
  key: "overview",
  title: "The canonical agent loop and topic index",
  body: `lore's canonical agent loop: read docs/index.md (the bundle's entry point)
-> follow a Story concept -> \`lore tasks <story> --json\` for the live task
rollup -> do the work (author prose outside lore-managed regions) ->
\`lore sync\` to reconcile status and regenerate managed blocks -> \`lore
check\` as the CI gate (exit 6 on drift/broken-link/anchor/portability
findings).

lore is CLI-first and deterministic: no LLM dependency, so the same inputs
against an unchanged bundle always produce the same output and exit code.
Every command supports \`--json\` (the \`{schemaVersion, kind, data}\`
envelope) and \`--plain\` (ANSI-free text, auto-selected when stdout isn't a
TTY); branch on the semantic exit code (0 ok, 2 usage, 3 not_found, 4 denied,
5 conflict, 6 validation/drift) rather than parsing prose.

Topics:
${topicIndexLines(DETAIL_TOPICS)}

Run \`lore instructions <topic>\` for detail on any of these. Full reference:
docs/runbooks/agent-onboarding.md.`,
};

/** Every topic `lore instructions` can serve, `overview` first — the order the topic index/JSON `topics` field lists them in. */
export const INSTRUCTION_TOPICS: readonly InstructionTopic[] = [OVERVIEW, ...DETAIL_TOPICS];

/** Look up a topic by its exact key (case-sensitive, no fuzzy match), or `undefined` if unknown. */
export function findInstructionTopic(key: string): InstructionTopic | undefined {
  return INSTRUCTION_TOPICS.find((topic) => topic.key === key);
}
