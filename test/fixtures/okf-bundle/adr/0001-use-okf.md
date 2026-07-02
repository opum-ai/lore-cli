---
type: ADR
title: Use OKF for the sample bundle
summary: The decision to shape fixtures as real OKF concepts rather than ad-hoc strings.
timestamp: 2026-06-21T00:00:00Z
---

# Use OKF for the sample bundle

## Status

Accepted

## Context

The fixture bundle must exercise every known concept type against the real
validate and check engines.

## Decision

Author one conformant concept per type, so the fixtures double as OKF
conformance examples.

## Consequences

The golden fixtures stay in lock-step with the type vocabulary: adding a type
without a fixture fails the coverage assertion.
