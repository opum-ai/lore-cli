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

const RETRIEVAL: InstructionTopic = {
  key: "retrieval",
  title: "Find and read docs in one repository (`lore query` -> `lore read`)",
  body: `To answer a question from this repository's docs, search before you browse.
Do not start by reading docs/index.md or grepping docs/:

1. \`lore query "<a few words from the question>" --limit 5\` -- full-text search
   across every concept's title, summary and body, printing each hit's id,
   type, title and a snippet. Narrow it with \`--type\`, \`--tag\`, \`--status\`
   or \`--field k=v\`. Text that begins with \`-\` goes last, after every flag
   and a \`--\`: \`lore query --limit 5 -- "-text"\`.
2. \`lore read <id>\` -- the best hit exactly as authored, with no budget and
   no assembly. Read the next hit if the first does not answer the question.
3. Only when you need the surrounding concepts: \`lore context <id>
   --max-tokens <n>\` returns the concept plus neighbor summaries, bounded by
   \`--depth\` hops. \`--max-tokens\` is a HARD ceiling: when the concept's own
   body does not fit, the body is dropped and only its identity and neighbors
   come back. Raise the budget, or use \`lore read\` for the body.

A query and one read usually cost a few KB. Browsing the index and grepping
or catting docs/ usually costs tens to hundreds of KB.

For how concepts connect, use \`lore path\` or \`lore impact\` (both take
required kind and direction flags; see their \`--help\`). \`lore graph\`
emits a link graph, not document text, so it is not a retrieval step.
\`lore agent context <profile> --task "<text>"\` compiles a task pack, but it
selects only among the sources that profile lists, so a question outside the
profile still needs a query. For questions that span repositories, see the
\`workspace\` topic.`,
};

const LINKING: InstructionTopic = {
  key: "linking",
  title: "Story <-> Task coupling (`lore link` / `lore unlink`)",
  body: `A Story concept's frontmatter \`tasks:\` list is the source of coupling to
the configured tracker -- those are the task ids the Story owns. Roll up their current live
status with \`lore tasks <conceptId>\` (pass the Story, not a task id -- the
read-only rollup \`lore sync\` writes into the managed block); to inspect one
task, use the configured tracker's view command. Never trust the Story's own
written \`status\`, which only refreshes when \`lore sync\` runs.

To couple a new task to a Story, create it through the configured tracker, then
run \`lore link <story> <taskId...>\` -- this updates both the
Story's frontmatter \`tasks:\` list and the task's \`doc:<conceptId>\`
back-reference label in one step, validating every given id exists first
and failing the whole command loud (not_found, exit 3) before writing
anything if one doesn't. \`lore unlink <story> <taskId...>\` removes the
coupling the same way, but is more forgiving: a task id no longer present in
the configured tracker is simply skipped (exit 0), not an error.

\`lore link\`/\`lore unlink\` update the task through that adapter. For the
Backlog backend, Lore scopes and commits the task Markdown written by the
Backlog CLI; Quest and Jira retain ownership of their own storage. Never
hand-edit or \`git add\` files under \`backlog/tasks/\` yourself.

Against a Quest-backed bundle, every write \`lore link\`/\`lore unlink\` makes
must declare who it is on behalf of: set \`LORE_QUEST_ACTOR\` and
\`LORE_QUEST_ACTOR_KIND\` (\`human\` or \`delegated-agent\`) before running either
command, e.g. \`LORE_QUEST_ACTOR=jdoe LORE_QUEST_ACTOR_KIND=human lore link
stories/x task-1\`; a \`delegated-agent\` actor also needs
\`LORE_QUEST_ACCOUNTABLE_HUMAN\` set to the human it is acting for. With none
of these set, the command fails closed with a \`validation\` error (exit 6)
instead of silently attributing the write to a fabricated human identity — it
never falls back to some default identity the way it once did.

See ADR-0009 (Story <-> Task coupling & reconciliation) and ADR-0012
(Backlog coexistence & git ownership).`,
};

