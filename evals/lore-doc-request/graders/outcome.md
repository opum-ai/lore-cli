---
type: llm
weight: 1
---

A user asked how to add a new reference document to a "docs bundle" and link
it to a tracker task. This is exactly the situation the lore skill exists for:
a project that documents through the `lore` CLI rather than a plain editor,
where Story/Task coupling and managed blocks must stay coherent.

A successful response recommends driving this through `lore` rather than
hand-writing a markdown file directly into the bundle — specifically, it
should point at `lore new` (or equivalent) to scaffold the new concept and
`lore link` (or equivalent) to couple it to the tracker task, rather than
proposing to create the file and edit tracker references by hand. It's fine
for the response to first check what's actually in the repository, ask a
clarifying question, or point at `lore instructions` for the exact commands —
what matters is that it steers toward the lore CLI's own commands for
creating and linking a concept, not manual file editing or a hand-maintained
cross-reference.

Fail the response if it proposes creating the document with a plain file write
and wiring the task link by hand-editing frontmatter or an index file, with no
mention of a `lore` command that does this.
