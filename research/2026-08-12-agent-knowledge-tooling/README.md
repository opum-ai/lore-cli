# Raw research: agent-native knowledge tooling (2026-08-12)

Verbatim research capture backing the Lore competitive analysis. **This
directory is deliberately outside `docs/`** so it is not part of the OKF
bundle: these are raw, dated observations, not curated concepts. The curated
output lives in the bundle:

- `docs/reference/claude-obsidian-teardown.md`
- `docs/reference/competitive-landscape-agent-native-knowledge-tooling.md`
- `docs/reference/lore-competitive-feature-matrix.md`
- `docs/specs/lore-competitive-adoption-roadmap.md`

Everything here is a **then-current observation on 2026-08-12** unless a file
says otherwise. Repository facts move; re-verify before relying on one.

## Files

| File | What it is | How it was produced |
|---|---|---|
| `00-primary-source-verification.md` | Repo metadata table, claude-obsidian architecture, Lore's own verified surface | Direct `gh api` calls and a local `--depth 50` clone, plus introspection of the installed `lore` binary |
| `01-obsidian-ecosystem-verified-claims.md` | 12 adversarially verified claims with per-claim vote counts, sources, and evidence | Deep-research workflow pass 1 (103 agents, 3-vote adversarial verification) |
| `02-claude-obsidian-contract-excerpts.md` | Verbatim provenance and transaction contracts | Local clone at HEAD `1c1bc49`, tag `v2.1.0` |
| `03-claude-obsidian-file-tree.txt` | Complete tracked-file listing (201 blobs) | `gh api .../git/trees/HEAD?recursive=1` |
| `04-pass1-coverage-caveats.md` | Pass 1's own statement of what it failed to cover | Workflow self-report |
| `05-gap-fill-survey-rows.json` | Structured per-tool capability rows for the categories pass 1 missed | Deep-research workflow pass 2 (structured schema output) |
| `06-gap-fill-synthesis.md` | Pass 2 synthesis: field map, differentiation, gaps, ranked adoption candidates | Workflow pass 2 |

## Reading the capability cells

In `05-gap-fill-survey-rows.json`, each `caps` value is one of `yes`, `no`,
`partial`, `unknown`. **`unknown` is not `no`.** A cell is `no` only where
absence was positively checked; where the research did not look, or where an
adversarial verifier refuted a claim without establishing its opposite, the
cell is `unknown`. Pass 1 refuted eleven claims, several of them negative
capability claims — a refuted negative does not license writing the positive.