const SYNC: InstructionTopic = {
  key: "sync",
  title: "Reconciling status and managed blocks (`lore sync`)",
  body: `\`lore sync [paths...]\` is the write step that makes the bundle coherent:
it recomputes each Story's \`status\` from its coupled tasks' live tracker
state (ADR-0009's reconciliation rules), rewrites the
\`<!-- lore:tasks:begin -->\` ... \`<!-- lore:tasks:end -->\` managed blocks from
that live data, regenerates the bundle's index/log, and commits \`backlog/\`
if \`lore link\`/\`lore unlink\` left it dirty.

It is idempotent: run it again with no upstream change and it produces
byte-identical output -- a clean, empty diff. The \`--json\` payload is
\`kind: sync.result\` and reports exactly what changed (status rewrites,
managed-block diffs, regenerated files), plus \`orphanedIndexes\`:
repo-relative paths of on-disk \`index.md\` files whose directory no longer
holds any concept (e.g. after a manual \`rm\`/\`mv\` outside \`lore rename\`) --
reported so they're never silently unmentioned, but left untouched on disk,
not auto-written or removed.

Never hand-edit inside a managed block: the next \`lore sync\` silently
overwrites it, and \`lore replace\` silently skips any match inside one --
neither errors. (Malformed markers themselves -- missing, duplicated,
crossed, or a collapsed same-line begin/end pair -- are a \`validation\`
error, exit 6; that's a different failure than an ordinary hand-edit.)
Author prose only outside the markers.

Run \`lore sync\` after any task status change or after linking/unlinking a
task, before \`lore check\` -- check is read-only and will only tell you sync
is needed, not fix it for you.`,
};

const CHECK: InstructionTopic = {
  key: "check",
  title: "The CI gate: types, drift, links, anchors, portability (`lore check`)",
  body: `\`lore check [paths...]\` is lore's read-only CI gate. It always emits the
full \`check.report\` on stdout (\`kind: check.report\` under \`--json\`) --
findings for broken bundle-scoped links, rotted heading anchors, reconciliation
drift (a Story's written status or managed block gone stale), committed-schema
drift, unknown active-
profile types, and portability-lint warnings. Relative \`.md\` links that normalize
above the selected bundle root are not resolved; the report exposes them through
\`skippedOutOfBundleLinkCount\`, which is informational and never changes the exit.
The command *returns* exit 6 when any finding is error-tier (or any warning exists
under \`--strict\`), and exit 7 when a committed schema is unattributable (rule
\`schema-unattributable\`: an orphaned \`.lore/schemas/*.schema.json\` whose generator
stamp is absent or not this lore's -- lore cannot judge it from here; 7 takes
precedence over 6 in the same run, and every finding is still reported) -- a plain
exit code, not a thrown error: nothing throws on this path, so there is no
\`--json\` error envelope for a failing report (the report itself, already on
stdout, is the payload). cli-contract.md's exit table labels this condition
\`drift\` for documentation purposes only, to distinguish it from
\`validation\` -- \`lore validate\`'s own error_type for a different command;
check has no error_type split of its own to branch on.

An unknown \`type:\` is ordinarily this warn-only, \`--strict\`-gated tier -- and
this repository's own CI gate (\`ci.yml\`) runs bare \`bun run lore check\`, no
\`--strict\`, so by default an unrecognized type ships through the actual gate at
exit 0 (LCLI-538). A bundle that wants that closed sets
\`[profile] strict_types = true\` in \`.lore/profile.toml\`: with it set, an unknown
type is an unconditional error on this same finding, every run, whether or not
\`--strict\` is passed -- the two compose (a bundle may set \`strict_types\` and
still pass \`--strict\` for everything else) rather than one subsuming the other.
Off by default; a bundle that never declares the key is unaffected. The same
knob also makes \`lore new <type> ...\` refuse to scaffold an unrecognized
\`<type>\` (exit 6) instead of warning and writing anyway, and \`lore validate\`
promotes its own \`unknown-type\` finding the identical way.

**Committed-schema drift** (\`schema-drift\`, error-tier, LCLI-539) asserts that
\`lore schema export\` would be a no-op: every \`.lore/schemas/<slug>.schema.json\`
is regenerated in memory from the active profile and compared byte-for-byte
against what is committed. Three conditions fail the gate -- a committed schema
whose bytes no longer match the generator, a profile type with no committed
schema at all, and a committed schema no profile type owns (the file a full
export would prune). **The fix for all three is \`lore schema export\`.**
It is asserted as a property -- regenerate and compare against the live
generator -- never as a pinned hash of expected bytes, because a hash records
which bytes were current when someone wrote it down and can say nothing about
whether they still are. A repository with no \`.lore/schemas/\` directory at all
is never drifted: it is unexported, and absence and disagreement are different
facts. This exists because \`.lore/schemas/*.json\` is committed and looks
authoritative -- an agent, a human, or an editor's YAML language server
following the \`$schema\` modeline reads it to learn what a type may contain --
and nothing else in lore compared those bytes against the generator, so a
profile-affecting change shipped without a re-export left a confident, wrong
answer in the repository with every gate green.

check's throws (each carries a \`--json\` error envelope) are \`usage\`
(exit 2, a bad flag, or a bundle-root path argument that exists but isn't a
directory), \`not_found\` (exit 3, a given bundle-root path that doesn't
exist, or, when a discovered concept links a Backlog task, that task's id no
longer existing), \`denied\` (exit 4, a bundle-root path that exists but
can't be read), and \`validation\` (exit 6; its causes include a malformed
status flow or override in the reconcile config, validated up front before
any task resolution; malformed frontmatter on a \`tasks:\`-linked concept,
caught per-file while scanning for reconciliation eligibility -- before any
task resolution runs, but not re-thrown until after the report has already
emitted; a resolved task whose live status is in neither the configured
status flow nor its \`[reconcile.overrides]\`, discovered only once that
task's own detail has already been resolved; and corrupted managed-block
markers, hit per-concept while regenerating that concept's
\`<!-- lore:tasks -->\` region during drift detection -- i.e. *after* that
concept's own tasks are already resolved). \`validation\`'s exit code
coincides with the drift-tier report's exit 6 above, but the two are
distinct: \`validation\` is a thrown error with a \`--json\` envelope; the
report's exit 6 is a plain returned code with no throw.

Date-sensitive rules use one pinned evaluation date. Pass
\`--as-of YYYY-MM-DD\` to select it explicitly; otherwise check uses HEAD's
recorded committer calendar date. It never reads the machine clock. If a
date-sensitive rule exists but HEAD is unborn, pass \`--as-of\` or commit the
bundle. Today only OKF 0.2 \`stale_after\` is date-sensitive; validate has no
elapsed-date rules.

Because check writes nothing and lore's core has no LLM dependency, it is
deterministic: a clean \`lore check\` locally means a clean \`lore check\` in
CI for the same repo state and explicit inputs, with no flakiness to chase. A
typical loop: run check; exit 0 means done; exit 6 means read the report and run
\`lore sync\` for any drift
finding, then re-check; exit 7 means something cannot be judged from here -- do
NOT run \`lore schema export\` or \`lore sync\` as a fix; read \`git log\` on the
named file (and on the profile) and decide by hand; exit 3 means fix the path
argument; an uncaught 1 needs investigation, not a blind sync.

Treat \`lore check\` exiting 0 as the actual definition of "done" for any
docs-touching change -- not typecheck or lint alone.`,
};

