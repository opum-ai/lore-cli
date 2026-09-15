---
type: Reference
title: OKF projection contract
tags:
  - okf
  - projection
  - jsonl
  - contract
summary: Versioned deterministic JSONL records for exporting consumer-neutral OKF concepts, authored edges, task associations, hashes, and Git provenance.
timestamp: 2026-07-27T05:09:13.370Z
---

# OKF projection contract

The `lore export` command emits a consumer-neutral projection of repository OKF and Backlog source facts. Its default output is newline-delimited JSON; `--json` wraps the same records in lore’s standard success envelope. The export contains no Neo4j labels, Cypher, embeddings, inferred relationships, or downstream database identifiers.

## Invocation

```bash
lore export > lore-projection.jsonl
lore export --schema-version 1.0
lore export --json
```

Only projection schema `1.0` is supported. An unsupported version is rejected as a usage error before lore reads the profile, bundle, Backlog snapshot, or Git state. `SOURCE_DATE_EPOCH` may supply a deterministic generation timestamp; otherwise `generatedAt` is `null`.

## Record contract

The stream begins with one `manifest`, then emits deterministic groups of `concept`, concept `edge`, `task`, and concept-to-task `edge` records, and ends with one `trailer`.

- `manifest` carries the projection schema, stable bundle identity, OKF version, docs root, source Git commit, exporter version, generation time, and normalization version.
- `concept` carries a stable key, bundle-relative id, repo-relative path, type, the complete parsed frontmatter object, canonical Markdown body, content hash, and token estimate. Unknown OKF types and fields are preserved.
- Concept `edge` records preserve every authored frontmatter/body reference in source order. `kind`, authored `target`, per-source `ordinal`, resolved target key or `null`, and `dangling` preserve duplicate and broken links without inference.
- `task` records carry the current tracker snapshot: stable key, id, title, status, labels, priority, ordinal, assignees, milestone, parent id, dependencies, and source-adapter version.
- `sourceAdapterVersion` names **the adapter that produced the record**, threaded from that adapter rather than written at the projection site: `backlog-json/1`, `quest-json/1`, or `jira-rest/1`. The `<backend>-<transport>/<n>` shape versions the adapter contract, not the backend's own release. It is the field to read when `dependencies` is empty and you need to know whether that means "no prerequisites" or "this backend does not report them" — Quest's task list carries dependencies; Backlog.md's and Jira's do not.
- Retained projections carry whatever value was current when they were written, including spellings no adapter produces any more (`backlog-cli/1`). Readers must treat the field as an opaque identifier, never as a closed enum, because `lore provenance` reads history and history cannot be re-exported.
- Task `edge` records preserve every authored `tasks:` association, including duplicate ordinals and dangling task ids.
- `trailer` carries the number of preceding records and a semantic stream hash. Generation time is excluded from that semantic hash.

Records and object fields are additive within major schema version 1. Consumers must reject unsupported major versions before mutation and must not infer database-native semantics from producer-defined edge kinds. Stable hashes use SHA-256 with a `sha256:` prefix. Identical bundle bytes, task snapshot, Git metadata, exporter version, and generation time produce byte-identical output.
