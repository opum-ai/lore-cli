import { readFileSync } from "node:fs";

const MAX_TRACKER_LINES = 200;
const MAX_TRACKER_BYTES = 32 * 1024;
const body = readFileSync(0, "utf8");
const lineCount = body.split(/\r?\n/).length;
const byteCount = Buffer.byteLength(body, "utf8");
const failures = [];

if (lineCount > MAX_TRACKER_LINES) failures.push(`campaign tracker exceeds ${MAX_TRACKER_LINES} lines: ${lineCount}`);
if (byteCount > MAX_TRACKER_BYTES) failures.push(`campaign tracker exceeds ${MAX_TRACKER_BYTES} bytes: ${byteCount}`);

if (failures.length > 0) {
  process.stderr.write(`campaign tracker audit failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `campaign tracker audit passed: ${lineCount} lines, ${byteCount} bytes (limits ${MAX_TRACKER_LINES} lines, ${MAX_TRACKER_BYTES} bytes)\n`,
  );
}