const VALIDATION: InstructionTopic = {
  key: "validation",
  title: "Per-file OKF/schema conformance (`lore validate`)",
  body: `\`lore validate [paths...]\` is a tiered, per-file conformance reporter,
distinct from \`check\`'s cross-file drift/link/portability pass. It
validates: the OKF 0.2 §11 / 0.1 §9 conformance floor (frontmatter parses, \`type\` is present and
non-empty) as an error if violated; per-type frontmatter shape and required
sections against a Zod schema generated from the declarative
\`.lore/profile.toml\` (the source of truth per ADR-0006's LORE-46 amendment)
as an error if violated for known types; an unknown \`type\` or extra
frontmatter keys as a warning only by default (OKF tolerates unknown fields --
custom frontmatter passes through untouched) -- unless the active profile sets
\`[profile] strict_types = true\`, in which case an unknown \`type\` specifically
is an unconditional error, independent of \`--strict\` (LCLI-538; extra keys and
every other warning are unaffected by this knob); a stale \`resource:\` value that no
longer matches what the profile computes for the concept's current path as
a warning (rule "resource"); and frontmatter values that would serialize
ambiguously as quote-safety findings -- mostly errors (an unquoted YAML
indicator char, a YAML-1.1 boolean like bare \`no\`/\`yes\`, or a colon
followed by a space, which YAML would otherwise misread as a nested
mapping), with only a bare \`YYYY-MM-DD\` date downgraded to a warning. A
colon with no trailing space is not flagged -- a URL like \`https://...\`
or an ISO timestamp like \`2024-01-01T00:00:00\` is accepted even though
it contains a colon.

With no path arguments it walks the whole bundle; pass explicit \`[paths...]\`
to scope it (e.g. from a pre-commit hook checking only staged files).
\`--type <T>\` narrows the report to one concept type; \`--strict\` treats any
warning as a failure for the exit code.

It emits the full \`validate.report\` on stdout regardless of outcome, then
returns exit 6 when any error-tier finding exists (or any warning under
\`--strict\`) -- the report is the payload, the exit code is the gate signal.`,
};

