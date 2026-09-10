---
type: llm
weight: 1
---

A guard against overtriggering. The lore skill's description names
documentation, OKF bundles, and Story/Task linking; the failure mode of an
overeager description is firing on an unrelated language question.

A successful response simply answers the JavaScript question — key types,
iteration order, size, prototype pollution, performance characteristics. It
should not mention the `lore` CLI, documentation bundles, OKF, or task
linking.

Fail the response if it invokes the lore skill or steers the conversation
toward documentation tooling.
