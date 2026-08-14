import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const auditPath = join(scriptDirectory, "audit-handover-lifecycle.mjs");
const root = mkdtempSync(join(tmpdir(), "backlog-handover-lifecycle-"));
const active = ["# Campaign handover", "", "**Lifecycle**: executable-current", "", "## Paste-ready prompt", "", "$backlog-handover restore", ""].join("\n");
const historical = ["# Settled campaign", "", "**Lifecycle**: historical-non-executable", "", "Closed summary.", ""].join("\n");

function activeAtBoundary(lineCount, byteCount) {
  const lines = ["# Campaign handover", "", "**Lifecycle**: executable-current", "", "## Paste-ready prompt", "", "$backlog-handover restore"];
  while (lines.length < lineCount) lines.push("x");
  let body = lines.join("\n");
  const padding = byteCount - Buffer.byteLength(body, "utf8");
  if (padding < 0) throw new Error("requested active handover boundary is smaller than its fixture");
  body += "x".repeat(padding);
  return body;
}

function runCase(name, files, expectedStatus, expectedText) {
  const directory = join(root, name);
  mkdirSync(directory);
  for (const [file, body] of Object.entries(files)) writeFileSync(join(directory, file), body, { flag: "wx" });
  const result = spawnSync(process.execPath, [auditPath, directory], { encoding: "utf8" });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedStatus || !output.includes(expectedText)) {
    throw new Error(`${name}: expected ${expectedStatus}/${JSON.stringify(expectedText)}; received ${result.status}\n${output}`);
  }
}

try {
  const boundary = activeAtBoundary(120, 16 * 1024);
  const cases = [
    ["valid", { "active.md": active, "settled.md": historical }, 0, "handover lifecycle audit passed"],
    ["duplicate-cursor", { "active.md": active, "legacy.md": `${historical}\nUse $backlog-handover restore to continue.\n` }, 1, "legacy.md contains runnable signal(s): backlog-handover invocation"],
    ["historical-resume-lcli-329", { "active.md": active, "legacy.md": `${historical}\nResume LCLI-329\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["historical-continue-dotted-lcli", { "active.md": active, "legacy.md": `${historical}\nContinue LCLI-329.5.1\n` }, 1, "legacy.md contains runnable signal(s): task resume directive"],
    ["exact-boundary", { "active.md": boundary, "settled.md": historical }, 0, "handover lifecycle audit passed"],
    ["line-overflow", { "active.md": `${boundary}\nextra` }, 1, "active.md exceeds 120 lines: 121"],
    ["byte-overflow", { "active.md": `${boundary}x` }, 1, "active.md exceeds 16384 bytes: 16385"],
  ];
  for (const [name, files, status, expectedText] of cases) runCase(name, files, status, expectedText);
  process.stdout.write(`handover lifecycle fixtures passed: ${cases.length} cases\n`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