const TYPES: InstructionTopic = {
  key: "types",
  title: "Discovering the active type vocabulary (`lore types`, LCLI-537)",
  body: `\`lore types [--type <T>]\` prints the active profile's declared type
vocabulary directly -- every type's name and slug, its required body sections, and its full field
set (each field's requiredness, a short shape label like \`string\`/\`list\`/\`datetime\`/\`enum\`, and
whether it's \`common\` to every declared type or specific to this one). With no \`--type\` it reports
every declared type; \`--type <T>\` scopes it to one, the same way \`lore schema export --type <T>\`
does.

This is a read-only discovery command, distinct from \`lore schema export\`: \`schema export\`
*writes* \`.lore/schemas/<slug>.schema.json\` files for editor autocomplete and requires already
knowing a type name to inspect one usefully -- \`types\` answers "what types does this bundle
actually support" in one call, with no file written and no type name assumed up front. Reach for it
before hand-reading \`.lore/profile.toml\` and \`.lore/schemas/*.json\` and reconciling the two
yourself, and before authoring a concept of a type you are not certain the active profile declares.

An unknown \`type:\` value in an authored concept -- caught by \`lore validate\`/\`lore check\`'s
unknown-type warning -- now names the profile's full valid set and, when one is close enough to be a
plausible typo, a "did you mean" suggestion, instead of naming only the rejected value. Run
\`lore types\` to see the same valid set with full field detail, not just the bare names the warning
lists.

That warning is advisory (OKF tolerates an unknown type) unless the profile sets
\`[profile] strict_types = true\` (\`lore instructions check\`/\`validation\`, LCLI-538), in which case
it fails \`lore new\`/\`lore check\`/\`lore validate\` outright. Run \`lore types\` first either way --
knowing the valid set before authoring is cheaper than discovering the rejection after.`,
};

const WORKSPACE: InstructionTopic = {
  key: "workspace",
  title: "Multi-repository projection and bounded retrieval (`--workspace`)",
  body: `A Lore workspace is a third, disposable graph projection over explicit
member repositories. It does not merge those repositories, make their local
LadybugDB caches share storage, or create a live database-to-database link.
Each member's docs and Backlog records remain authoritative; the
workspace manifest owns only membership and explicit cross-repository links.

Stay in single-repository mode when the question and task are owned by one
bundle. Select workspace mode only for cross-repository discovery, traversal,
impact analysis, or context. Lore never discovers a workspace or nearby
repositories automatically: pass an explicit
\`--workspace <manifest>\`. Repeat \`--repository <member-id>\` to narrow the
selected members when the question does not need the whole family.

Workspace identities are qualified as \`<member-id>::<source-id>\`. Use that
form for targeted \`graph\`, \`context\`, \`path\`, \`impact\`, and retained
fact operations; \`query\` returns qualified IDs for follow-up commands. Equal
local IDs in two members remain distinct. Repository-local authored links never
escape their member. A cross-repository edge exists only when the manifest
names both typed endpoints explicitly, so Lore does not infer architecture
from matching names, paths, remotes, or prose.

Start broad only enough to locate evidence, then narrow and bound it:

  lore query "permission relay" --workspace .lore/workspaces/family.json --json
  lore graph root-docs::index --depth 2 --workspace .lore/workspaces/family.json --json
  lore context service::index --depth 1 --max-tokens 4000 --workspace .lore/workspaces/family.json --json
  lore path root-docs::index service::index --from-kind concept --to-kind concept --direction outbound --max-depth 4 --limit 20 --workspace .lore/workspaces/family.json --json

Inspect returned workspace scope and per-record provenance before acting. Use
\`path\` for exact bounded relationship evidence and \`impact\` for bounded
direct/transitive effects; retain a \`snapshot\` before using \`changed\` or
\`provenance\`. Do not dump the entire workspace into an agent prompt when a
qualified target, repository subset, depth, result limit, or token budget can
answer the question.

The manifest is control-plane input, not shared data storage. Its member
locators resolve relative to the manifest, stable member IDs survive locator
changes, and a non-null \`expectedRef\` rejects a checkout on another symbolic
ref. The current workspace LadybugDB cache lives under
\`.lore/cache/workspaces/\`, is rebuildable from validated member exports, and
never writes relationships or documentation back into a member repository.`,
};

