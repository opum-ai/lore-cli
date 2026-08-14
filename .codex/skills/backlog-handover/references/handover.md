# Status and handover

Status is read-only: ground the active tracker, live LCLI tasks, worktree state, and lifecycle audit,
then report resolved/in-flight/blocked/ready counts and one safe next action. Do not fetch merely
for status.

Write a handover only for a real blocker, environment stop, or unsafe context growth. Flush durable
task/tracker facts first, then replace `.claude/handovers/active.md`; keep it under 120 lines and
16 KiB. It carries `**Lifecycle**: executable-current`, its grounded tree, tracker, mode, compact
state, and a paste-ready restore prompt. Historical files are past-tense and non-executable: no
prompt, `$backlog-handover` invocation, or imperative continuation sequence. Audit after writing.
