---
type: Attested Computation
title: Fixture revenue computation
summary: A sanctioned inline computation represented without executing it.
runtime: bigquery
parameters:
  - name: year
    type: integer
    required: true
timestamp: 2026-06-21T00:00:00Z
---

# Computation

```sql
SELECT SUM(amount) FROM revenue WHERE fiscal_year = @year
```