const AGENTS: InstructionTopic = {
  key: "agents",
  title: "Which agent bridge lore agents checks or writes (`lore agents`, LCLI-437)",
  body: `\`lore agents\` (write) and \`lore agents --check\` (the CI drift gate,
exit 6 on stale/missing files, exit 0 otherwise) regenerate or verify the
Claude bridge (\`.claude/skills/lore/SKILL.md\` plus a managed nudge block in
\`CLAUDE.md\`) and/or the Codex bridge (\`.codex/skills/lore/SKILL.md\` plus a
managed nudge block in \`AGENTS.md\`). A BARE \`lore agents\` call means "keep
whatever this repository already selected current" -- it does not always
cover both bridges, and which one(s) it covers is presence-based, not a flag
you pass to it:

  - The Codex half is covered ONLY when this repository already opted in --
    either \`.codex/skills/lore/SKILL.md\` exists, or \`AGENTS.md\` carries the
    managed \`lore:agents\` block. Neither present means the repository never
    ran \`lore init --codex\`, and covering it anyway would report a Codex
    bridge nobody asked for as \`created\` -- permanent drift with no real
    fix, on every Claude-only repository.
  - The Claude half is covered whenever ITS OWN artifacts exist, OR when
    NEITHER bridge's artifacts exist yet (a totally fresh repository still
    defaults to bootstrapping the Claude bridge -- the long-standing
    zero-config behavior, unchanged). It is disarmed only for the one
    remaining case: a repository that selected Codex alone. Before this
    exception existed, \`lore agents --check\` on a Codex-only repository
    (\`lore init --codex\`, no \`--agents\`/\`--claude\`) proposed creating a
    Claude bridge nobody asked for and could never pass its own gate --
    the exact defect LCLI-437 reports.

This presence-based defaulting applies ONLY to the bare \`lore agents\`
call. An EXPLICIT, scoped request always means exactly what it asks for,
regardless of what else exists: \`lore init --claude\` or \`lore init --agents\`
always creates/checks the Claude bridge; \`lore init --codex\` always
creates/checks the Codex bridge. A bare \`lore init\` -- no bridge flag,
run non-interactively -- creates NO bridge at all: it scaffolds \`docs/\` and
\`.lore/\` and nothing else, and the wizard's bridge question starts with
nothing ticked. The Claude-by-default bootstrap above belongs to the bare
\`lore agents\` call only; to get a bridge from \`lore init\`, pass the flag.

\`.lore/config.toml\`'s \`[agents] skill_source = "plugin"\` opts the Claude
half out of repo-local generation entirely: \`.claude/skills/lore/SKILL.md\`
is never created or checked (the \`opum-lore\` marketplace plugin owns it
instead), while \`CLAUDE.md\`'s own managed nudge still points readers at
whichever source is actually in effect. This config is read only for the
bare, presence-based \`lore agents\` call -- a scoped \`lore init --claude\`/
\`--agents\` request ignores it, an explicit ask is never silently redirected.

To find out which bridge(s) a given repository currently has selected without
running a write, run \`lore agents --check --json\` and read \`data.files\`:
an empty or absent entry for a bridge's own files means that bridge was never
in scope for this run, not that it silently passed.

\`lore agents --target claude\` or \`--target codex\` (LCLI-593) is the explicit,
scoped form of \`lore agents\` itself: it plans, writes or checks ONLY the
named runtime's bridge, whether or not that bridge exists yet, and leaves the
other runtime's bridge alone. Without \`--target\`, everything above holds
unchanged, exit codes included.

The \`opum-lore\` marketplace plugin is reported alongside the bridges. With a
Claude or Codex bridge selected, \`lore init\` reports \`data.plugins.<runtime>\`.
\`lore agents\` reports plugin state ONLY under \`--check\` or \`--force\`: a plain
write-mode \`lore agents\`, with or without \`--target\`, starts no runtime and
reports no plugin state. When it is reported, \`data.plugin\` appears when
\`--target\` names a runtime, and \`data.plugins.<runtime>\` otherwise -- one entry
for every runtime whose bridge the call covered; the two are never both
present. (\`data.target\` names the runtime on every \`--target\` call.) Each is
read through that runtime's own \`claude plugin list --json\` or \`codex plugin
list --json\`. The state is one of \`installed\`, \`disabled\` (installed but
switched off, so its skill does not reach the agent), \`not-installed\`, or
\`not-detectable\` (the runtime CLI is missing, failed, or answered in a shape
lore cannot read), with the command to run next in \`remedy\`. Claude rows scoped
to another project are ignored, and the deciding row is chosen by scope in the
order managed > local > project > user > synced, then, within one scope, by the
deepest \`projectPath\`. A \`managed\` row is set by a Claude Code administrator:
it applies to every project and decides over every other scope (among several
managed rows, any disabled one makes the state \`disabled\`), and its
\`remedy\` is prose saying only an administrator can change it, never a command.
It is never updated: installed or disabled, \`--force\` reports \`update:
not-run\` with a detail saying so, never an instruction to enable it.

Only \`lore agents --target <runtime> --force\` changes the plugin install, and
only an \`installed\` plugin: \`claude plugin update opum-lore@opum --scope
<scope>\`, or \`codex plugin marketplace upgrade opum\` then \`codex plugin add
opum-lore@opum\` -- and the Codex upgrade refreshes EVERY opum plugin installed in
Codex, not only opum-lore, which \`updateDetail\` says once that upgrade has
succeeded. The outcome is in \`update\` (\`ran\` or \`not-run\`), \`updateOk\` and
\`updateDetail\`. It never enables a disabled plugin or installs a missing one
(it prints the command instead), never updates a Claude plugin whose deciding
row is \`managed\` (it reports \`update: not-run\` and runs only the list), and
never updates a Claude plugin whose deciding scope cannot be named in a command
(it prints prose instead of an unscoped command, which would act at Claude's
default scope);
\`lore init\`, \`--check\`, and a bare \`lore agents --force\` that names no runtime
never update anything. A failed update, like the state itself, never changes an
exit code. Because the state depends on what is installed on the machine, not
on the repository, set \`LORE_AGENT_PLUGINS=off\` to skip detection and start no
runtime process -- no list, and no update -- whenever output must be
deterministic: a test suite, a snapshot, or a CI job that must not touch the
machine's real agent install.`,
};

