# Change log

## docs

- 2026-06-21T01:22:19-05:00 ca8556d32818dad7b5ec6783d11ba869fd40e2d7 docs: author the OKF documentation bundle
- 2026-06-21T01:33:34-05:00 6d9a4616532442ac469a704e1ab28b18262f27b4 docs(runbook): add developer kickoff handover
- 2026-07-12T15:03:25-05:00 04070c650306cb37843c3828f13816b73590ae65 feat(LORE-39): lore scaffold mkdocs — additive MkDocs consumer config (#45)
- 2026-07-12T15:13:04-05:00 a8e1cb65e9afc08e52f7a293f111e4c038ddec00 feat(LORE-9): release pipeline mechanics — compiled binaries + dual-artifact npm publish (#48)
- 2026-07-16T10:37:34-05:00 5e0e6c8b2b3add1990ec2b5b15acfd09b74bdd5f feat(LORE-40): lore scaffold docusaurus — website/ + build smoke test (#49)
- 2026-07-18T22:08:41-05:00 6475cc54afcc5c387924b774397e868068d532c4 docs(LORE-52): reconcile stale remark/unified references vs shipped stack
- 2026-07-19T10:25:07-05:00 9650cd44bdb8a1b2e2c0e43da30bcde8cd91e1bc feat(LORE-56): Docker E2E test harness — real lore + pinned upstream Backlog.md (#52)
- 2026-07-24T22:21:41-05:00 2e84d2bf13f643fe3c0be39656a66a930f7fdcc8 docs(LORE-254): document the upstream Backlog.md watch runbook
- 2026-07-25T14:25:25-05:00 1d985157372c3a831a34e1fd6c3f1f04fc59ff2f docs(init): document the TTY-gated wizard (ADR-0017) and the one-command flow
- 2026-07-25T15:19:21-05:00 346d3c15b2d3052da110051a0927996a311cb428 chore(docs): regenerate log.md via lore sync
- 2026-07-26T23:21:11-05:00 c37c689b9f64ba2175a9eefb386992cb845574fd fix(release): close round-5 readiness issues
- 2026-07-28T08:20:58-05:00 6ceccfb6b36ecd6679d85edec33252364c046094 feat: add Claude and Codex init onboarding
- 2026-07-28T11:38:12-05:00 0af37a96f85c864e8e2c2c170d116e6ea7eb4a47 chore: reconcile LORE-281 handoff metadata

## docs/.obsidian

- 2026-07-27T07:17:12-05:00 047857cc4bb96060430c1735c5b6e46fd268cdf4 feat: add deterministic OKF projection export

## docs/adr

- 2026-06-21T01:22:19-05:00 ca8556d32818dad7b5ec6783d11ba869fd40e2d7 docs: author the OKF documentation bundle
- 2026-06-25T05:48:58-05:00 08411e3a152487007d4e3fb4ebfd3c400fd2d512 feat(LORE-16): bundle.ts — walk docs/, build the concept + cross-link graph (#13)
- 2026-06-25T18:45:18-05:00 61d5b731ce59ce7ac312f881b7be952a984da254 feat(LORE-46): declarative .lore/profile.toml — generate validators from data (#17)
- 2026-06-26T16:15:03-05:00 8249d9e982d4c1b1d3d26053b387beb5290f9aa8 feat(LORE-47): GitAdapter seam + git-history log.md; resource stamping (#18)
- 2026-06-27T22:58:52-05:00 96a69bc863cab30e70203258f10783c39ddfbd61 feat(LORE-30): lore check — internal link/anchor validation + portability lint (#21)
- 2026-07-01T10:15:35-05:00 b9049fe69da203ea7f940e88c7bf68d782004091 feat(LORE-48): lore check follow-ups — --external liveness + MDX/filename portability rules (#29)
- 2026-07-02T07:21:25-05:00 22ccd6b5aa366aa3cfb55333bf5a19f8af4d45f7 feat(LORE-22): managed-block.ts — regenerate the lore:tasks region from live Backlog data (#33)
- 2026-07-06T16:05:54-05:00 6361851bbe0699b09a4830fd8dcaad9b9794aa19 feat(LORE-24): lore link / unlink — wire tasks: frontmatter to Backlog (#35)
- 2026-07-06T21:13:16-05:00 dfe23140a63d8534211e26446ed37000359f2b2e feat(LORE-26): lore sync — reconcile status, regen managed blocks/index/log, commit backlog/ (#36)
- 2026-07-12T15:03:25-05:00 04070c650306cb37843c3828f13816b73590ae65 feat(LORE-39): lore scaffold mkdocs — additive MkDocs consumer config (#45)
- 2026-07-12T15:07:03-05:00 46fcf1c79d59e2d613cae38f79bbd9f94044f4fd docs(LORE-14): Bun compile-compatibility spike — EXDEV trap + tech-stack corrections (#47)
- 2026-07-12T15:13:04-05:00 a8e1cb65e9afc08e52f7a293f111e4c038ddec00 feat(LORE-9): release pipeline mechanics — compiled binaries + dual-artifact npm publish (#48)
- 2026-07-17T18:45:29-05:00 2f76fce661220ac7eeaca43ee9e3eb464ac7db2e docs(LORE-5): adopt upstream's --json contract instead of upstreaming the fork
- 2026-07-18T12:55:44-05:00 173605e0b529d7c84a9a51df2ecc708f06fbbab7 feat(LORE-54): rewrite backlog adapter against upstream's real --json contract
- 2026-07-18T21:31:16-05:00 01c5b6735a76500abe056615a3bcf0dc894bce2f docs(LORE-5): record the Backlog.md release gate on lore's own v1 publish
- 2026-07-18T22:08:41-05:00 6475cc54afcc5c387924b774397e868068d532c4 docs(LORE-52): reconcile stale remark/unified references vs shipped stack
- 2026-07-19T15:45:42-05:00 b8a46675ba0b51b85d9de6c929d7dff472f6fbef docs(LORE-60): fix ADR-0002 exit-code claim for missing vs incapable backlog (#56)
- 2026-07-19T18:30:06-05:00 8c7c43e7e3d1859598a4d0fde426f5f5acac1c31 fix(LORE-67): remove leftover false validate-options claim in ADR-0013
- 2026-07-19T18:30:06-05:00 ea60fd696798a34a1fcf6a9ffa7748dfb8fbfc04 fix(LORE-67): correct stale CLI-surface claims and dead validate config knobs
- 2026-07-25T09:22:49-05:00 3f5f53abb7ed2d426d204b2e411a9472eea4ebe0 docs: fix stale publish-job description in tech-stack.md and ADR-0001
- 2026-07-25T09:22:49-05:00 5052ebc5f4f28501e9eb9b65f6dbe05c6a224886 docs(release-publishing): fix os/cpu dry-run claim + npm-floor wording
- 2026-07-25T14:25:25-05:00 1d985157372c3a831a34e1fd6c3f1f04fc59ff2f docs(init): document the TTY-gated wizard (ADR-0017) and the one-command flow
- 2026-07-25T14:25:25-05:00 a64b1b5344b35854f5fd92e2c69ef2a6d6b5f15e docs(init): correct ADR-0017/CHANGELOG accuracy claims from review
- 2026-07-25T15:19:21-05:00 e6a1aeeccbd6102d890152808148593c82d2c764 fix(docs): correct three stale stdin-only descriptions of the init TTY gate
- 2026-07-26T07:33:17-05:00 135bb3bf718cc92d513fb230182a593a13da8200 docs(adr): fix --label-vs-add-label drift found in LORE-265's wider sweep
- 2026-07-26T07:33:17-05:00 24010c650030d6d384ef4b0c6881ef3399a39a7c docs(adr-0009): correct §2's orphans data-source and ownership-rule claims
- 2026-07-26T21:25:31-05:00 0f15038ddbe6f7e0adf3fc755c1c71562227034b fix(wave2-integration): correct cd-carve-out misattribution and commaJoin universality claim
- 2026-07-26T21:25:31-05:00 dccfabfe1eea13ceeee034c70cc21ab68d52c8b1 docs(wave2-integration): fix label-flag comment/test contradictions and ADR-0002 item 6

## docs/reference

- 2026-06-21T01:22:19-05:00 ca8556d32818dad7b5ec6783d11ba869fd40e2d7 docs: author the OKF documentation bundle
- 2026-06-23T08:14:32-05:00 11946f5b6fc4baf3505d1b199a335abd1604f453 feat(LORE-11): shared error model, exit codes, and warning collector (#9)
- 2026-06-27T22:58:52-05:00 96a69bc863cab30e70203258f10783c39ddfbd61 feat(LORE-30): lore check — internal link/anchor validation + portability lint (#21)
- 2026-06-28T20:04:43-05:00 1fb8b277274be3a03d39c8eccb7737e4f6f94032 feat(LORE-31): lore graph — cross-link graph export + shared subgraph traversal (#26)
- 2026-06-28T21:18:21-05:00 63c0e31765d5adbf8b09eea457393c37e0bea63f feat(LORE-34): lore context — token-budgeted graph-expansion pack (#27)
- 2026-07-01T10:15:35-05:00 b9049fe69da203ea7f940e88c7bf68d782004091 feat(LORE-48): lore check follow-ups — --external liveness + MDX/filename portability rules (#29)
- 2026-07-01T20:05:43-05:00 2ba86aaaeddf1d5a694d9bd83e7ce57fcc8816cb feat(LORE-4): backlog capability probe + verified compiled fork binary (#30)
- 2026-07-06T16:05:54-05:00 6361851bbe0699b09a4830fd8dcaad9b9794aa19 feat(LORE-24): lore link / unlink — wire tasks: frontmatter to Backlog (#35)
- 2026-07-06T21:13:16-05:00 dfe23140a63d8534211e26446ed37000359f2b2e feat(LORE-26): lore sync — reconcile status, regen managed blocks/index/log, commit backlog/ (#36)
- 2026-07-07T08:00:34-05:00 06a80638088e0f17541972b1025eaab7236c8ba7 feat(LORE-27): lore check — status reconciliation + managed-block drift (#37)
- 2026-07-09T06:53:43-05:00 7bdfb15c6a12f7c67f6a0364894602f986041262 feat(LORE-37): lore instructions -- layered agent guides (#39)
- 2026-07-10T08:45:44-05:00 19174d569425c7e9b31c8a368d6128141453980c feat(LORE-38): lore help — capability manifest + manifest-driven help (#41)
- 2026-07-10T11:54:35-05:00 d655965982e8fe08a84a4801590ab1db642a2671 feat(LORE-25): lore tasks — a concept's live Backlog task rollup (#42)
- 2026-07-10T13:30:16-05:00 13d1d45197c1342dcc248f5491989e569b9d5df5 feat(LORE-32): lore orphans — bidirectional doc↔task coupling report (#43)
- 2026-07-11T08:10:01-05:00 387f3b923e11372761d7755baa9b78912a56db42 feat(LORE-49): link/unlink/rename commit their backlog/ writes immediately (#44)
- 2026-07-12T15:03:25-05:00 04070c650306cb37843c3828f13816b73590ae65 feat(LORE-39): lore scaffold mkdocs — additive MkDocs consumer config (#45)
- 2026-07-12T15:07:03-05:00 46fcf1c79d59e2d613cae38f79bbd9f94044f4fd docs(LORE-14): Bun compile-compatibility spike — EXDEV trap + tech-stack corrections (#47)
- 2026-07-12T15:13:04-05:00 a8e1cb65e9afc08e52f7a293f111e4c038ddec00 feat(LORE-9): release pipeline mechanics — compiled binaries + dual-artifact npm publish (#48)
- 2026-07-16T10:37:34-05:00 5e0e6c8b2b3add1990ec2b5b15acfd09b74bdd5f feat(LORE-40): lore scaffold docusaurus — website/ + build smoke test (#49)
- 2026-07-17T18:45:29-05:00 2f76fce661220ac7eeaca43ee9e3eb464ac7db2e docs(LORE-5): adopt upstream's --json contract instead of upstreaming the fork
- 2026-07-18T09:33:31-05:00 f27f9ea98a7f0865ed42f7a4c8a9fd07443574a7 feat(LORE-53): migrate capability probe to upstream's --json contract
- 2026-07-18T12:55:44-05:00 173605e0b529d7c84a9a51df2ecc708f06fbbab7 feat(LORE-54): rewrite backlog adapter against upstream's real --json contract
- 2026-07-18T20:21:05-05:00 be880319291c75ae7d7ab4ec3ee64dfe6bf497d4 fix(LORE-55): resolve PR #50 code-review findings for lore scaffold obsidian (#51)
- 2026-07-18T22:08:41-05:00 6475cc54afcc5c387924b774397e868068d532c4 docs(LORE-52): reconcile stale remark/unified references vs shipped stack
- 2026-07-19T12:17:20-05:00 63667ed2946c006796bdd6c7b8aaaf4f243c4ad4 fix(LORE-58): route link/unlink partial failures through the standard ErrorEnvelope (#54)
- 2026-07-19T18:30:06-05:00 ea60fd696798a34a1fcf6a9ffa7748dfb8fbfc04 fix(LORE-67): correct stale CLI-surface claims and dead validate config knobs
- 2026-07-21T09:08:24-05:00 120e7f1221c5b4e75389a4f6ba3b4501a7ace722 docs(LORE-74): document orphans' new --limit flag and bounded output
- 2026-07-23T11:38:03-05:00 03faf9e38ed94e592e9fd5abba04ea9326fa0002 docs(cli-surface): correct check's docs — no token estimates
- 2026-07-23T11:56:28-05:00 8da5feec07136fd4444b4ae071b4ac3915588f4e docs(cli-surface): clarify context --max-tokens has no default cap
- 2026-07-24T22:55:21-05:00 c20e696c9ca1fa5d3cde8eba9d70a0cf8c2d94ca docs(cli-surface): fix scaffold exit-5 wording for dir vs file blockers
- 2026-07-24T22:55:21-05:00 e8b668f877cbf2cc80e57e48a8399046af11e5ca docs(cli-surface): scaffold is idempotent-when-unchanged, not always-conflict
- 2026-07-25T09:22:49-05:00 3f5f53abb7ed2d426d204b2e411a9472eea4ebe0 docs: fix stale publish-job description in tech-stack.md and ADR-0001
- 2026-07-25T12:40:35-05:00 cac03fae04013bd5843b8153aa2adcac32dbe560 fix(orphans): correct ADR-0009 citation and match house-voice task-id style
- 2026-07-25T12:40:35-05:00 dc91ca609d0e620d35342dd4d47f64926e65e62e docs(cli-surface): document orphans parent/subtask hierarchy awareness
- 2026-07-25T14:25:25-05:00 1d985157372c3a831a34e1fd6c3f1f04fc59ff2f docs(init): document the TTY-gated wizard (ADR-0017) and the one-command flow
- 2026-07-25T14:25:25-05:00 a64b1b5344b35854f5fd92e2c69ef2a6d6b5f15e docs(init): correct ADR-0017/CHANGELOG accuracy claims from review
- 2026-07-25T14:25:25-05:00 bae8daf58f24ee351ae2425dd0f97323e6c1e16c docs(init): fix review round-3 text nits — CHANGELOG gloss, test count, EOF message, exit 6
- 2026-07-25T15:19:21-05:00 08cbe4021a277f740de56d025e548daed2649f53 docs(reference): fold the init wizard and its --json fields into two summaries
- 2026-07-26T07:33:17-05:00 7e07262db4033618096dd612a32dd1f545c661f2 docs(backlog-cli-contract): fix same orphans/unlink search-query drift
- 2026-07-26T07:33:17-05:00 9508c63f61ed3f218fdda6195b1238c0ec496043 docs(backlog-json-schema): fix filter/label claims reviewer found in AC#3 miss
- 2026-07-26T11:37:13-05:00 2899ff54a453e1916ea78c1c875fac033734d52f docs(backlog-cli-contract): fix task-list/task-edit label-flag conflation and version-count drift
- 2026-07-26T11:37:13-05:00 3b1f7eab8c7df79cf6d622022e31d8a66bc43226 docs(backlog-cli-contract): fix version-split citations and close self-contradictory task record
- 2026-07-26T11:37:13-05:00 56ee70fd5544e108c209635906bb8d44295f6b37 docs(backlog-cli-contract): fix §2.4 label-flag multiplicity drift, reconcile version pin
- 2026-07-26T11:37:13-05:00 74a45a912ed6ade6d4843714cf98ecebfc16a694 docs(architecture): mark adapter sketch illustrative, fix stale pre-migration claims
- 2026-07-26T21:25:31-05:00 0f15038ddbe6f7e0adf3fc755c1c71562227034b fix(wave2-integration): correct cd-carve-out misattribution and commaJoin universality claim
- 2026-07-26T23:21:11-05:00 c37c689b9f64ba2175a9eefb386992cb845574fd fix(release): close round-5 readiness issues
- 2026-07-27T07:17:12-05:00 047857cc4bb96060430c1735c5b6e46fd268cdf4 feat: add deterministic OKF projection export
- 2026-07-28T08:20:58-05:00 6ceccfb6b36ecd6679d85edec33252364c046094 feat: add Claude and Codex init onboarding

## docs/runbooks

- 2026-06-21T01:22:19-05:00 ca8556d32818dad7b5ec6783d11ba869fd40e2d7 docs: author the OKF documentation bundle
- 2026-06-21T01:33:34-05:00 6d9a4616532442ac469a704e1ab28b18262f27b4 docs(runbook): add developer kickoff handover
- 2026-06-23T08:14:32-05:00 11946f5b6fc4baf3505d1b199a335abd1604f453 feat(LORE-11): shared error model, exit codes, and warning collector (#9)
- 2026-07-12T15:03:25-05:00 04070c650306cb37843c3828f13816b73590ae65 feat(LORE-39): lore scaffold mkdocs — additive MkDocs consumer config (#45)
- 2026-07-12T15:13:04-05:00 a8e1cb65e9afc08e52f7a293f111e4c038ddec00 feat(LORE-9): release pipeline mechanics — compiled binaries + dual-artifact npm publish (#48)
- 2026-07-17T18:22:46-05:00 c7dee5d280b226388f17b829e2ea802435a4b15c docs(LORE-5): record upstream's independent --json contract (PR #790)
- 2026-07-17T18:45:29-05:00 2f76fce661220ac7eeaca43ee9e3eb464ac7db2e docs(LORE-5): adopt upstream's --json contract instead of upstreaming the fork
- 2026-07-18T09:33:31-05:00 f27f9ea98a7f0865ed42f7a4c8a9fd07443574a7 feat(LORE-53): migrate capability probe to upstream's --json contract
- 2026-07-18T12:55:44-05:00 173605e0b529d7c84a9a51df2ecc708f06fbbab7 feat(LORE-54): rewrite backlog adapter against upstream's real --json contract
- 2026-07-18T21:31:16-05:00 01c5b6735a76500abe056615a3bcf0dc894bce2f docs(LORE-5): record the Backlog.md release gate on lore's own v1 publish
- 2026-07-19T10:25:07-05:00 9650cd44bdb8a1b2e2c0e43da30bcde8cd91e1bc feat(LORE-56): Docker E2E test harness — real lore + pinned upstream Backlog.md (#52)
- 2026-07-19T12:13:54-05:00 4772a41375a7a1110006b13ac793d67b51338d58 fix(LORE-57): stop sending --json to backlog task edit (#53)
- 2026-07-19T12:17:20-05:00 63667ed2946c006796bdd6c7b8aaaf4f243c4ad4 fix(LORE-58): route link/unlink partial failures through the standard ErrorEnvelope (#54)
- 2026-07-19T15:40:26-05:00 686a14afab2392d056d446100bfbc41c3b8f5f55 fix(LORE-59): scaffold the lore:tasks managed block in the Story template (#55)
- 2026-07-19T15:45:42-05:00 b8a46675ba0b51b85d9de6c929d7dff472f6fbef docs(LORE-60): fix ADR-0002 exit-code claim for missing vs incapable backlog (#56)
- 2026-07-20T12:01:16-05:00 25e941e86f20f64b954cc35c2e8a0bfe582fd579 feat(LORE-66): docker/e2e command-surface tail + housekeeping
- 2026-07-22T11:43:11-05:00 a2236a120dda5e60e0d1e7fa8171292512ccc4e4 docs(release-publishing): note scoped-package public-access requirement
- 2026-07-23T04:40:48-05:00 96040573b52dd06086e5b9ece6be77e58e97cb9c docs(runbooks): stop overclaiming CI/manual invocation identity
- 2026-07-23T04:40:48-05:00 b3094e8777c0809de96a0b09b409ecb05cd503eb docs(runbooks): note docker-e2e now runs as a required CI gate
- 2026-07-24T10:20:29-05:00 e99f2b6f1c44163ab0a6900ecf418e72bed29b3b ci(LORE-251): cut GitHub Actions minute cost (event-scoped OS matrix, concurrency cancel, drop redundant push:dev) (#241)
- 2026-07-24T22:21:41-05:00 2e84d2bf13f643fe3c0be39656a66a930f7fdcc8 docs(LORE-254): document the upstream Backlog.md watch runbook
- 2026-07-24T22:21:41-05:00 5a4071a9d499a89d898114a4eb626d0ec9093ee3 fix(LORE-254): correct runbook path refs, release-order and issue-list robustness
- 2026-07-25T09:22:49-05:00 1025eb1b2fb7f51191fee2f11f072be90a78d182 docs(release-publishing): add partial-publish rollback + fix version-bump gap
- 2026-07-25T09:22:49-05:00 5052ebc5f4f28501e9eb9b65f6dbe05c6a224886 docs(release-publishing): fix os/cpu dry-run claim + npm-floor wording
- 2026-07-25T09:22:49-05:00 88f664119d29da8d982ec674782b1e199c83bcbb docs(release-publishing): add first-release checklist + rehearsal evidence
- 2026-07-25T14:25:25-05:00 1d985157372c3a831a34e1fd6c3f1f04fc59ff2f docs(init): document the TTY-gated wizard (ADR-0017) and the one-command flow
- 2026-07-25T15:19:21-05:00 e6a1aeeccbd6102d890152808148593c82d2c764 fix(docs): correct three stale stdin-only descriptions of the init TTY gate
- 2026-07-26T07:44:22-05:00 697a3317da83d907a82fc93679ac72ff863c67a8 docs(release-publishing): close the and/or gap in the checklist, add self-review/bypass_actors caveats
- 2026-07-26T07:44:22-05:00 7a6056b2cb67a837e471c302fc3a091423d09117 docs(release-publishing): fix branch-policy guidance, move repo-admin section
- 2026-07-26T07:44:22-05:00 d3a2be67eba12a58af900409bfb2efb6427cfc86 docs(release-publishing): document the release Environment repo-admin steps
- 2026-07-26T08:17:26-05:00 421f7bb755f284e08dda406155a8061c1fd4390a docs(runbooks): fix inert/count claims and dispatch-pause gaps in release-publishing.md
- 2026-07-26T08:17:26-05:00 ba6c7f35748a15534dcba88e747a0b982ed5b461 docs(runbooks): fix release-publishing.md prose left stale by LORE-268
- 2026-07-26T11:36:20-05:00 39a8ac8454b75da0442038789ce776bc1b965e74 docs(docker-e2e): warn against direct run-e2e.sh invocation
- 2026-07-26T11:36:20-05:00 5c38ff8f171a3bfc951d18f65d6ebae884d09009 docs(runbooks): fix stale --exit-code-from e2e claim and 1643→1642 comment cite
- 2026-07-26T11:36:20-05:00 a22f41d8a03207fe4e8497628575d25d3c6755e5 fix(docker-e2e): close three falsifiable claims in LORE-269's new text
- 2026-07-26T23:21:11-05:00 c37c689b9f64ba2175a9eefb386992cb845574fd fix(release): close round-5 readiness issues
- 2026-07-27T07:17:12-05:00 047857cc4bb96060430c1735c5b6e46fd268cdf4 feat: add deterministic OKF projection export
- 2026-07-28T08:20:58-05:00 6ceccfb6b36ecd6679d85edec33252364c046094 feat: add Claude and Codex init onboarding

## docs/specs

- 2026-06-21T01:22:19-05:00 ca8556d32818dad7b5ec6783d11ba869fd40e2d7 docs: author the OKF documentation bundle
- 2026-06-23T08:14:32-05:00 11946f5b6fc4baf3505d1b199a335abd1604f453 feat(LORE-11): shared error model, exit codes, and warning collector (#9)
- 2026-06-23T19:50:34-05:00 b7395b168c68393bee89d437b33c92daf224e53b feat(LORE-10): .lore/config.toml loader (native TOML + env overlay) (#10)
- 2026-06-25T05:48:58-05:00 08411e3a152487007d4e3fb4ebfd3c400fd2d512 feat(LORE-16): bundle.ts — walk docs/, build the concept + cross-link graph (#13)
- 2026-06-26T16:15:03-05:00 8249d9e982d4c1b1d3d26053b387beb5290f9aa8 feat(LORE-47): GitAdapter seam + git-history log.md; resource stamping (#18)
- 2026-07-12T15:03:25-05:00 04070c650306cb37843c3828f13816b73590ae65 feat(LORE-39): lore scaffold mkdocs — additive MkDocs consumer config (#45)
- 2026-07-18T22:08:41-05:00 6475cc54afcc5c387924b774397e868068d532c4 docs(LORE-52): reconcile stale remark/unified references vs shipped stack
- 2026-07-19T15:40:26-05:00 686a14afab2392d056d446100bfbc41c3b8f5f55 fix(LORE-59): scaffold the lore:tasks managed block in the Story template (#55)
