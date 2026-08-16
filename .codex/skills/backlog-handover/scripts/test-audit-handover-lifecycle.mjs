import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const auditPath = join(scriptDirectory, "audit-handover-lifecycle.mjs");
const root = mkdtempSync(join(tmpdir(), "backlog-handover-lifecycle-"));
const sessionRenewal = [
  "# Campaign handover",
  "",
  "**Lifecycle**: executable-current",
  "**Grounded against**: repository `lore-cli`; branch `fix/lcli-329`; SHA `0123456789abcdef0123456789abcdef01234567`; worktree `/tmp/lcli-329`; clean; origin/dev known",
  "**Tracker**: doc-17 - Autonomous loop",
  "**Mode**: autonomous-docs",
  "**Stop class**: session-renewal",
  "",
  "## Paste-ready prompt",
  "Run /clear, start a new session in `lore-cli`, then use $backlog-handover restore without reconfirmation.",
  "",
  "## State",
  "- Resolved: 1",
  "- In flight: 1",
  "- Blocked: 0",
  "- Ready: 2",
  "",
  "## In flight",
  "| Task | Worktree/branch | Last verified tree and stage | Blocker or next action |",
  "| LCLI-329 | fix/lcli-329 | 0123456789abcdef0123456789abcdef01234567, reviewed | Restore and deliver |",
  "",
  "## Retained artifacts",
  "| Artifact | Owner | Reason | Cleanup condition |",
  "| fix/lcli-329 | LCLI-329 | Session renewal | Merge to dev |",
  "",
  "## Decision required",
  "- Decision: None — session renewal",
  "",
  "## Next action",
  "- Action: Run /clear, start a new session in `lore-cli`, invoke $backlog-handover restore, and continue without reconfirmation.",
  "",
  "## Exceptions",
  "- None.",
  "",
].join("\n");
const humanDecision = sessionRenewal
  .replace("**Stop class**: session-renewal", "**Stop class**: human-decision")
  .replace("- Decision: None — session renewal", "- Decision: Choose whether the public format may change.")
  .replace(
    "- Action: Run /clear, start a new session in `lore-cli`, invoke $backlog-handover restore, and continue without reconfirmation.",
    "- Action: Supply the format-compatibility decision; the campaign will then restore and continue.",
  );
const historical = ["# Settled campaign", "", "**Lifecycle**: historical-non-executable", "", "Closed summary.", ""].join("\n");

function activeAtBoundary(lineCount, byteCount) {
  const lines = sessionRenewal.trimEnd().split("\n");
  while (lines.length < lineCount) lines.push("x");
  let body = lines.join("\n");
  const padding = byteCount - Buffer.byteLength(body, "utf8");
  if (padding < 0) throw new Error("requested active handover boundary is smaller than its fixture");
  body += "x".repeat(padding);
  return body;
}

function runCase(name, files, expectedStatus, expectedText, extraArguments = []) {
  const directory = join(root, name);
  mkdirSync(directory);
  for (const [file, body] of Object.entries(files)) writeFileSync(join(directory, file), body, { flag: "wx" });
  const groundedArguments = [
    "--expect-tracker", "doc-17",
    "--expect-sha", "0123456789abcdef0123456789abcdef01234567",
    "--expect-branch", "fix/lcli-329",
    "--expect-worktree", "/tmp/lcli-329",
    "--expect-state", "1,1,0,2",
  ];
  const argumentsForCase = extraArguments.includes("--complete")
    ? extraArguments
    : [...groundedArguments, ...extraArguments];
  const result = spawnSync(process.execPath, [auditPath, directory, ...argumentsForCase], { encoding: "utf8" });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedStatus || !output.includes(expectedText)) {
    throw new Error(`${name}: expected ${expectedStatus}/${JSON.stringify(expectedText)}; received ${result.status}\n${output}`);
  }
}

