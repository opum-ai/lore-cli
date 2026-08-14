import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_MARKER = /^\*\*Lifecycle\*\*:\s*executable-current\s*$/im;
const HISTORICAL_MARKER = /^\*\*Lifecycle\*\*:\s*historical-non-executable\s*$/im;
const PASTE_READY_HEADING = /^##\s+Paste-ready prompt\s*$/im;
const MAX_ACTIVE_LINES = 120;
const MAX_ACTIVE_BYTES = 16 * 1024;
const RUNNABLE_SIGNALS = [
  ["paste-ready prompt", PASTE_READY_HEADING],
  ["continue directive", /^(?:Continue|Resume) (?:this|the) backlog campaign\b/im],
  ["task resume directive", /^(?:Continue|Resume) LCLI-[0-9]+(?:\.[0-9]+)*\b/im],
  ["safe-resume sequence", /^(?:##\s+Safe[- ]resume\b|Safe resume(?: sequence)?:)/im],
  ["backlog-handover invocation", /\$backlog-handover(?:\s+(?:init|restore|write|status))?\b/i],
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultDirectory = resolve(scriptDir, "../../../..", ".claude/handovers");
const handoverDirectory = resolve(process.argv[2] ?? defaultDirectory);
const failures = [];

if (!existsSync(handoverDirectory)) {
  failures.push(`handover directory is missing: ${handoverDirectory}`);
} else {
  const files = readdirSync(handoverDirectory)
    .filter((name) => name.endsWith(".md"))
    .sort();

  if (!files.includes("active.md")) failures.push("active.md is missing");

  const executableFiles = [];
  for (const name of files) {
    const body = readFileSync(resolve(handoverDirectory, name), "utf8");
    const current = CURRENT_MARKER.test(body);
    const signals = RUNNABLE_SIGNALS.filter(([, pattern]) => pattern.test(body)).map(([label]) => label);
    const executable = current || signals.length > 0;
    if (executable) executableFiles.push(name);

    if (name === "active.md") {
      if (!current) failures.push("active.md lacks **Lifecycle**: executable-current");
      if (!PASTE_READY_HEADING.test(body)) failures.push("active.md lacks a Paste-ready prompt section");
      const lineCount = body.split(/\r?\n/).length;
      const byteCount = Buffer.byteLength(body, "utf8");
      if (lineCount > MAX_ACTIVE_LINES) failures.push(`active.md exceeds ${MAX_ACTIVE_LINES} lines: ${lineCount}`);
      if (byteCount > MAX_ACTIVE_BYTES) failures.push(`active.md exceeds ${MAX_ACTIVE_BYTES} bytes: ${byteCount}`);
      continue;
    }

    if (current) failures.push(`${name} incorrectly carries the executable-current marker`);
    if (signals.length > 0) failures.push(`${name} contains runnable signal(s): ${signals.join(", ")}`);
    if (!HISTORICAL_MARKER.test(body)) failures.push(`${name} lacks **Lifecycle**: historical-non-executable`);
  }

  if (executableFiles.length !== 1 || executableFiles[0] !== "active.md") {
    failures.push(
      `expected active.md to be the sole executable handover; found ${executableFiles.length}: ${
        executableFiles.join(", ") || "none"
      }`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(`handover lifecycle audit failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("handover lifecycle audit passed: active.md is the sole executable cursor\n");
}
