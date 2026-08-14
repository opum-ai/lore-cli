import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const auditPath = join(scriptDirectory, "audit-campaign-tracker.mjs");

function trackerAtBoundary(lineCount, byteCount) {
  const lines = ["# Backlog campaign — LCLI-329", "## Contract", "- Mode: autonomous-docs"];
  while (lines.length < lineCount) lines.push("x");
  let body = lines.join("\n");
  const padding = byteCount - Buffer.byteLength(body, "utf8");
  if (padding < 0) throw new Error("requested campaign tracker boundary is smaller than its fixture");
  body += "x".repeat(padding);
  return body;
}

function runCase(name, body, expectedStatus, expectedText) {
  const result = spawnSync(process.execPath, [auditPath], { encoding: "utf8", input: body });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status !== expectedStatus || !output.includes(expectedText)) {
    throw new Error(`${name}: expected ${expectedStatus}/${JSON.stringify(expectedText)}; received ${result.status}\n${output}`);
  }
}

const boundary = trackerAtBoundary(200, 32 * 1024);
const cases = [
  ["exact-boundary", boundary, 0, "campaign tracker audit passed: 200 lines, 32768 bytes"],
  ["line-overflow", `${boundary}\nextra`, 1, "campaign tracker exceeds 200 lines: 201"],
  ["byte-overflow", `${boundary}x`, 1, "campaign tracker exceeds 32768 bytes: 32769"],
];
for (const [name, body, status, expectedText] of cases) runCase(name, body, status, expectedText);
process.stdout.write(`campaign tracker fixtures passed: ${cases.length} cases\n`);
