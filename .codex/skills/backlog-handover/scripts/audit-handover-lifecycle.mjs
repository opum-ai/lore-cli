import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CURRENT_MARKER = /^\*\*Lifecycle\*\*:\s*executable-current\s*$/gim;
const HISTORICAL_MARKER = /^\*\*Lifecycle\*\*:\s*historical-non-executable\s*$/gim;
const PASTE_READY_HEADING = /^##\s+Paste-ready prompt\s*$/im;
const GROUNDED_LINE = /^\*\*Grounded against\*\*:\s*repository `([^`]+)`; branch `([^`]+)`; SHA `([0-9a-f]{40})`; worktree `([^`]+)`; (.+)$/im;
const TRACKER_LINE = /^\*\*Tracker\*\*:\s*doc-[0-9]+\b.+$/im;
const MODE_LINE = /^\*\*Mode\*\*:\s*autonomous-docs\s*$/im;
const STOP_CLASS_LINE = /^\*\*Stop class\*\*:\s*(.+?)\s*$/gim;
const VALID_STOP_CLASSES = new Set(["human-decision", "session-renewal"]);
const STATE_COUNTS = ["Resolved", "In flight", "Blocked", "Ready"];
const REQUIRED_SECTIONS = ["Paste-ready prompt", "State", "In flight", "Retained artifacts", "Decision required", "Next action"];
const DECISION_LINE = /^- Decision:\s*(.+)$/gim;
const NEXT_ACTION_LINE = /^- Action:\s*(.+)$/gim;
const VERIFIED_STAGE = /\b[0-9a-f]{40}\b(?=[\s\S]*\b(?:planned|editing|implemented|committed|under review|reviewed|approved|pr opened|merged|settled|cleanup complete|blocked)\b)/i;
const MAX_ACTIVE_LINES = 120;
const MAX_ACTIVE_BYTES = 16 * 1024;
const HTML_ENTITY = /&(?:#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/;
const RUNNABLE_SIGNALS = [
  ["paste-ready prompt", PASTE_READY_HEADING],
  ["continue directive", /^\s*(?:(?:[-*+]\s+|[0-9]+[.)]\s+|>\s*))*(?:Continue|Resume) (?:this|the) backlog campaign\b/im],
  ["task resume directive", /^\s*(?:(?:[-*+]\s+|[0-9]+[.)]\s+|>\s*))*(?:Continue|Resume) [A-Z][A-Z0-9]*-[0-9]+(?:\.[0-9]+)*\b/im],
  ["safe-resume sequence", /^(?:##\s+Safe[- ]resume\b|Safe resume(?: sequence)?:)/im],
  ["backlog-handover invocation", /\$backlog-handover(?:\s+(?:init|restore|write|status))?\b/i],
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultDirectory = resolve(scriptDir, "../../../..", ".codex/handovers");
const argumentsList = process.argv.slice(2);
const completeMode = argumentsList.includes("--complete");
const valueOptions = new Set(["--expect-tracker", "--expect-sha", "--expect-branch", "--expect-worktree", "--expect-state"]);
const optionValues = new Map();
let directoryArgument;
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (valueOptions.has(argument)) {
    optionValues.set(argument, argumentsList[index + 1]);
    index += 1;
  } else if (argument !== "--complete" && !argument.startsWith("--") && !directoryArgument) {
    directoryArgument = argument;
  }
}
const handoverDirectory = resolve(directoryArgument ?? defaultDirectory);
const failures = [];

function sections(body, heading) {
  const lines = body.split(/\r?\n/);
  const bodies = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].toLowerCase() !== `## ${heading}`.toLowerCase()) continue;
    const section = [];
    for (index += 1; index < lines.length && !/^##\s+/.test(lines[index]); index += 1) {
      section.push(lines[index]);
    }
    index -= 1;
    bodies.push(section.join("\n"));
  }
  return bodies;
}

function visibleMarkdown(body) {
  const withoutComments = body.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => "\n".repeat(comment.split(/\r?\n/).length - 1));
  const visible = [];
  let fence;
  for (const line of withoutComments.split(/\r?\n/)) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && match) {
      fence = { marker: match[1][0], length: match[1].length };
      visible.push("");
      continue;
    }
    if (
      fence &&
      match?.[1]?.[0] === fence.marker &&
      match[1].length >= fence.length &&
      match[2].trim() === ""
    ) {
      fence = undefined;
      visible.push("");
      continue;
    }
    visible.push(fence ? "" : line);
  }
  return visible.join("\n");
}

