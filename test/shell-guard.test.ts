// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the strings are shell commands under test; ${var} is zsh syntax, not a missed template.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findShellFootguns, type ShellFinding } from "../.claude/hooks/shell-guard.ts";

// LCLI-591. Each case names the ONE rule it exercises, so a mutation of a single rule should
// redden exactly the cases listed under it and leave the rest green.
const rules = (command: string): ShellFinding["rule"][] => findShellFootguns(command).map((f) => f.rule);

const REFUSED: ReadonlyArray<readonly [ShellFinding["rule"], string]> = [
  ["revert-quiet", "git revert --no-edit HEAD -q"],
  ["revert-quiet", "git revert --quiet abc123"],
  ["revert-amend", "git revert --no-edit HEAD && git commit --amend -m x"],
  ["revert-amend", "git revert --no-edit HEAD >/dev/null; git commit -q --amend -F msg"],
  ["set-positional", 'r=$(gh api x -q ".a"); set -- $r; [ "$1" -ge 14 ]'],
  ["set-positional", "set -- ${r}"],
  ["for-in-var", "files=$(ls); for f in $files; do echo $f; done"],
  ["flag-stash", 'A="--actor x --actor-kind human"; quest task edit T-1 $A'],
  ["flag-stash", "FLAGS=-euo; bash_thing ${FLAGS}"],
  ["command-stash", 'L="bun src/cli.ts"; $L init'],
];

const ACCEPTED: ReadonlyArray<readonly [string, string]> = [
  ["revert alone", "git revert --no-edit HEAD"],
  ["amend alone", "git commit -q --amend -m x"],
  ["zsh split flag", "set -- ${=r}"],
  ["quoted positional", 'set -- "$r"'],
  ["for over command substitution", "for f in $(ls); do echo $f; done"],
  ["for over split flag", "for f in ${=files}; do :; done"],
  ["quoted flag variable", 'A="--x y"; printf "%s" "$A"'],
  ["bash -c wraps splitting", "bash -c 'r=$(echo 1 2); set -- $r; echo $2'"],
  ["bash with options and -c", "bash -euo pipefail -c 'for f in $files; do :; done'"],
  ["value without a dash or space", "N=3; echo $N"],
  ["jq comparison is not an assignment", `gh api x -q '.check_runs[] | select(.name=="y")'`],
  ["long flag with =", "quest task edit T --final-summary=x --actor-kind=human"],
  ["allow marker", "git revert HEAD -q # shell-guard: allow"],
];

describe("shell-guard refuses the recorded footguns", () => {
  for (const [rule, command] of REFUSED) {
    test(`${rule}: ${command}`, () => {
      expect(rules(command)).toContain(rule);
    });
  }
});

describe("shell-guard accepts the safe forms", () => {
  for (const [label, command] of ACCEPTED) {
    test(label, () => {
      expect(rules(command)).toEqual([]);
    });
  }
});

describe("shell-guard as a PreToolUse hook", () => {
  const script = join(import.meta.dir, "..", ".claude", "hooks", "shell-guard.ts");
  const run = (event: unknown) => {
    const proc = Bun.spawnSync(["bun", script], { stdin: Buffer.from(JSON.stringify(event)) });
    return { code: proc.exitCode, stderr: proc.stderr.toString() };
  };

  test("exits 2 with the rule on stderr for a refused Bash command", () => {
    const out = run({ tool_name: "Bash", tool_input: { command: "set -- $r" } });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("set-positional");
  });

  test("exits 0 for a safe command and for a non-Bash tool", () => {
    expect(run({ tool_name: "Bash", tool_input: { command: "git status" } }).code).toBe(0);
    expect(run({ tool_name: "Read", tool_input: { file_path: "/x" } }).code).toBe(0);
  });
});
