# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately — do **not** open a public issue.

- Preferred: GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  ("Report a vulnerability" under the repository's **Security** tab).
- Or email **jeremy.newhouse@salientdata.ai**.

We will acknowledge your report and work with you on a fix and coordinated disclosure.

## Secrets & tokens

lore never stores credentials in the repository.

- The Confluence publish adapter reads its token **only** from the environment variable
  `LORE_CONFLUENCE_TOKEN`. Do not commit tokens or place them in `.lore/config.toml`.
- `.lore/config.toml` and `.lore/sync-state.json` are committed and must contain **no
  secrets** — only non-sensitive configuration and publish bookkeeping.

## Scope & supported versions

lore is pre-1.0; security fixes target the latest release on `main`. As lore shells out to
the `backlog` binary, keep Backlog.md updated to a supported version as well (lore enforces a
minimum version at startup).
