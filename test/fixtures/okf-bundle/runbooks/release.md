---
type: Runbook
title: Regenerate the fixtures
summary: The steps to regenerate the golden fixtures and re-run the suite.
timestamp: 2026-06-21T00:00:00Z
---

# Regenerate the fixtures

1. Re-record the Backlog.md `--json` goldens with the recorder script.
2. Run `bun test` and confirm the golden + fixture suites stay green.
