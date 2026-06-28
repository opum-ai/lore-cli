# Handover — LORE-35 continuation: PR2 `lore rename`, then PR3 `lore supersede`

**Date**: 2026-06-28 | **Grounded against**: `dev`=`main`=`15256db` (== origin, clean tree, checked out) | **Backlog**: LORE-35.1 **Done** (#22); LORE-35.2 **To Do** (rename, READY); LORE-35.3 **To Do** (supersede, READY)

## Paste-ready prompt for the next session

```
State: dev == main == 15256db (== origin), clean tree, no open PRs. LORE-35 (lore replace/rename/
supersede) was split into subtasks LORE-35.1/.2/.3, one PR each. LORE-35.1 (lore replace) is DONE —
squash-merged as #22 (89330e4); mark-Done chore is 15256db. NEXT: LORE-35.2 = `lore rename` (graph-
aware concept rename: move a concept to a new id/path and rewrite EVERY inbound cross-link + frontmatter
ref, then regenerate sub-indexes — LORE-35 AC#2). Then LORE-35.3 = `lore supersede` (reuses rename's
engine). Confirm deps with the CLI: `backlog task view LORE-35.2 --plain` (dep LORE-28 ✓).

Build PR2 on the VERIFIED surgical-splice design (no markdown serializer dep — empirically probed):

NEW core/rewrite.ts (pure; rewriteInbound lands WITH its consumer, NOT in links.ts — the links.ts
docstring says so):
  rewriteInbound(graph, fromId, toId, {move?:boolean}): RewritePlan
  RewritePlan = { rename: {from,to}|null, writes: {path, bytes}[] }  // ascending-path order
- Edit bodies by SURGICAL STRING SPLICE using mdast node `position` offsets — NEVER parse→stringify
  (would reflow prose; forbidden by ADR-0008 §7). Deps are only mdast-util-from-markdown (parse);
  there is NO mdast-util-to-markdown/remark-stringify (that's LORE-22, blocked + packaging risk).
- node.url is NOT byte-equal to source (percent-encoding kept, but backslash-escapes/HTML-entities
  decoded and <…> wrappers stripped) → you CANNOT indexOf(node.url) to find the dest. Locate the
  destination byte-range structurally inside the link node's span:
  destRangeForLink(body,node): contentEnd = max(child.position.end.offset) (or start+1 for empty
    label) → first `]` at/after contentEnd → `(` → skip ws → if `<` scan to matching `>` (honor \\
    escapes) else scan raw dest honoring balanced (), \\ escapes, stop at ws (title) or node end.
  destRangeForDefinition(body,node): `]`→`:`→ws→dest; raw form has NO closing `)` (stop at ws/end).
- Reference links: rewrite the `definition` node's url ONLY when its identifier is in the USED set
  (mirror bundle.ts extractLinkTargets' used-definition logic; leave orphan defs alone).
- Affected files = the moved concept (always, when move) + every other concept that is the `from` of
  an edge with `to === fromId` (any kind) — scan graph.edges.
- Per other file: re-resolve each internal link against its own dir EXACTLY as bundle.ts does
  (internalTarget + resolvePath; mirror bundle.ts, NOT check.ts — bundle.ts absorbs a leading slash,
  no /-absolute special case); for matches compute newDest = normalizeLink(C.path, toPath) + suffix
  (suffix = the preserved #fragment/?query, sliced off node.url); apply body edits RIGHT-TO-LEFT
  (descending offset) so earlier splices don't shift later ones; rewrite specs/supersedes/
  superseded_by frontmatter refs that resolve to fromId → bare-id toId; serializeConcept → bytes
  (verbatim body, byte-stable frontmatter).
- Moved file: recompute ALL its outbound internal links against dirname(toPath) (they move with the
  file); self-links retarget to toPath; works for dangling links too (pure path arithmetic). The
  plan's rename:{from,to} tells the command to write toPath and delete fromPath.
- Throw not_found (fromId absent) / conflict (toId exists).

NEW commands/rename.ts (thin): parse <oldId> <newId> + --dry-run; loadBundle(docs/);
rewriteInbound(move:true); regenerate indexes via core/indexes.ts generateIndexes over the post-
rename graph (splice existing bytes); write all writes + index updates (overwrite) and move/delete;
unless --dry-run; emit rename.result. Exit 0 · 3 oldId not found · 5 newId exists.
REUSE what LORE-35.1 already landed: commands/discover.ts (readSource/canonicalIdentity/
toRepoRelative/withinRepo — already exported), commands/fswrite.ts writeFileOverwriting (ADD a
removeFile there for the moved-from delete — it was deferred out of PR1), core/indexes.ts
locateManagedBlock + generateIndexes, links.ts normalizeLink/pathPart/decodeTarget/isExternalTarget,
concept.ts serializeConcept/idFromPath, bundle.ts walkMdast/extractLinkTargets/BundleGraph.edges.

PR3 (supersede): rewriteInbound(move:false) for optional --rewrite-links; command sets
old.frontmatter.status="superseded"+superseded_by=newId, new.supersedes=oldId (byte-stable
serializeConcept). Exit 0 · 3 either id not found · 5 oldId already superseded.

Per-task workflow: feature branch off dev → implement → gates (bun test + bunx biome check src/ test/
+ bunx tsc --noEmit + bun test --coverage, core 100% func) → /code-review max (workflow-backed; FOLD
the verified findings — last pass found 11 real bugs in replace) → PR into dev via gh-token. Jeremy
reviews; admin-merge ONLY when he says "admin-merge". ssh is DOWN — route every git network op
through the gh token.

FIRST run `backlog instructions overview`, then `backlog task view LORE-35.2 --plain`.
```

