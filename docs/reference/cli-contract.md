---
# yaml-language-server: $schema=../../.lore/schemas/Reference.schema.json
type: Reference
title: "lore CLI contract (the agent/CI API)"
description: The normative machine-facing contract for the lore CLI — the three output modes and their precedence, the canonical --json envelope, the semantic exit-code table, the --json error envelope, stdout/stderr discipline, NO_COLOR handling, bounded output with truncation hints, and the additive-only versioning policy that downstream agents and CI gates depend on.
tags: [reference, cli, contract, json, exit-codes, agent, ci, versioning]
summary: Defines lore's stable machine-facing contract — output modes (--json > --plain > pretty), the {schemaVersion,kind,data} envelope, six semantic exit codes, the {error_type,message,hint,input} error envelope, stdout/stderr discipline, and additive-only versioning.
timestamp: 2026-06-21T00:00:00Z
---

# lore CLI contract (the agent/CI API)

This is the **normative** specification of how the `lore` CLI behaves toward
non-human callers: Claude Code (via the generated agent bridge), CI pipelines,
and shell scripts. Where the human-facing command catalog ("what commands exist
and what flags they take") lives in [CLI surface](cli-surface.md), this document
defines the *contract* every command must honor regardless of which command it
is: how output is shaped, how failures are classified, what goes on which stream,
and how the contract is allowed to evolve.

The decision and rationale behind this contract are recorded in
[ADR-0005: CLI contract](../adr/0005-cli-contract.md). lore being CLI-primary
(with the MCP server deferred to v2) is recorded in
[ADR-0004: CLI-first, MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md);
when the MCP transport lands it will re-expose these same core functions, so this
contract is the durable surface — see [MCP tools (deferred)](mcp-tools.md).

This contract is **deterministic**: identical inputs against an unchanged bundle
produce identical output and the same exit code. There is no LLM in the core
(see [ADR-0014: core has no LLM dependency](../adr/0014-core-has-no-llm-dependency.md)),
so callers may treat lore as a pure function of the repo state.

---

## 1. Output modes and precedence

Every command renders in exactly **one** of three modes. The mode is resolved
**once, centrally, before any command logic runs**, so a single invocation never
emits a partially-styled or mixed stream.

| Mode | How selected | Audience | Stability |
|---|---|---|---|
| **pretty** (default) | TTY stdout, no `--json`/`--plain` | Humans at a terminal | Cosmetic; may change any release |
| **`--plain`** | `--plain` flag, **or** stdout is not a TTY | Pipelines, `grep`/`awk`, snapshot tests | Diff-stable across patch releases |
| **`--json`** | `--json` flag | Agents, CI, `jq` | Versioned, additive-only contract |

### 1.1 Precedence

```
--json  >  --plain  >  pretty
```

- If `--json` is present, JSON wins — regardless of `--plain`, TTY state, or
  `NO_COLOR`.
- Else if `--plain` is present **or stdout is not a TTY**, plain wins. This
  auto-selection means a piped or captured `lore` call yields stable, ANSI-free
  text *without* the caller having to pass a flag.
- Else pretty.

Because precedence is resolved up front, the rule "stdout parses or stays
silent" (see §4) holds for the whole stream, not just its first line.

### 1.2 pretty

Human-oriented. Color is emitted **only on a TTY** and **only when `NO_COLOR`
is unset** (§6). Tables, alignment, box-drawing, pluralization, and reordering
are all permitted and **may change between releases**. pretty is explicitly
**not a parsing target**; machines must use `--plain` or `--json`.

### 1.3 `--plain`

ANSI-free, deterministic text intended to stay diff-stable across patch
releases. It is the convenience channel for shell pipelines and golden-file
snapshot tests. It is *not* the machine contract: text remains ambiguous (a
title containing a space or a `|` is hard to reparse), which is exactly why
machine callers should prefer `--json`. Substantial reformatting of `--plain`
output is treated as a **contract change**, not a cosmetic one.

### 1.4 `--json`

The machine contract. Every successful payload is the canonical envelope
described in §2, and every failure is the error envelope in §5. In `--json`
mode stdout contains **only** the envelope, so a caller may
`JSON.parse(stdout)` unconditionally on success.

---

## 2. The canonical `--json` success envelope

Every `--json` success response on stdout is a single JSON object:

```json
{
  "schemaVersion": 1,
  "kind": "query.results",
  "data": { }
}
```

| Field | Type | Meaning |
|---|---|---|
| `schemaVersion` | integer | Version of the envelope contract (§7). Bumped only on a breaking change to the JSON shape. |
| `kind` | string | Names the payload shape so a caller can switch on it without inferring structure. Dotted `command.payload` form. |
| `data` | object \| array | The typed body for that `kind`. Its internal shape is governed per-`kind`. |

The envelope is emitted on **stdout**, alone, with no leading or trailing prose,
no progress lines, and a single trailing newline. Pretty-printing (indentation)
is permitted; whitespace inside the JSON is not part of the contract.

### 2.1 The `kind` registry

`kind` is a stable, enumerated string. Each command that supports `--json`
declares one or more `kind` values; the same logical payload always carries the
same `kind`. Representative values (the authoritative list ships with each
release and tracks the [CLI surface](cli-surface.md)):

| `kind` | Emitted by | `data` shape (summary) |
|---|---|---|
| `init.result` | `lore init` | created paths, bundle root |
| `new.result` | `lore new` | new concept id, path, applied template/vars |
| `validate.report` | `lore validate` | tiered findings (errors/warnings), counts |
| `check.report` | `lore check` | drift, broken-link, anchor, portability findings; token estimates |
| `query.results` | `lore query` | ranked hits with `total`/`shown`/`truncated` (§3) |
| `context.export` | `lore context` | concept body + neighbor summaries; token budget accounting |
| `graph.export` | `lore graph` | nodes, edges, per-doc/bundle token estimates |
| `tasks.rollup` | `lore tasks` | live task status for a story (via Backlog `--json`) |
| `orphans.report` | `lore orphans` | unlinked tasks, docs with vanished tasks |
| `link.result` / `unlink.result` | `lore link` / `unlink` | updated frontmatter refs, task label set |
| `sync.summary` | `lore sync` | what changed (status rewrites, managed-block diffs, regen) |
| `replace.result` | `lore replace` | per-file match/replace counts; skipped managed regions |
| `rename.result` / `supersede.result` | `lore rename` / `supersede` | rewritten inbound links + frontmatter refs |
| `scaffold.result` | `lore scaffold` | consumer config files written outside `docs/` |

A caller should branch on `kind` and tolerate **unknown** `kind` values
gracefully — new ones may appear under the same `schemaVersion` (§7), mirroring
OKF's own "tolerate unknown types/keys" stance
(see [OKF conformance](okf-conformance.md)).

### 2.2 Relationship to the Backlog.md envelope

lore consumes Backlog.md through the **same** `{schemaVersion,kind,data}`
envelope shape, JSON-only, via the `--json` flag added by the
jeremy-newhouse/Backlog.md fork. That inbound contract is specified in
[Backlog CLI contract](backlog-cli-contract.md) and
[Backlog JSON schema](backlog-json-schema.md); the rationale is in
[ADR-0002: Backlog integration is JSON-only](../adr/0002-backlog-integration-json-only.md).
lore's *outbound* envelope (this document) and the *inbound* Backlog envelope
share a shape on purpose, but are versioned independently.

---

## 3. Bounded output and truncation hints

Read-heavy commands (`query`, `graph`, `orphans`, `context`, the `check`/
`validate` findings lists) **cap** their output rather than dumping unbounded
text that could exhaust an agent's context window or blow a CI log budget.
Truncation is always **explicit** — a caller is never silently given a partial
result with no signal.

### 3.1 In `--json`

Truncation is expressed as fields on `data`, not as prose:

```json
{
  "schemaVersion": 1,
  "kind": "query.results",
  "data": {
    "total": 120,
    "shown": 30,
    "truncated": true,
    "hint": "narrow with --type story or raise --limit",
    "results": [ ]
  }
}
```

- `total` — full count that matched.
- `shown` — number actually returned.
- `truncated` — boolean; `true` when `shown < total`.
- `hint` — the same actionable narrowing advice the pretty/plain modes print.

### 3.2 In pretty / `--plain`

The same intent is rendered as a trailing line:

```
showing 30 of 120 — narrow with --type story
```

### 3.3 Token estimates

`graph` and `check` surface **token estimates** for individual docs and the
whole bundle so callers can budget context. These are a labeled **estimate**
using the deterministic `chars / 4` heuristic — never presented as an exact
tokenizer count. In `--json` they appear as numeric fields (e.g.
`estimatedTokens`); in pretty/plain they are labeled "(est.)". The
`lore context` budget honored via `--max-tokens` uses the same heuristic
(see [CLI surface](cli-surface.md) and
[ADR-0015: lightweight retrieval, no vectors](../adr/0015-lightweight-retrieval-no-vectors.md)).

---

## 4. Stream discipline: stdout = data, stderr = diagnostics

This separation is absolute and is what makes `lore … --json | jq` and
`lore … > out.json` always safe.

- **stdout carries only the payload** for the resolved mode — the pretty view,
  the plain text, or the `--json` envelope. In `--json` mode stdout is
  *exclusively* the success envelope; on failure stdout is **empty**.
- **stderr carries only diagnostics** — progress, warnings, and error detail
  (including the `--json` error envelope, §5). Diagnostics never appear on
  stdout, so they cannot corrupt a parsed stream.

**Invariant:** *stdout parses or stays silent.* A caller may
`JSON.parse(stdout)` on success and expect empty stdout on failure, using the
exit code (§5.1) and the stderr error envelope to classify what happened.

### 4.1 Warnings do not, by themselves, change the exit code

Warnings (unknown OKF `type`, missing or over-long `summary`, non-portable
link syntax detected by the portability lint) are written to **stderr** and do
**not** alter the exit code — *unless* the command is a defined gate
(`validate`/`check`) for which that condition is specified to fail (then it
contributes to exit `6`; see [validation/coherence reference](okf-conformance.md)
and the gate behavior in [CLI surface](cli-surface.md)). This keeps everyday
commands non-fatal on advisory findings while letting gates enforce them.

---

## 5. Failure model

### 5.1 Semantic exit codes

Every invocation exits with exactly one of these codes. They are a **contract**:
callers branch on them, the same logical failure always maps to the same code
from every command and every output mode, and a code is never reused for an
unrelated condition.

| Code | Name | Meaning |
|---|---|---|
| `0` | success | The command completed and (for gates) found nothing failing. |
| `2` | usage | Unknown flag or command, malformed argument, missing required argument. |
| `3` | not_found | A referenced thing does not exist: concept id, task id, file path, link target. |
| `4` | denied | The operation is refused: e.g. an edit targeting a lore-managed region, or a guarded destructive op without the required confirmation. |
| `5` | conflict | Already-exists / write-race: id collision on `new`, supersede target already superseded, concurrent-write conflict. |
| `6` | validation_or_drift | A gate failed: `lore validate` non-conformance, or `lore check` drift / broken-link / heading-anchor / portability failure. |

**Code `1` is intentionally NOT used for any expected, classifiable
condition.** It is reserved to mean "unexpected / uncaught" — a crash or bug.
An agent should treat exit `1` as *report this*, not *handle this*. This lets a
caller distinguish "lore told me my input was wrong" (2/3/4/5/6) from "lore
itself broke" (1).

Even an uncaught failure stays on-contract. In `--json` mode it is reported as a
minimal error envelope on stderr — `{ "error_type": "uncaught", "message":
<string> }`, with no `hint`/`input` — so a crash still yields exactly one
parseable diagnostic line and an empty stdout. `uncaught` is the **only**
`error_type` outside the §5.3 table: it is the catch-all for any non-`LoreError`
throw and never collides with a classifiable category.

This taxonomy lets shell- and CI-level branching stay free of JSON parsing:

```sh
if lore check --plain; then
  echo "docs coherent"
else
  case $? in
    6) echo "drift or broken links — run lore sync" >&2 ;;
    3) echo "a referenced id is missing" >&2 ;;
    *) echo "lore failed unexpectedly" >&2 ;;
  esac
fi
```

The full per-command mapping (e.g. exactly when `supersede` returns `5` vs `6`)
is enumerated in [CLI surface](cli-surface.md). Changing any existing mapping is
a **breaking change** under the versioning policy (§7).

### 5.2 The `--json` error envelope

When a command fails **in `--json` mode**, lore writes a structured error
object to **stderr** (never stdout) and exits with the matching semantic code
from §5.1:

```json
{
  "error_type": "not_found",
  "message": "Concept 'reference/orders' not found in bundle.",
  "hint": "Run `lore query --type Reference` to list reference concepts.",
  "input": { "id": "reference/orders" }
}
```

| Field | Type | Meaning |
|---|---|---|
| `error_type` | string | Stable category aligned to the exit-code family (§5.3). |
| `message` | string | Single-line, human-readable summary of the failure. |
| `hint` | string | An actionable next step, written so an agent can often self-correct in one turn. |
| `input` | object | The offending input echoed back, so the caller can diagnose without re-deriving it. |

On a `--json` failure, **stdout stays empty**, preserving the §4 invariant. The
error envelope is *not* wrapped in the success envelope — there is no
`schemaVersion`/`kind`/`data` around it — so a caller never confuses an error
for data: success ⇒ envelope on stdout, exit 0; failure ⇒ error object on
stderr, exit ≠ 0.

### 5.3 `error_type` ↔ exit-code alignment

`error_type` strings correspond to the exit-code families so a caller can use
either signal:

| `error_type` | Exit code |
|---|---|
| `usage` | `2` |
| `not_found` | `3` |
| `denied` | `4` |
| `conflict` | `5` |
| `validation` | `6` |
| `drift` | `6` |

`validation` and `drift` both map to exit `6` but are distinguished in
`error_type` (and in the `check.report`/`validate.report` `data`) so an agent
can tell "my frontmatter is malformed" from "my managed block is stale".

### 5.4 Non-`--json` failures

In pretty and `--plain` modes a failure prints a human-readable diagnostic to
**stderr** and exits with the same semantic code. The structured envelope is a
`--json`-mode feature; the exit code is the contract that holds in all modes.

---

## 6. Color and `NO_COLOR`

- Color is emitted **only** in pretty mode, **only on a TTY**, and **only when
  the `NO_COLOR` environment variable is unset**. Setting `NO_COLOR` to any
  value (including empty) suppresses all ANSI sequences even on a TTY.
- `--plain` and `--json` are **always** ANSI-free regardless of `NO_COLOR`.
- Color is purely cosmetic and **never load-bearing**: no status, severity, or
  result is conveyed by color alone, so a non-color or piped consumer loses no
  information.

---

## 7. Versioning policy

### 7.1 The `--json` shape is additive-only

The `--json` envelope is a **public, additive-only versioned contract**:

- **Permitted without bumping `schemaVersion`:** adding new fields to `data`;
  adding new `kind` values; adding new `error_type` strings. Consumers MUST
  ignore unknown fields and tolerate unknown `kind`/`error_type` values.
- **Requires a `schemaVersion` bump (breaking):** renaming, removing, or
  repurposing an existing field; changing a field's type; changing the meaning
  of an existing `kind`; remapping an existing exit code or `error_type`.

This lets downstream consumers pin a `schemaVersion` and rely on stability
while lore evolves payloads safely.

### 7.2 What else counts as a contract change

Beyond the JSON shape, the following are also contract-level (breaking) changes,
not cosmetic ones:

- Reassigning any **semantic exit code** in §5.1.
- Substantially reformatting **`--plain`** output (pipelines may parse it).
- Changing **stream discipline** (§4) — e.g. moving any diagnostic onto stdout.
- Changing **precedence** (§1.1) or **`NO_COLOR`** behavior (§6).

pretty-mode formatting is explicitly excluded — it may change at any release.

### 7.3 Discipline

These guarantees are only as good as their enforcement. Every command routes
output through the central mode resolver and maps failures to the correct
semantic code and `error_type`; ad-hoc `console.log`/`process.exit(1)` is
forbidden and enforced in review and tests. The `kind` registry,
`schemaVersion`, and exit-code mapping each carry their own tests and changelog
discipline.

---

## 8. Quick reference

| Concern | Rule |
|---|---|
| Mode precedence | `--json` > `--plain` > pretty; plain auto-selected on non-TTY |
| Success payload | `{ schemaVersion, kind, data }` on stdout, exit `0` |
| Failure (`--json`) | `{ error_type, message, hint, input }` on **stderr**, stdout empty, exit ≠ 0 |
| Streams | stdout = data only; stderr = diagnostics only |
| Exit codes | 0 ok · 2 usage · 3 not-found · 4 denied · 5 conflict · 6 validation/drift · (1 = uncaught bug) |
| Truncation | `total`/`shown`/`truncated`/`hint` in JSON; "showing N of M" line otherwise |
| Token counts | labeled estimate, `chars/4` heuristic, never exact |
| Color | pretty + TTY + `NO_COLOR` unset only; never load-bearing |
| Versioning | `--json` additive-only; existing fields/codes never repurposed without a `schemaVersion` bump |

---

## Related

- [ADR-0005: CLI contract](../adr/0005-cli-contract.md) — the decision and rationale.
- [ADR-0004: CLI-first, MCP deferred](../adr/0004-cli-first-skill-bridge-mcp-deferred.md)
- [CLI surface](cli-surface.md) — the command catalog and per-command `kind`/exit mappings.
- [Backlog CLI contract](backlog-cli-contract.md) — the inbound Backlog.md `--json` contract lore consumes.
- [Backlog JSON schema](backlog-json-schema.md) — the parsed Backlog envelope shapes.
- [OKF conformance](okf-conformance.md) — tolerance rules the JSON contract mirrors.
- [MCP tools (deferred)](mcp-tools.md) — the v2 transport that re-exposes these same core functions.
- [lore design](../specs/lore-design.md) — the overall design this contract serves.
