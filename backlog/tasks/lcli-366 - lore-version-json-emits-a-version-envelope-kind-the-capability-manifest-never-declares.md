---
id: LCLI-366
title: >-
  lore --version --json emits a 'version' envelope kind the capability manifest
  never declares
status: To Do
assignee:
  - '@claude'
created_date: '2026-08-30 01:22'
labels:
  - manifest
  - contract
  - agent-facing
dependencies: []
priority: medium
type: bug
ordinal: 493000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
'lore --version --json' emits {schemaVersion:1, kind:"version", data:{version}}. The capability manifest declares the --version GLOBAL FLAG (name, alias v, takesValue false, summary) but nowhere declares that invoking it produces a 'version' envelope kind. No command is named version, and no command declares kind == version.

So an agent reading 'lore --json help' to discover what envelope kinds this CLI can emit will not learn that 'version' exists. That is a registry-vs-runtime mismatch on the agent-facing surface, and it is the SAME SHAPE as quest-cli's QCLI-151 (quest instructions emitted agent.guides and agent.guide while the manifest declared neither) and as this repository's own LCLI-350 (the agent command declared a kind the handler did not emit). Third instance in the family.

FOUND BY BUILDING AN EDGE THAT DID NOT EXIST. docker/e2e/run-e2e.sh asserts .kind == "..." for 18 distinct kinds against the real binary; the manifest declares 35 kinds across kind + resultKinds. Nothing compared the two sets. Doing so leaves exactly one e2e-observed kind unaccounted for: version. Every other one the harness observes is manifest-declared.

THE DESIGN DECISION IS NOT OBVIOUS, which is why this is filed rather than fixed in passing. Two shapes:
(a) Add an optional kind to ManifestFlag so a global flag that emits an envelope can declare it. Additive and backward-compatible for consumers, but it puts an emission on a FLAG, and today emissions are a command-level concept — that is a real modelling change, not just a field.
(b) Give version a command entry, the way help already has one (help is a command with kind help.manifest, which is why --json help is NOT part of this gap). Consistent with the existing model, but it changes the command count from 29 to 30 and every test or golden that pins that count.

(b) looks more consistent with how help is already modelled; (a) is less disruptive. Neither should be chosen without checking what consumes the manifest — this is a published, agent-facing contract, and a consumer iterating commands[] to enumerate kinds behaves differently under each.

Do not ship this in a patch release without deciding which. It lands after 0.3.5.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The capability manifest declares the envelope kind produced by 'lore --version --json', by whichever of the two modelling options is chosen and recorded
- [ ] #2 The choice between flag-level and command-level modelling is recorded with its reason, including what it means for a consumer that enumerates commands[] to discover kinds
- [ ] #3 A test ties the set of kinds the docker e2e observes from the real binary to the set the manifest declares, with NO exemptions remaining
- [ ] #4 Proven by a negative control: an emitted kind absent from the manifest makes the test fail and name that kind
<!-- AC:END -->
