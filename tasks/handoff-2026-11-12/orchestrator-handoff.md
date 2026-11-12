## Role

Orchestrator seat (coordinator + integrator) of aimpact-inc/repo-harness (repository id 1186405141). Parent open: #2624 'Batch: rolling intake (3)'. The advisor seat makes joint decisions with the orchestrator and relays owner words; it has no GitHub write. Dispatch only through Herdr seats (`repo-harness seats argv <seat> --repository-id 1186405141 --issue <n> --parent 2624 --json`, then `herdr-app do tab.new --argv <json argv + task text>`). Report to the owner in Traditional Chinese (STE, technical terms in English). Every GitHub comment ends with `Seat: orchestrator <hc address>`. GitHub text via --body-file.

## Hard rules

- No product code, test or config edits; no sub-agents for execution; no recurring jobs. Never tag, publish, release, delete remote branches, or change credentials, permissions, seat config, branch protection, ruleset or policy.json.
- Pi writer seats commit locally; the orchestrator checks scope (`git diff --stat origin/main...HEAD`, `git merge-tree --write-tree origin/main HEAD`), pushes (`--force-with-lease=<branch>:<full old sha>` when rewriting) and opens the PR with the writer's body file. Claude writers push themselves.
- `repo-harness quota` before each dispatch wave. Routes at 14:11Z: important_deep / simple_deep = worker-important (pi magpie anthropic opus 5.5 high); important_fast / frontend = worker-important-fast (claude sonnet; claude tight 94% at 15:46Z, reset 2026-11-14T22:00Z); simple_fast = worker-light (pi deepseek); gatekeeper none (chatgpt exhausted until 2026-11-13T19:50Z) -> GPT rows with `repo-harness seats argv gatekeeper --pr <n> --parent 2624 --repository-id 1186405141 --spend-credits --json`; reviewer = claude opus.
- Owner decision 14:30Z (proposal C, record https://github.com/aimpact-inc/repo-harness/issues/2624#issuecomment-6826435699): while the Claude account reports 'exhausted', the Claude row of a High PR runs through pi on magpie/anthropic/claude-opus-5-5, read-only by brief. Not while 'tight'.
- Rows: High = GPT row + Claude row. Medium = one different-family row. Low = a fix of at most 50 changed lines (added plus deleted; docs-only and tests-only are Low at any size; `effectiveTier` in src/core/board/board.ts) -> Required / CI + bot answer. Each new head of a Medium/High PR = delta row to the live row pane, publish (`repo-harness review publish --pr <n> --receipt <json>`), then merge.
- Before merge: receipt published, every open review thread answered and resolved (the merge executor refuses `unresolved_threads`; our own published findings open threads), codex bot answered. Merge only with `repo-harness publication merge --repository aimpact-inc/repo-harness --repository-id 1186405141 --pr <n> --head <sha> --base <baseRefOid> --json` when `publication.acceptance_merge` is `on` on origin/main. On `provider_unavailable` (gh timeout) check the PR state, then retry.
- After each merge: `repo-harness board closeout --pr <n>`; close row tabs by hand; remove clean, pushed worktrees by hand. The host CLI is 0.31.0 and lacks the #2658 fix, so closeout keeps the worktree of every PR that had row panes ("a pane of the pull request is kept") until a release updates the host.
- Fix loop: continue after round 3 only while blocking findings drop; round 5 is the hard stop; a new P0, or a new P1 about security or data, stops at the owner. Same-class findings two rounds in a row: give the writer one rule, not a patch list.
- Fix tasks name `bun run check:type`, `bun run check:state-boundaries`, `bun run test:files <files> --timeout 60000 --max-concurrency 1`; `bash scripts/check-ci.sh affected` and bare `bun test` are forbidden for seats.
- Rolling projection PR (archctx/projection): merge by rule 3 at each green state.

## State at 15:50Z (main = 5467df49e, projection #2671 merged)

Merged today in this session: #2670 (#2661) 517cecb4f; #2673 (#2669 archctx readback) 188201a94; #2672 (#2663) d56141f0a; #2650 (#2641, owner-approved rule text) f8d9640fe; #2665 (#2633, owner-approved hook) c5ed6efba; #2671 projection 5467df49e.

## Open work

- #2666 (#2626, High). Head 75beb0a00 (rebased onto f8d9640fe; Do 6 done: release-deploy.md 'Acceptance environment' paragraph; closes R1-3). Rows r2 on 31349fae2: GPT t2jc PASS, Claude t2jd PASS (R2-1, R1-3 P3). NEXT: dispatch four probe runs on the new probe branches (`gh workflow run probe.yml --ref probe/2626-positive-r2 -f lane=release-rehearsal -f runner=ubuntu-latest`, same with runner=macos-latest, then neg1-r2 and neg2-r2 on ubuntu). Expected: positive OK `0.13.0 -> 0.13.0`; neg1 FAILURE at update (candidate tarball 404); neg2 now OK `archctx link: 0.13.0 -> 0.12.0` because #2673 is on main. Then update the PR body 'Probe runs' round 2 (the writer's body file was not yet updated) and send a delta r3 row (diff 31349fae2..75beb0a00 is a rebase + Do 6) to a GPT row and a Claude row (Claude tight: Claude reviewer seat; exhausted: proposal C). Old probe branches probe/2626-positive, -neg1, -neg2 and probe/2669-* stay on origin (owner deletes).
- #2668 (#2660, Medium). Pushed head 5194aa75b; r3 GPT FAIL: P2 r2668-r3-unreleased-base-accepted (base preamble with '## [Unreleased]' kept unchanged passes), P3 trailing newlines, P3 unused `git` in tests/check-ci-job-split.test.ts:1524 (blocking findings 3 -> 2 -> 1). Fix round 3 was in progress at the writer (WIP state: see the wip branch named below). Advisor design input for round 4: compare the merge-result preamble with one constant in the script, not with the base, so no special case for a base that holds '## [Unreleased]'. After the fix: delta r4 GPT row. Merge needs the cutover redo right before merge (main's '## [Unreleased]' entries move to docs/changelog.d fragments with the writer's script); the branch conflicts with main in docs/CHANGELOG.md until then.
- #2674 (archimap refresh + skill link rule, Medium). PR #2676, head 3a130aa77: the skill gets a documents board so every path in modules[].docs is a link; map refreshed at d56141f0a, 23 of 23 links; scope JD https://github.com/aimpact-inc/repo-harness/issues/2674#issuecomment-6826066865. NEXT: one different-family row (GPT, credits).
- #2675 (closeout removes finished seat terminals with a missing cwd, Low). Writer WIP state: see the branch named below. NEXT: finish, PR, Required / CI, bot answer, merge.
- Sequenced, not filed: an archimap link drift check (after #2676); tests/architecture-projection-provider.test.ts in a Windows CI lane (High, ci.yml).

## Owner decisions pending

- Unchanged: #2320, credit mode on Seats page, #2369, arch-context release, Bun 1.5, #1298, private_key rule.

## Resume checklist

- `gh pr list --state open`, `gh pr checks <n>`, `gh issue view 2624 --comments`.
- Seats: `hc ls --label repo-harness.repository=1186405141`.
- `repo-harness quota` before the first dispatch.
