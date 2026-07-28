---
id: LCLI-18
title: lore new with templates
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-07-28 20:14'
labels:
  - cmd
milestone: m-2
dependencies:
  - LCLI-15
documentation:
  - docs/adr/0006-schema-types-templates.md
priority: high
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scaffold typed concepts from .lore/templates/<type>.md with {{placeholders}} and --var; inject the $schema modeline, a stub summary, and the required-section skeleton.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New docs validate clean by construction
- [x] #2 User templates override bundled defaults
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Type config (schema.ts, the type source of truth): add per-type output-directory map + typeDirectory(type) and a DOCS_DIR constant. Known->explicit dirs (ADR->adr, Reference->reference, Runbook->runbooks, Spec->specs, Story->stories, Epic->epics); unknown->type-name lowercased. User can override via --out.
2. Pure core (new core/template.ts): slugify(title); renderTemplate(text, vars) doing {{key}} substitution and reporting unresolved tokens; BUILTIN_TEMPLATES per known type (frontmatter + required-section skeleton using only auto tokens {{title}}/{{type}}/{{timestamp}} + a literal stub summary so a no-var run validates clean); buildNewConcept({type,title,timestamp,vars,templateText,docPath}) -> renderTemplate -> parseConcept -> serializeConceptWithModeline (modeline only for known types, reusing the LCLI-17 seam) -> {contents, warnings}.
3. Shared fs write helpers: extract ensureDir/createIfAbsent/ioError/conflictError out of commands/init.ts into a shared module; refactor init to use it; new reuses identical never-clobber + conflict semantics (wx write -> conflict LoreError if a non-regular entry blocks).
4. Command (commands/new.ts): resolve root+clock; parse command-local args (--var key=value repeatable, --out <path>, positionals type+title); compute docPath = docs/<typeDirectory>/<slug>.md or --out (traversal-safe, within root); resolve template (.lore/templates/<type>.md overrides built-in; unknown type with no template -> usage error); buildNewConcept; createIfAbsent; emit NewResult (kind 'new'); flush advisory warnings to stderr.
5. CLI wiring (cli.ts): extend the hand-rolled parser to pass ordered post-command args to the command (global flags still parsed anywhere; leading unknown flags before the command still error); add 'new' to dispatch + USAGE; generalize init's leftover-arg rejection to the shared mechanism.
6. Tests: core (slugify, renderTemplate unresolved/override, buildNewConcept, each built-in validates clean via loadBundle 0 warnings = AC#1); command (create, --var, --out, USER TEMPLATE OVERRIDE = AC#2, unknown-type usage error, conflict/never-clobber, json/plain/pretty); cli (new dispatch, --var parsing, unknown flag rejection).
7. Docs+gates: CHANGELOG Unreleased entry; reconcile cli-surface.md if it enumerates commands. bun test+lint+typecheck+coverage -> /code-review max -> feature branch PR into dev (no self-merge).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design confirmed with Jeremy (2026-06-25): (a) target path = docs/<typeDirectory>/<slug>.md, per-type dir mapped in schema.ts (the type config), user-overridable via --out; (b) unknown types ACCEPTED per cli-surface.md §new — generic lenient built-in template, dir = type-name lowercased, no modeline (no schema exists); (c) flag scope = AC-focused subset: <type> <title> --var(repeat) --template <name> --summary --tags; DEFERRED --epic/--story/--resource to coupling tasks (ADR-0009); (d) type token is case-insensitive (lore new story -> Story). Kind 'new' (matches shipped 'init'; spec says new.result/init.result — minor naming drift to reconcile in a later spec pass). Exit codes: 2 usage/bad var, 5 target exists, 6 template missing {{var}}/bad frontmatter.

Implemented across two commits on feat/lore-18-new: 4f48345 (feature) + e157573 (review fixes). AC#1 (validate clean by construction): frontmatter built structurally (lore owns it) + body-only templates; each built-in renders a zero-warning, re-parseable concept (test/template.test.ts loops KNOWN_TYPES; test/new.test.ts loadBundle yields 0 warnings). AC#2 (user templates override): .lore/templates/<name>.md body overrides the built-in, resolved case-insensitively. /code-review max ran (51 agents, 21 verified findings -> 15 distinct); ALL fixed per Jeremy's 'all tiers' decision: type-token validation (no bundle escape), --out confined to docs/ + reserved-index guard, parser regression (post-command unknown flag vs --version/--help), -- terminator forwarding, value-flag won't swallow following flag, case-insensitive template lookup, conditional modeline (no dangling $schema), --var shadow warning, title trim, conflict-before-mkdir, stderr threading. Accepted as working-as-intended: two titles -> same slug -> never-clobber conflict (exit 5). Gates green: 361 tests pass, tsc clean, biome clean, coverage 98.6% funcs / 96.5% lines (uncovered = defensive permission branches). Deferred (noted): coupling flags --epic/--story/--resource (ADR-0009); kind 'new' vs spec 'new.result' naming drift; not_found(3) used for an explicit missing --template.
<!-- SECTION:NOTES:END -->