try {
  const boundary = activeAtBoundary(120, 16 * 1024);
  const vagueRenewal = sessionRenewal
    .replace("Run /clear, start a new session in `lore-cli`, then use $backlog-handover restore without reconfirmation.", "Continue later.")
    .replace("- Action: Run /clear, start a new session in `lore-cli`, invoke $backlog-handover restore, and continue without reconfirmation.", "- Action: Continue later.");
  const promptOnlyRenewal = sessionRenewal.replace(
    "- Action: Run /clear, start a new session in `lore-cli`, invoke $backlog-handover restore, and continue without reconfirmation.",
    "- Action: See prompt.",
  );
  const cases = [
    ["valid-session-renewal", { "active.md": sessionRenewal, "settled.md": historical }, 0, "sole grounded executable cursor"],
    ["valid-human-decision", { "active.md": humanDecision, "settled.md": historical }, 0, "sole grounded executable cursor"],
    ["contradictory-lifecycle-markers", { "active.md": sessionRenewal.replace("**Lifecycle**: executable-current", "**Lifecycle**: executable-current\n**Lifecycle**: historical-non-executable") }, 1, "no historical marker; found 1/1"],
    ["duplicate-cursor", { "active.md": sessionRenewal, "legacy.md": `${historical}\nUse $backlog-handover restore to continue.\n` }, 1, "legacy.md contains runnable signal(s): backlog-handover invocation"],
    ["historical-resume-lcli-328", { "active.md": sessionRenewal, "legacy.md": `${historical}\nResume LCLI-328\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-bulleted-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\n- Resume LCLI-329\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-quoted-bulleted-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\n> - Resume LCLI-329\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-nested-numbered-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\n  - 1. Resume LCLI-329\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-quoted-bulleted-continue", { "active.md": sessionRenewal, "legacy.md": `${historical}\n> - Continue this backlog campaign\n` }, 1, "legacy.md contains runnable signal(s): continue directive"],
    ["historical-resume-foreign-task", { "active.md": sessionRenewal, "legacy.md": `${historical}\nResume ODOC-54\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-formatted-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\n> **Resume LCLI-329**\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-linked-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\n[Resume LCLI-329](https://example.invalid)\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-numeric-entity-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\nResume&#32;LCLI-329\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-named-entity-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\nResume&nbsp;LCLI-329\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-ensp-entity-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\nResume&ensp;LCLI-329\n` }, 1, "encoded HTML entity"],
    ["historical-newline-entity-resume", { "active.md": sessionRenewal, "legacy.md": `${historical}\nResume&NewLine;LCLI-329\n` }, 1, "encoded HTML entity"],
    ["missing-stop-class", { "active.md": sessionRenewal.replace(/^\*\*Stop class\*\*.*\n/m, "") }, 1, "exactly one Stop class"],
    ["missing-grounding", { "active.md": sessionRenewal.replace(/^\*\*Grounded against\*\*.*\n/m, "") }, 1, "full SHA"],
    ["duplicate-stop-class", { "active.md": sessionRenewal.replace("**Stop class**: session-renewal", "**Stop class**: session-renewal\n**Stop class**: human-decision") }, 1, "found session-renewal, human-decision"],
    ["invalid-extra-stop-class", { "active.md": sessionRenewal.replace("**Stop class**: session-renewal", "**Stop class**: session-renewal\n**Stop class**: unclassified") }, 1, "found session-renewal, unclassified"],
    ["vague-session-renewal", { "active.md": vagueRenewal }, 1, "session-renewal Paste-ready prompt lacks /clear"],
    ["prompt-only-renewal", { "active.md": promptOnlyRenewal }, 1, "session-renewal Next action lacks /clear"],
    ["human-without-decision", { "active.md": humanDecision.replace("- Decision: Choose whether the public format may change.", "- Decision: None") }, 1, "human-decision cursor lacks"],
    ["missing-in-flight-row", { "active.md": sessionRenewal.replace("| LCLI-329 | fix/lcli-329 | 0123456789abcdef0123456789abcdef01234567, reviewed | Restore and deliver |\n", "") }, 1, "In flight table has 0 task rows but State declares 1"],
    ["unknown-in-flight-stage", { "active.md": sessionRenewal.replace("0123456789abcdef0123456789abcdef01234567, reviewed", "not known") }, 1, "lacks a full SHA plus a concrete lifecycle stage"],
    ["duplicate-ready-count", { "active.md": sessionRenewal.replace("- Ready: 2", "- Ready: 2\n- Ready: 999") }, 1, "exactly one numeric Ready count; found 2"],
    ["stale-grounded-cursor", { "active.md": sessionRenewal }, 1, "does not match expected SHA", ["--expect-sha", "ffffffffffffffffffffffffffffffffffffffff"]],
    ["branch-prefix-is-not-exact", { "active.md": sessionRenewal.replace("branch `fix/lcli-329`", "branch `fix/lcli-329-evil`") }, 1, "does not match expected branch fix/lcli-329"],
    ["worktree-prefix-is-not-exact", { "active.md": sessionRenewal.replace("worktree `/tmp/lcli-329`", "worktree `/tmp/lcli-329-evil`") }, 1, "does not match expected worktree /tmp/lcli-329"],
    ["fenced-required-sections", { "active.md": sessionRenewal.replace("## Paste-ready prompt", "```markdown\n## Paste-ready prompt").replace("## Exceptions", "```\n## Exceptions") }, 1, "must contain exactly one Paste-ready prompt section; found 0"],
    ["commented-required-section", { "active.md": sessionRenewal.replace("## State", "<!--\n## State").replace("## In flight", "-->\n## In flight") }, 1, "must contain exactly one State section; found 0"],
    ["unclosed-commented-required-sections", { "active.md": sessionRenewal.replace("## Paste-ready prompt", "<!--\n## Paste-ready prompt") }, 1, "must contain exactly one Paste-ready prompt section; found 0"],
    ["shorter-fence-does-not-close", { "active.md": sessionRenewal.replace("## Paste-ready prompt", "````markdown\n## Paste-ready prompt").replace("## State", "```\n## State") }, 1, "must contain exactly one Paste-ready prompt section; found 0"],
    ["duplicate-in-flight-id", { "active.md": sessionRenewal.replace("- In flight: 1", "- In flight: 2").replace("| LCLI-329 | fix/lcli-329 | 0123456789abcdef0123456789abcdef01234567, reviewed | Restore and deliver |", "| LCLI-329 | fix/lcli-329 | 0123456789abcdef0123456789abcdef01234567, reviewed | Restore and deliver |\n| LCLI-329 | fix/lcli-329 | 0123456789abcdef0123456789abcdef01234567, reviewed | Restore and deliver |") }, 1, "repeats task id LCLI-329"],
    ["exact-boundary", { "active.md": boundary, "settled.md": historical }, 0, "handover lifecycle audit passed"],
    ["line-overflow", { "active.md": `${boundary}\nextra` }, 1, "active.md exceeds 120 lines: 121"],
    ["byte-overflow", { "active.md": `${boundary}x` }, 1, "active.md exceeds 16384 bytes: 16385"],
    ["complete-no-cursor", { "settled.md": historical }, 0, "completed campaign has no executable cursor", ["--complete"]],
    ["complete-stale-cursor", { "active.md": sessionRenewal }, 1, "completed campaign retains active.md", ["--complete"]],
    ["complete-case-variant-cursor", { "active.MD": sessionRenewal }, 1, "completed campaign retains active.md", ["--complete"]],
  ];
  for (const [name, files, status, text, extraArguments] of cases) {
    runCase(name, files, status, text, extraArguments);
  }
  process.stdout.write(`handover lifecycle fixtures passed: ${cases.length} cases\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