function signalMarkdown(body) {
  return body
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (entity, hexadecimal, decimal) => {
      const codePoint = Number.parseInt(hexadecimal ?? decimal, hexadecimal ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&(nbsp|tab|newline);/gi, (entity, name) => ({ nbsp: " ", tab: "\t", newline: "\n" })[name.toLowerCase()] ?? entity)
    .replace(/<[^>]*>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "");
}

function tableRows(sectionBody) {
  return sectionBody
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .filter((cells) => cells[0]?.toLowerCase() !== "task");
}

if (!completeMode) {
  for (const option of valueOptions) {
    if (!optionValues.get(option)) failures.push(`nonterminal audit requires ${option}`);
  }
}

if (!existsSync(handoverDirectory)) {
  if (!completeMode) failures.push(`handover directory is missing: ${handoverDirectory}`);
} else {
  const files = readdirSync(handoverDirectory, { withFileTypes: true })
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => entry.name)
    .sort();

  const activeNameVariants = files.filter((name) => name.toLowerCase() === "active.md");
  if (completeMode && activeNameVariants.length > 0) {
    failures.push("completed campaign retains active.md");
  } else if (!completeMode && !files.includes("active.md")) {
    failures.push("active.md is missing");
  }

  const executableFiles = [];
  for (const name of files) {
    const body = readFileSync(resolve(handoverDirectory, name), "utf8");
    const visibleBody = visibleMarkdown(body);
    const signalBody = signalMarkdown(visibleBody);
    const currentMarkers = [...visibleBody.matchAll(CURRENT_MARKER)];
    const historicalMarkers = [...visibleBody.matchAll(HISTORICAL_MARKER)];
    const current = currentMarkers.length > 0;
    const signals = RUNNABLE_SIGNALS.filter(([, pattern]) => pattern.test(signalBody)).map(([label]) => label);
    if (HTML_ENTITY.test(visibleBody)) signals.push("encoded HTML entity");
    const executable = current || signals.length > 0;
    if (executable) executableFiles.push(name);

    if (name === "active.md") {
      if (completeMode) continue;
      if (currentMarkers.length !== 1 || historicalMarkers.length !== 0) {
        failures.push(
          `active.md must contain exactly one executable-current marker and no historical marker; found ${currentMarkers.length}/${historicalMarkers.length}`,
        );
      }
      const groundedMatch = visibleBody.match(GROUNDED_LINE);
      const groundedLine = groundedMatch?.[0];
      const trackerLine = visibleBody.match(TRACKER_LINE)?.[0];
      if (!PASTE_READY_HEADING.test(visibleBody)) failures.push("active.md lacks a Paste-ready prompt section");
      if (!groundedLine) failures.push("active.md lacks a canonical Grounded against line with a full SHA");
      if (!trackerLine) failures.push("active.md lacks a concrete doc-N Tracker line");
      if (!MODE_LINE.test(visibleBody)) failures.push("active.md lacks **Mode**: autonomous-docs");

      const stopMatches = [...visibleBody.matchAll(STOP_CLASS_LINE)];
      if (stopMatches.length !== 1 || !VALID_STOP_CLASSES.has(stopMatches[0]?.[1]?.trim())) {
        failures.push(
          `active.md must contain exactly one Stop class from human-decision or session-renewal; found ${
            stopMatches.map((match) => match[1]?.trim()).join(", ") || "none"
          }`,
        );
      }
      const sectionMap = new Map();
      for (const heading of REQUIRED_SECTIONS) {
        const found = sections(visibleBody, heading);
        if (found.length !== 1) {
          failures.push(`active.md must contain exactly one ${heading} section; found ${found.length}`);
        }
        sectionMap.set(heading, found[0] ?? "");
      }

      const stateSection = sectionMap.get("State");
      const actualState = [];
      for (const label of STATE_COUNTS) {
        const matches = [...stateSection.matchAll(new RegExp(`^- ${label}:\\s*([0-9]+)(?:\\s|$)`, "gim"))];
        if (matches.length !== 1) {
          failures.push(`active.md State must contain exactly one numeric ${label} count; found ${matches.length}`);
        }
        actualState.push(matches[0]?.[1]);
      }

      const inFlightRows = tableRows(sectionMap.get("In flight"));
      const expectedInFlightRows = Number(actualState[1]);
      if (Number.isInteger(expectedInFlightRows) && inFlightRows.length !== expectedInFlightRows) {
        failures.push(
          `active.md In flight table has ${inFlightRows.length} task rows but State declares ${expectedInFlightRows}`,
        );
      }
      const seenTaskIds = new Set();
      for (const [index, cells] of inFlightRows.entries()) {
        if (cells.length < 4) failures.push(`active.md In flight row ${index + 1} has fewer than four cells`);
        if (!/^LCLI-[0-9]+(?:\.[0-9]+)*$/.test(cells[0] ?? "")) {
          failures.push(`active.md In flight row ${index + 1} lacks a Lore CLI task id`);
        } else if (seenTaskIds.has(cells[0])) {
          failures.push(`active.md In flight table repeats task id ${cells[0]}`);
        } else {
          seenTaskIds.add(cells[0]);
        }
        if (!cells[1] || cells[1] === "-" || cells[1].startsWith("<")) {
          failures.push(`active.md In flight row ${index + 1} lacks a branch/worktree`);
        }
        if (!VERIFIED_STAGE.test(cells[2] ?? "")) {
          failures.push(`active.md In flight row ${index + 1} lacks a full SHA plus a concrete lifecycle stage`);
        }
      }

      const decisionMatches = [...sectionMap.get("Decision required").matchAll(DECISION_LINE)];
      const actionMatches = [...sectionMap.get("Next action").matchAll(NEXT_ACTION_LINE)];
      if (decisionMatches.length !== 1) failures.push("active.md Decision required section must contain exactly one Decision line");
      if (actionMatches.length !== 1) failures.push("active.md Next action section must contain exactly one Action line");
      const decision = decisionMatches[0]?.[1]?.trim();
      const nextAction = actionMatches[0]?.[1]?.trim();
      if (!nextAction || nextAction.startsWith("<")) failures.push("active.md lacks an exact next action");
      if (!/\$backlog-handover\s+restore\b/i.test(sectionMap.get("Paste-ready prompt"))) {
        failures.push("active.md Paste-ready prompt lacks $backlog-handover restore");
      }
      const stopClass = stopMatches[0]?.[1]?.trim();
      if (stopClass === "human-decision") {
        if (!decision || decision.startsWith("<") || /^none\b/i.test(decision)) {
          failures.push("human-decision cursor lacks the exact decision or blocker");
        }
      }
      if (stopClass === "session-renewal") {
        if (!/^none\s+[—-]\s+session renewal$/i.test(decision ?? "")) {
          failures.push("session-renewal cursor must state that no human decision is required");
        }
        const renewalSignals = [
          ["/clear", /\/clear\b/i],
          ["a new lore-cli session", /start a new session in [`']?lore-cli[`']?/i],
          ["$backlog-handover restore", /\$backlog-handover\s+restore\b/i],
          ["without reconfirmation", /without reconfirmation/i],
        ];
        for (const [label, pattern] of renewalSignals) {
          if (!pattern.test(sectionMap.get("Paste-ready prompt"))) {
            failures.push(`session-renewal Paste-ready prompt lacks ${label}`);
          }
          if (!pattern.test(sectionMap.get("Next action"))) {
            failures.push(`session-renewal Next action lacks ${label}`);
          }
        }
      }

      const expectedTracker = optionValues.get("--expect-tracker");
      const expectedSha = optionValues.get("--expect-sha");
      const expectedBranch = optionValues.get("--expect-branch");
      const expectedWorktree = optionValues.get("--expect-worktree");
      const expectedState = optionValues.get("--expect-state");
      const actualTracker = trackerLine?.match(/^\*\*Tracker\*\*:\s*(doc-[0-9]+)\b/i)?.[1];
      if (expectedTracker && actualTracker !== expectedTracker) {
        failures.push(`active.md tracker does not match expected ${expectedTracker}`);
      }
      const actualBranch = groundedMatch?.[2];
      const actualSha = groundedMatch?.[3];
      const actualWorktree = groundedMatch?.[4];
      if (expectedSha && actualSha !== expectedSha) failures.push(`active.md Grounded against does not match expected SHA ${expectedSha}`);
      if (expectedBranch && actualBranch !== expectedBranch) failures.push(`active.md Grounded against does not match expected branch ${expectedBranch}`);
      if (expectedWorktree && (!actualWorktree || resolve(actualWorktree) !== resolve(expectedWorktree))) {
        failures.push(`active.md Grounded against does not match expected worktree ${expectedWorktree}`);
      }
      if (expectedState && actualState.join(",") !== expectedState) {
        failures.push(`active.md state ${actualState.join(",")} does not match expected ${expectedState}`);
      }
      const lineCount = body.split(/\r?\n/).length;
      const byteCount = Buffer.byteLength(body, "utf8");
      if (lineCount > MAX_ACTIVE_LINES) {
        failures.push(`active.md exceeds ${MAX_ACTIVE_LINES} lines: ${lineCount}`);
      }
      if (byteCount > MAX_ACTIVE_BYTES) {
        failures.push(`active.md exceeds ${MAX_ACTIVE_BYTES} bytes: ${byteCount}`);
      }
      continue;
    }

    if (currentMarkers.length > 0) failures.push(`${name} incorrectly carries the executable-current marker`);
    if (signals.length > 0) failures.push(`${name} contains runnable signal(s): ${signals.join(", ")}`);
    if (historicalMarkers.length !== 1) {
      failures.push(`${name} must contain exactly one **Lifecycle**: historical-non-executable marker; found ${historicalMarkers.length}`);
    }
  }

  const expectedExecutableCount = completeMode ? 0 : 1;
  if (
    executableFiles.length !== expectedExecutableCount ||
    (!completeMode && executableFiles[0] !== "active.md")
  ) {
    failures.push(
      `expected ${completeMode ? "no executable handover" : "active.md to be the sole executable handover"}; found ${executableFiles.length}: ${
        executableFiles.join(", ") || "none"
      }`,
    );
  }
}

if (failures.length > 0) {
  process.stderr.write(`handover lifecycle audit failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    completeMode
      ? "handover lifecycle audit passed: completed campaign has no executable cursor\n"
      : "handover lifecycle audit passed: active.md is the sole grounded executable cursor\n",
  );
}