## State

| Item | Status |
| --- | --- |
| **LORE-35.1** (`lore replace`) | **Done** — squash-merged **#22** (`89330e4`); chore `15256db`; branch deleted everywhere |
| `dev` / `main` | both `15256db` == origin; clean; **checked out (dev)**; main re-synced to dev this session (== dev) |
| Open PRs | **none** |
| **LORE-35.2** (`lore rename`) | **To Do, READY** (dep LORE-28 ✓) — AC#2; introduces `core/rewrite.ts` `rewriteInbound` |
| **LORE-35.3** (`lore supersede`) | **To Do, READY** (dep LORE-28 ✓) — reuses `rewriteInbound(move:false)` |
| LORE-48 | **To Do** — `lore check` follow-ups (unrelated; low priority) |
| backlog-fork cluster (LORE-1/21/22/26/27/32…) | **Blocked** behind the LORE-1 fork chain |

## Critical context / traps

- **No markdown serializer** (deps: only `mdast-util-from-markdown` parse + gray-matter + js-yaml + zod). Body edits MUST be surgical string splices via mdast `position` offsets; never parse→stringify (reflows prose, ADR-0008 §7). Pulling in remark-stringify is LORE-22 (blocked + EXDEV packaging risk, [[external-volume-bun-exdev-traps]]).
- **`node.url` ≠ source bytes** — locate the destination range structurally (see paste-ready). Verified empirically against `mdast-util-from-markdown@2.0.3`.
- **Mirror `bundle.ts` resolution, NOT `check.ts`** for rename targeting: bundle's `resolvePath` absorbs a leading slash (no `/`-absolute special case); rewrite exactly the edges the graph counts. Case-sensitive `Map.has` (a wrong-case link dangles → left alone).
- **core stays PURE** (design §2.1): string/graph in, typed out; the command layer owns fs/print/exit. ubuntu CI is case-SENSITIVE.
- **ssh-agent is DOWN** (publickey denied). Route ALL git writes via the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`, then `git update-ref refs/remotes/origin/<branch> <sha>`. ff: gh-token `fetch …/lore.git <ref>` → `git merge --ff-only FETCH_HEAD` → update-ref. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Admin-merge sequence (used for #22):** on a CLEAN dev — `gh pr merge <n> --squash --admin --subject "feat(LORE-N): … (#n)" --body "…"` → ff local dev (gh-token) → delete branch (`gh api -X DELETE repos/jeremy-newhouse/lore/git/refs/heads/<branch>` + `git branch -D` + `git update-ref -d` tracking). Only when Jeremy says "admin-merge". **This session also promoted `main` → `dev` (ff) at Jeremy's request, so dev==main now;** normal flow has dev ahead of main — don't assume they stay synced.
- **Merge convention = SQUASH** → one `feat(LORE-N): … (#NN)` on dev; post-merge chores are separate `chore(LORE-N):`/`docs:` commits. Stacked branches conflict on `CHANGELOG.md` (each adds under `## [Unreleased]`) and now also on `cli.ts`/`commands/discover.ts` — resolution is "keep both."
- **`/code-review max` is workflow-backed and worth it** — for #22 it found **11 verified correctness defects** (symlink write-escape, empty-matching regex, managed-bounds divergence, per-gap anchor binding, no-op churn, dedup, atomicity, log.md, zero-file validation, EISDIR, absolute-glob). All folded before merge. Run it and fold for PR2/PR3.

## Do not repeat

- **Don't `join(root, globMatch)`** — Bun.Glob returns an ABSOLUTE path for an absolute pattern; `join` doubles it. Use `resolve(root, match)`. (Caught in PR1 review.)
- **Don't gate a write on match COUNT** — gate on `result.text !== original`, or a no-op (find===replace) churns files. Read-all-then-write for atomicity.
- **Don't reject only the literal empty find** — an empty-MATCHING regex (`x*`, `\b`, `^`) must be rejected too (probe `""` + a representative string).
- **Don't re-derive managed-region bounds** — use `indexes.locateManagedBlock` (first-begin→last-end) so `replace`/`rename`/`sync` agree.
- **Don't pull `remark-stringify`/`unified`** into rename — surgical splice only.
- **Shell gotcha:** `git mv … | tail … || mv …` — the pipe masks git's exit code so the `||` fallback never runs. Handover files are gitignored; archive them with a plain `mv`.

## System of record updated (this session)

- **LORE-35** split into **LORE-35.1** (replace, **Done** #22), **LORE-35.2** (rename), **LORE-35.3** (supersede).
- **LORE-35.1** → **Done**; both ACs checked; notes record the implementation + the folded #22 `/code-review max` fixes + "delivered via #22 / 89330e4".
- **CHANGELOG.md** (on dev) → `lore replace` Added entry incl. the review-fold hardening paragraph.
- **Code on dev** (`89330e4`): `core/replace.ts` + `commands/replace.ts` (new), `commands/discover.ts` (new shared discovery/IO; `check.ts`/`validate.ts` migrated onto it), `core/indexes.ts` (`locateManagedBlock` exported), `commands/fswrite.ts` (`writeFileOverwriting` + `EISDIR→conflict`), `cli.ts` (`replace` registered), `test/replace.test.ts`.
- Archived consumed handover `HANDOVER-2026-06-28-post-lore-30-next.md`.
