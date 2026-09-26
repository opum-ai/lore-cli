#!/usr/bin/env bun
// PreToolUse guard for the Bash tool (LCLI-591). Refuses two command shapes that recurred in
// this repository with memory notes loaded that described them exactly — a note does not fire
// at the moment of writing; this does.
//
// 1. `git revert` has no `-q`. It fails, and a `git commit --amend` later in the same call then
//    rewrites the commit that was meant to be reverted (LCLI-539, again LCLI-588).
// 2. The Bash tool runs zsh, which does NOT word-split an unquoted parameter expansion:
//    `set -- $r`, `for x in $list` and `cmd $FLAGS` each see ONE word. The failure is silent
//    when a poll loop never breaks (2026-09-23, 2026-09-25). Commands handed to `bash -c` /
//    `sh -c` split normally and are exempt from these checks.
//
// Wiring: registered from .claude/settings.local.json (gitignored, like settings.json, because
// both carry per-operator identity), as a PreToolUse hook on Bash running
// `bun "$CLAUDE_PROJECT_DIR/.claude/hooks/shell-guard.ts"`. Exit 2 refuses the call and shows
// stderr to the model. A command containing `# shell-guard: allow` is passed through, for the
// rare legitimate use.

export interface ShellFinding {
  readonly rule: "revert-quiet" | "revert-amend" | "set-positional" | "for-in-var" | "flag-stash" | "command-stash";
  readonly message: string;
}

const ALLOW_MARKER = "# shell-guard: allow";
// A `bash -c`, `sh -c`, `bash -euo pipefail -c` or heredoc-fed bash: word splitting works there.
const SPLITTING_SHELL = /(?:^|[\s;&|(`])(?:bash|sh)\b[^;&|\n]*?\s(?:-c\b|<<)/;
const IDENT = "[A-Za-z_][A-Za-z0-9_]*";

function escape(name: string): string {
  return name.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
}

// A bare `$NAME` / `${NAME}` word: preceded by start or whitespace, so "$NAME" and ${=NAME} are not.
function bareUse(name: string): RegExp {
  return new RegExp(`(?:^|\\s)\\$(?:\\{${escape(name)}\\}|${escape(name)}(?![A-Za-z0-9_]))`);
}

export function findShellFootguns(command: string): ShellFinding[] {
  if (command.includes(ALLOW_MARKER)) return [];
  const findings: ShellFinding[] = [];

  if (/\bgit\s+revert\b[^;&|\n]*\s(?:-q|--quiet)(?=\s|$)/.test(command)) {
    findings.push({
      rule: "revert-quiet",
      message: "`git revert` has no -q/--quiet: it fails, and anything chained after it runs against the unreverted commit. Drop the flag.",
    });
  }
  if (/\bgit\s+revert\b/.test(command) && /--amend\b/.test(command)) {
    findings.push({
      rule: "revert-amend",
      message:
        "`git revert` and `--amend` in one command: if the revert fails, the amend rewrites the commit you meant to revert. Revert alone, check `git diff --stat <clean-sha> HEAD`, then reword separately.",
    });
  }

  if (SPLITTING_SHELL.test(command)) return findings;

  if (/\bset\s+--\s+\$(?:\{(?!=)|[A-Za-z_])/.test(command)) {
    findings.push({
      rule: "set-positional",
      message: "zsh does not split `set -- $var`: it sets ONE positional. Use `set -- ${=var}`, or run the loop under `bash -c '...'`.",
    });
  }
  if (new RegExp(`\\bfor\\s+${IDENT}\\s+in\\s+\\$(?:\\{(?!=)|[A-Za-z_])`).test(command)) {
    findings.push({
      rule: "for-in-var",
      message: "zsh does not split `for x in $var`: the loop runs once over the whole value. Use `${=var}`, `$(cmd)` directly, or `bash -c`.",
    });
  }

  const assignment = new RegExp(`(?:^|[\\s;&|(])(${IDENT})=(["']?)([^"'\\s]?)`, "g");
  const flagged = new Set<string>();
  for (const match of command.matchAll(assignment)) {
    const [, name, quote, first] = match;
    if (!name || flagged.has(name)) continue;
    const valueStart = (match.index ?? 0) + match[0].length - (first ?? "").length;
    if (first === "-" && bareUse(name).test(command.slice(valueStart))) {
      flagged.add(name);
      findings.push({
        rule: "flag-stash",
        message: `\`${name}\` holds flags and is expanded unquoted: zsh passes it as ONE argument. Write the flags out, or use \${=${name}}.`,
      });
      continue;
    }
    if (quote) {
      const closing = command.indexOf(quote, valueStart);
      const value = closing === -1 ? "" : command.slice(valueStart, closing);
      const asCommand = new RegExp(`(?:^|[;&|\\n(]\\s*)\\$\\{?${escape(name)}\\}?(?![A-Za-z0-9_])\\s`);
      if (/\s/.test(value) && asCommand.test(command.slice(closing + 1))) {
        flagged.add(name);
        findings.push({
          rule: "command-stash",
          message: `\`$${name}\` is run as a command but holds several words: zsh looks up the whole string as one command name. Write the command out, or use a shell function.`,
        });
      }
    }
  }
  return findings;
}

if (import.meta.main) {
  const input = await Bun.stdin.text();
  let command = "";
  try {
    const event = JSON.parse(input) as { tool_name?: string; tool_input?: { command?: unknown } };
    if (event.tool_name === "Bash" && typeof event.tool_input?.command === "string") command = event.tool_input.command;
  } catch {
    process.exit(0); // Not an event this guard understands: never block on its own parse failure.
  }
  const findings = findShellFootguns(command);
  if (findings.length > 0) {
    for (const finding of findings) console.error(`shell-guard (${finding.rule}): ${finding.message}`);
    console.error(`Add \`${ALLOW_MARKER}\` to the command only if the shape is intended.`);
    process.exit(2);
  }
}