/** The detailed, task-scoped topics (everything except `overview`). */
export const DETAIL_TOPICS: readonly InstructionTopic[] = [
  RETRIEVAL,
  LINKING,
  SYNC,
  CHECK,
  VALIDATION,
  TYPES,
  WORKSPACE,
  AGENTS,
];

/** Render the `key   title` topic-index lines shared by the overview body and (indirectly) its JSON `topics` field. */
function topicIndexLines(topics: readonly InstructionTopic[]): string {
  const width = Math.max(...topics.map((topic) => topic.key.length));
  return topics.map((topic) => `  ${topic.key.padEnd(width)}  ${topic.title}`).join("\n");
}

const OVERVIEW: InstructionTopic = {
  key: "overview",
  title: "The canonical agent loop and topic index",
  body: `First choose scope: stay in the current repository for owner-local work;
select an explicit \`--workspace <manifest>\` only for cross-repository
questions (see the \`workspace\` topic). Then follow lore's canonical agent
loop: find what you need with \`lore query "<words>" --limit 5\` -> \`lore read
<id>\` for the hit (see the \`retrieval\` topic; do not browse docs/index.md or
grep docs/ first) -> check the coupled tasks' live status (see the
\`linking\` topic) -> do the work (author prose outside lore-managed regions)
-> \`lore sync\` to reconcile status and regenerate managed blocks -> \`lore
check\` as the CI gate (exit 6 on a failing report, 7 when it cannot judge a
committed schema -- see the \`check\` topic).

lore is CLI-first and deterministic: no LLM dependency, so the same explicit
inputs against unchanged repository state always produce the same output and
exit code. Date-sensitive check rules use \`--as-of YYYY-MM-DD\` when supplied
and otherwise pin to HEAD's commit date; they never read the machine clock.
Every command supports \`--json\` (the \`{schemaVersion, kind, data}\`
envelope) and \`--plain\` (ANSI-free text, auto-selected when stdout isn't a
TTY); branch on the semantic exit code (0 ok, 2 usage, 3 not_found, 4 denied,
5 conflict, 6 validation/drift, 7 indeterminate) rather than parsing prose.

Topics:
${topicIndexLines(DETAIL_TOPICS)}

Run \`lore instructions <topic>\` for detail on any of these.`,
};

/** Every topic `lore instructions` can serve, `overview` first — the order the topic index/JSON `topics` field lists them in. */
export const INSTRUCTION_TOPICS: readonly InstructionTopic[] = [OVERVIEW, ...DETAIL_TOPICS];

/** Look up a topic by its exact key (case-sensitive, no fuzzy match), or `undefined` if unknown. */
export function findInstructionTopic(key: string): InstructionTopic | undefined {
  return INSTRUCTION_TOPICS.find((topic) => topic.key === key);
}
