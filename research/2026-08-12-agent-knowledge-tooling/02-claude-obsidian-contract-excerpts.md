# claude-obsidian primary evidence (clone @ 1c1bc49, tag v2.1.0)

## skills/wiki/references/provenance.md
# Evidence and provenance

Keep ingestion state, source evidence, and claim assessment separate.

Resolve the installed product root from the invoking skill's own location, not
from the user-vault working directory:

```bash
PRODUCT_ROOT=/absolute/path/to/installed/claude-obsidian
CORE="$PRODUCT_ROOT/scripts/claude-obsidian.py"
test -f "$CORE"
```

## Ledgers

- `.raw/.manifest.json`: legacy-compatible ingestion hashes, generated pages,
  address map, and last processing result.
- `wiki/meta/ledgers/source-ledger.json`: stable source identities, authority,
  SHA-256, retrieval/freshness, review state, and linked pages.
- `wiki/meta/ledgers/claim-ledger.json`: falsifiable claims, note locations,
  support, contradictions, confidence, risk, and review state.

Do not overload one ledger with all three jobs.

## Source rules

- Use SHA-256 for new source identity and delta checks.
- File locators are vault-relative. Remote locators are absolute HTTPS URLs.
- Source authority is one of `official`, `primary`, `secondary`, `community`,
  `synthetic`, or `unknown`.
- Review state is `unreviewed`, `active`, `superseded`, or `rejected`.
- Compute staleness from `refresh_due`; do not store a second stale flag.
- Sources sharing an `independence_key` do not count as independent
  corroboration.
- Sources that resolve to the same canonical URL origin do not count as
  independent merely because IPv6, IDN, Unicode, dot-segment, default-port, or
  percent-encoding spelling differs. Escaped reserved path/query bytes remain
  distinct because they can identify a different resource.

## Claim rules

- Assessment is `accepted`, `provisional`, `contested`, `unsupported`, or
  `deprecated`.
- Accepted claims need at least one fresh, active, non-synthetic source.
- High-risk accepted claims need two independent sources.
- Preserve contradictory evidence. Do not silently select a winner.
- `unsupported` is the canonical no-data state. A grounded refusal is better
  than confident invention.
- Never fabricate quotations, page numbers, dates, or evidence locators.

## Migration

Run migration as a dry-run first:

```bash
python3 "$CORE" migrate --vault VAULT \
  --generated-at <ISO-UTC> --operation-id migrate-reviewed
python3 "$CORE" migrate --vault VAULT \
  --generated-at <ISO-UTC> --operation-id migrate-reviewed \
  --approved-plan-sha256 <reviewed-sha256> --apply
```

Migration leaves `.raw/.manifest.json` byte-for-byte unchanged, creates missing
ledgers, defaults unknown evidence fields honestly, and never extracts claims
from legacy prose automatically.

## skills/wiki/references/operation-transactions.md (head)
# Operation transactions

Use this reference whenever a skill will change vault state.

## Contract

One logical operation produces one versioned transaction bundle and one
recoverable apply. Parallel workers may read and draft, but only the
orchestrator applies vault mutations.

Resolve the installed product root from the invoking skill's own location, not
from the user-vault working directory:

```bash
PRODUCT_ROOT=/absolute/path/to/installed/claude-obsidian
CORE="$PRODUCT_ROOT/scripts/claude-obsidian.py"
test -f "$CORE"
```

Never use the deprecated per-file `wiki-lock.sh` helper for new work. Never
commit from a generic lifecycle hook.

## Workflow

1. Resolve a user vault. Prefer `--vault`, then `CLAUDE_OBSIDIAN_VAULT`, then
   `.claude-obsidian.json`, then unambiguous current-directory discovery.
2. Read every expected target and record its SHA-256, or `null` when it must be
   absent.
3. Have workers return drafts and evidence. Workers do not edit shared vault
   state.
4. Build one `claude-obsidian.transaction.v1` JSON bundle.
5. Run `python3 "$CORE" transaction inspect BUNDLE --vault VAULT`.
6. Show destructive, external, or canonical-merge proposals to the user before
   applying them.
7. Pass the inspect result's exact `approval_sha256`, which binds the expanded
   plan to the canonical resolved vault root and cannot be reused for another
   vault:
   `python3 "$CORE" transaction apply BUNDLE --vault VAULT --approved-plan-sha256 HASH`.
8. Report the resulting operation ID and changed paths.
9. If the user wants Git history, run the separate explicit checkpoint command.

## Bundle shape

```json
{
  "schema": "claude-obsidian.transaction.v1",
  "operation_id": "save-20260711-example",
  "operation_type": "save",
  "expected_hashes": {
    "wiki/concepts/Example.md": null
  },
  "writes": [
    {
      "path": "wiki/concepts/Example.md",
      "mode": "create",
      "content_file": "drafts/example.md",
      "sha256": "<sha256>"
    }
  ],
  "address_requests": [],
  "source_manifest_updates": {}
}
```

`content` may replace `content_file` for small drafts. Use exactly one. Raw
source payloads are create-only. `.raw/.manifest.json` and the address counter
are expanded and journaled by the transaction engine when managed requests are
present. Only `ingest` and `autoresearch` own non-empty managed requests;
`setup` and `migration` may initialize the managed files directly. Other
operation types cannot target them.
