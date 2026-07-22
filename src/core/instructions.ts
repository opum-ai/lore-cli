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
  title: "Story <-> Task coupling (`lore link` / `lore unlink`)",
  body: `A Story concept's frontmatter \`tasks:\` list is the source of coupling to
Backlog.md -- those are the task ids the Story owns. Roll up their current live
status with \`lore tasks <conceptId>\` (pass the Story, not a task id -- the
read-only rollup \`lore sync\` writes into the managed block); to inspect one
task, use \`backlog task view <taskId> --plain\`. Never trust the Story's own
written \`status\`, which only refreshes when \`lore sync\` runs.

To couple a new task to a Story, create it in Backlog (\`backlog task create
...\`) then run \`lore link <story> <taskId...>\` -- this updates both the
Story's frontmatter \`tasks:\` list and the task's \`doc:<conceptId>\`
back-reference label in one step, validating every given id exists first
and failing the whole command loud (not_found, exit 3) before writing
anything if one doesn't. \`lore unlink <story> <taskId...>\` removes the
coupling the same way, but is more forgiving: a task id no longer present
in Backlog is simply skipped (exit 0), not an error.

\`lore link\`/\`lore unlink\` edit \`backlog/tasks/*.md\` directly and commit
those edits themselves -- each calls \`commitBacklogFiles\`, scoped to
exactly the files it touched, right after writing them, so nothing is left
pending for \`lore sync\` on their account. \`lore sync\`'s own commit step
is now a catch-all sweep: it still commits anything left dirty under
\`backlog/\` from another source (a human's direct \`backlog task edit\`, or
a prior run's commit that failed). Never hand-edit or \`git add\` files
under \`backlog/tasks/\` yourself; whichever command touches them commits
them.

See ADR-0009 (Story <-> Task coupling & reconciliation) and ADR-0012
(Backlog coexistence & git ownership).`,
};

const SYNC: InstructionTopic = {
  key: "sync",
  title: "Reconciling status and managed blocks (`lore sync`)",
  body: `\`lore sync [paths...]\` is the write step that makes the bundle coherent:
it recomputes each Story's \`status\` from its coupled tasks' live Backlog
state (ADR-0009's reconciliation rules), rewrites the
\`<!-- lore:tasks:begin -->\` ... \`<!-- lore:tasks:end -->\` managed blocks from
that live data, regenerates the bundle's index/log, and commits \`backlog/\`
if \`lore link\`/\`lore unlink\` left it dirty.

It is idempotent: run it again with no upstream change and it produces
byte-identical output -- a clean, empty diff. The \`--json\` payload is
\`kind: sync.result\` and reports exactly what changed (status rewrites,
managed-block diffs, regenerated files).

Never hand-edit inside a managed block: the next \`lore sync\` silently
overwrites it, and \`lore replace\` silently skips any match inside one --
neither errors. (Malformed markers themselves -- missing, duplicated, or
crossed begin/end -- are a \`validation\` error, exit 6; that's a different
failure than an ordinary hand-edit.) Author prose only outside the markers.

Run \`lore sync\` after any task status change or after linking/unlinking a
task, before \`lore check\` -- check is read-only and will only tell you sync
is needed, not fix it for you.`,
};

const CHECK: InstructionTopic = {
  key: "check",
  title: "The CI gate: drift, links, anchors, portability (`lore check`)",
  body: `\`lore check [paths...]\` is lore's read-only CI gate. It always emits the
full \`check.report\` on stdout (\`kind: check.report\` under \`--json\`) --
findings for broken internal links, rotted heading anchors, reconciliation
drift (a Story's written status or managed block gone stale), and, under
\`--strict\`, portability-lint warnings. It then *returns* exit 6 when any of
those is error-tier (or any warning exists under \`--strict\`) -- a plain
exit code, not a thrown error: nothing throws on this path, so there is no
\`--json\` error envelope for a failing report (the report itself, already on
stdout, is the payload). cli-contract.md's exit table labels this condition
\`drift\` for documentation purposes only, to distinguish it from
\`validation\` -- \`lore validate\`'s own error_type for a different command;
check has no error_type split of its own to branch on.

check's \`usage\` (exit 2, a bad flag) and \`not_found\` (exit 3, a given
bundle-root path argument that doesn't exist) are the only cases that
actually throw and carry a \`--json\` error envelope.

Because check writes nothing and lore's core has no LLM dependency, it is
deterministic: a clean \`lore check\` locally means a clean \`lore check\` in
CI, with no flakiness to chase. A typical loop: run check; exit 0 means
done; exit 6 means read the report and run \`lore sync\` for any drift
finding, then re-check; exit 3 means fix the path argument; an uncaught 1
needs investigation, not a blind sync.

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
sections against a Zod schema generated from the declarative
\`.lore/profile.toml\` (the source of truth per ADR-0006's LORE-46 amendment)
as an error if violated for known types; an unknown \`type\` or extra
frontmatter keys as a warning only (OKF tolerates unknown fields -- custom
frontmatter passes through untouched); a stale \`resource:\` value that no
longer matches what the profile computes for the concept's current path as
a warning (rule "resource"); and frontmatter values that would serialize
ambiguously as quote-safety findings -- mostly errors (an unquoted YAML
indicator char, a YAML-1.1 boolean like bare \`no\`/\`yes\`, or a
colon-containing value all fail unconditionally), with only a bare
\`YYYY-MM-DD\` date downgraded to a warning.

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
-> follow a Story concept -> check its coupled tasks' live status (see the
\`linking\` topic) -> do the work (author prose outside lore-managed regions)
-> \`lore sync\` to reconcile status and regenerate managed blocks -> \`lore
check\` as the CI gate (exit 6 on a failing report -- see the \`check\`
topic).

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
