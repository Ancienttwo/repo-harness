# repo-harness 0.16.0 Release Filing

- Date: 2026-08-20
- Package: `repo-harness@0.16.0`
- Base release: `v0.15.3`
- Source range: `v0.15.3..37b7cada9f6d9b54d034b0391e0afb25432ab56b` (8 commits)
- Release-prep commits on `codex/release-0-16-0`:
  `e9c795bd` (version anchors + changelog) and
  `f51bdc1c208b8b5a8805e7c5c166127e7d2019b6` (this filing + the plan, contract,
  notes, and review artifacts). This line was added by the follow-up commit
  below, since a filing cannot contain its own hash.
- Final candidate commit: `(pending)` — assigned when the candidate merges to
  `main`, which is the orchestrator's follow-on phase
- Release scope: publish the completion of the kanban coordination program that
  `0.15.3` opened. `0.15.3` shipped the plane's correctness (WP1 common-dir
  lease store behind the seven `sprint` verbs, plus the owner-record hardening
  pass); `0.16.0` adds WP2, the deterministic board projection
  `state board --json` emitting the frozen `BoardDocumentV1` with four
  precedence-ordered columns, three separated dimensions, per-dimension and
  composite input revisions, and a `stable | changed_during_read`
  snapshot-consistency verdict, together with the bind-time `resumed` receipt
  that stops a steal-then-rebind from inheriting stale no-progress receipts; and
  WP3, the byte-identical read-only `BoardSliceV1` injected at Codex
  `SubagentStart.context` and the Claude `PreToolUse.subagent` `Task|Agent`
  branch plus the `PreToolUse.edit` lease gate armed only behind the
  claim-token-plus-linked-worktree double predicate. The range also carries the
  `contract-worktree finish --merge` worktree retirement fix and ledger/archive
  commits with no runtime surface.
- Version strategy: this is `0.16.0`, the minor the 0.15.3 filing explicitly
  reserved. That filing recorded: "`0.16.0` is reserved for the release where
  the kanban program lands complete, meaning WP2 (board) and WP3 (hook) ship
  together." Both landed in this range (`6c328b82`, `37b7cada`), so all four
  blocks of the program — WP1 lease store, the lease-protocol hardening pass,
  the WP2 board projection, and the WP3 hook injection plus edit gate — are now
  shipped. The consumer-visible surface grows by a new CLI verb and two new hook
  behaviors, which is a minor rather than a patch.
- Publish status: **complete**. Registry, tag, GitHub Release, published-package
  readback, selected Bun-global runtime, and the post-refresh architecture
  projection drain acceptance all passed. See Publish Follow-through.

## Authority Boundary

- Release metadata changes no product behavior; the shipped implementation
  range is already merged on `main` at `37b7cada`.
- The coordination lease store remains one authority. WP2's board and WP3's
  slice are read-only projections over it: the board never reads worktree
  metadata and never takes a task lock, and the slice's collector never
  resolves effective state and never reads attempt ledgers. Neither introduces
  a second owner of lease truth.
- The `PreToolUse.edit` lease gate has exactly one arming predicate — a unique
  claim token whose `unit_ref` matches the active-plan marker AND a linked
  worktree. Claim tokens are write-only with no GC path, so a token-existence
  predicate alone would permanently arm any tree that once ran an inline sprint
  task; the double predicate keeps non-sprint execution unaffected.
- One projector and one renderer produce the injected slice for both hosts, and
  an `env.HOOK_HOST` guard keeps injection exactly-once, so the two host
  surfaces cannot drift into two renderings.
- npm `latest`, `v0.16.0`, GitHub Release, tarball metadata, local version
  fields, and installed runtime must resolve to one immutable release.
- This candidate preparation did not publish, tag, create a GitHub Release,
  merge to `main`, or touch the global runtime.

## Candidate Evidence

- npm baseline: `npm view repo-harness version` returned `0.15.3`;
  `npm view repo-harness@0.16.0 version` returned E404 (`404 No match found for
  version 0.16.0`) before candidate preparation.
- Gate environment: every gate below ran inside the isolated worktree
  `/Users/ancienttwo/Projects/repo-harness-wt-release-0-16-0` on
  `codex/release-0-16-0` with `REPO_HARNESS_SOURCE_ROOT` unset, so helper
  resolution stays on this worktree's own build instead of the Bun-global
  install this machine's `zshenv` points at. `REPO_HARNESS_NODE_BIN`
  (`v24.18.0`) was left in place because archctx requires Node >=24 <26 and this
  machine's PATH node is v22.22.0.
- Drift-cursor anchoring: per the 0.15.3 re-anchor lesson, the fresh worktree's
  architecture drift cursor was anchored by running
  `bash scripts/check-architecture-sync.sh` on the clean tree immediately after
  `bun install` and before any anchor edit. That run returned exit 0 with
  `changed_capabilities=0 blocking=0`. Every later architecture run in this
  candidate measured a real delta rather than re-anchoring against a dirty tree,
  and no dead-letter recovery was needed this cycle.
- `bun run check:release`: exit 0 in 619s, `[release] OK: npm package gate
  passed.` The gate covered state boundaries (167 TypeScript files), hook
  projection (3 files, `sha256:56ab3edd488916e6a7d57a650fb21c05651acd51709102ce6d92e6a2fbf4fdd6`),
  helper projection (55 helpers,
  `sha256:b0d0733b8156f3568f70de7b382c0eda7e0972f76e409c11da7ad3239a61101b`),
  reference-configs projection (23 docs,
  `sha256:fc1f3959efd71ef15a2d82d38802d820a95bfad0f54ff82950686877839a5a8f`),
  typecheck, the full test suite, workflow checks, repository inspection, the
  package dry-run, and the tarball install smoke. Environment-dependent
  failures: none. The `[hook:*] ... failed`, `repo-harness hook: stop failed:
  ...`, `[WorkflowProfileGuard] ... block`, `[SubagentQualityGate] ... block`,
  and `[ArchitectureDrift] drift cursor (missing) is unresolvable` lines in the
  log are asserted negative-path fixture output from the hook and guard tests
  operating on temporary fixture repositories, not gate failures.
- `bun run check:type`: exit 0, `node node_modules/typescript/bin/tsc --noEmit`
  reported no diagnostics.
- `bun test` (full, isolated rerun inside `check:release`): 2703 pass, 1 skip,
  0 fail, 20536 `expect()` calls, 2704 tests across 199 files in 585.11s.
- `bun test` (full, standalone run): exit 0, 2703 pass, 1 skip, 0 fail, 20536
  `expect()` calls, 2704 tests across 199 files in 581.75s. This matches the
  isolated rerun inside `check:release` exactly on every count.
- Known timing-flake pair (`check-agent-tooling` timeout,
  `architecture-projection-orchestration:662`, ledgered at `01e9bffd` with a
  third-occurrence trigger): **not hit** in either full run this cycle. No
  isolation rerun was required.
- `bash scripts/check-deploy-sql-order.sh`: exit 0, `[deploy-sql] OK`.
- `bash scripts/check-architecture-sync.sh`: exit 0,
  `mode=strict gate_min_severity=medium changed_capabilities=3 blocking=0` and
  `provider=archctx apply=automatic state=ready pending=0 running=0
  dead_letters=0 human_actions=0 adoption_required=0 blocking=0 uncommitted=0`.
  The run produced no projection restamps, so the working tree stayed limited to
  the release anchors and workflow artifacts.
- `bash scripts/check-task-sync.sh`: exit 0,
  `[task-sync] Repo changes include synchronized tasks/ updates.`
- `bun scripts/inspect-project-state.ts --repo . --format text`: exit 0,
  `mode: audit`, `legacy_contract_version: current-v1`, `drift_signals: (none)`,
  `required_decisions: (none)`, empty `upgrade_plan`. No readiness yellow flags
  to record.
- Packed tarball: `repo-harness-0.16.0.tgz` contains 502 files, is 10,077,287
  bytes packed and 15,425,182 bytes unpacked, shasum
  `76e601adab53a2a93104b70bb4e8b45d81d26924`.
  `bash scripts/check-tarball-install-smoke.sh repo-harness-0.16.0.tgz`
  returned exit 0 with `[tarball-smoke] OK: repo-harness-0.16.0.tgz installs
  and packaged CLI bins start.` The same smoke also ran inside `check:release`
  with the same result.
- Skill eval evidence: **unavailable this cycle**. No `full_test_count`,
  `dry_run_ratio`, `grader_pass_rate`, or `effectiveness_authority` was produced
  for `0.16.0`. `bun run benchmark:skills` drives live `claude` and `codex`
  agent runs against `evals/evals.json`, which is outside this candidate-prep
  boundary. Per the filing rules in
  `docs/reference-configs/release-deploy.md`, missing eval evidence is recorded
  as unavailable rather than substituted; this candidate's authority rests on
  the full `check:release` gate and the standalone full test run, matching the
  0.15.3 precedent.
- `repo-harness run check-task-workflow --strict`: exit 0, `[workflow] OK`.
- `bun src/cli/index.ts init --repo . --dry-run`: exit 0, `mode: standard`,
  `operations: 0 total, 0 planned, 0 skipped`, with the expected low-severity
  self-host warning `The repo-harness source checkout owns its workflow
  surfaces; downstream init is not applicable.`
- Final-content re-run: after this filing and the workflow notes were written,
  `bun run check:type`, `bash scripts/check-deploy-sql-order.sh`,
  `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow
  --strict`, and `bash scripts/check-architecture-sync.sh` were all re-run
  against the exact committed content and all returned exit 0 with the same
  output recorded above. `check:release` and the standalone `bun test` were not
  re-run; the only delta between their frozen content and the commit is this
  filing plus the workflow notes and plan checkboxes, none of which is a gate
  input or a packaged file.
- Filing-vs-gate ordering: this document records the results of the gates that
  froze the candidate, so its own bytes necessarily post-date them. Everything
  else in the candidate — the version anchors, the changelog section, and the
  workflow artifacts — was final when `check:release` and the standalone
  `bun test` ran. The filing adds no code, no packaged file, and no gate input.

## Required Release Sequence

- [x] Anchor the fresh worktree's architecture drift cursor on the clean tree before any edit.
- [x] Rebuild from current `main` and classify `v0.15.3..37b7cada` by shipped risk surface.
- [x] Move the version anchors: `package.json`, `assets/skill-version.json`
      (`version` + `templateVersion` + history entry), the five READMEs, and
      `scripts/axr7-consumer-e2e.ts`.
- [x] Record the `0.16.0` section in `docs/CHANGELOG.md`.
- [x] Capture the release plan and right-size the release contract against the
      archived `0.15.3` contract.
- [x] Freeze the candidate and run `bun run check:release`.
- [x] Run `bun run check:type`, the full `bun test`, and the deploy/architecture/task sync checks.
- [x] Pack and smoke-install the candidate tarball.
- [x] Record final-subject review and AcceptanceReceipt evidence.
- [x] Merge the candidate to `main` and confirm exact GitHub Actions CI.
- [x] Publish `repo-harness@0.16.0` to npm `latest`.
- [x] Create and push annotated tag `v0.16.0` and stable GitHub Release.
- [x] Run `bash scripts/check-release-published.sh 0.16.0`.
- [x] Install exact Bun-global `repo-harness@0.16.0` and verify version/readiness.
- [x] Record closeout evidence and return to clean, synchronized `main`.

## Publish Follow-through

Not started. This section is filled by the orchestrator's ship phase after the
acceptance receipt binds and the candidate merges to `main`.

Two carry-forward notes from the 0.15.3 publication, both recorded in
`tasks/lessons.md`:

- `npm publish` with a wholesale-expired token fails as `E404 Not Found - PUT`
  with no auth prompt, not E401. Check `npm whoami` first, then
  `npm login --auth-type=web --browser=false`.
- After the global runtime refresh, confirm
  `repo-harness architecture-projection drain --json` reports `status=idle`
  with zero pending, dead letters, and source-journal pending entries.

## Rollback

- Before npm publication: abandon or revert the release-prep candidate on
  `codex/release-0-16-0`; nothing outside this repository has changed.
- After npm publication: never move or reuse `v0.16.0`; correct forward with a
  later patch. The previous registry version `0.15.3` remains installable
  exactly.
- If the WP3 `PreToolUse.edit` lease gate misfires in a consuming repo, the
  failure surface is an explicit `exit(2)` with a per-step reason token rather
  than a silent block, and pre-arming IO failure already degrades to advisory
  and passes. Pin the global CLI back to `0.15.3` and reopen the hook-visibility
  work package instead of loosening the arming predicate to token-existence.
- If `state board --json` reports `changed_during_read` persistently in a
  consuming repo, that is the designed fail-open-to-honest verdict rather than a
  defect; the board is read-only and holds no lock, so no rollback is required
  to recover lease state.

## Publish Follow-through

- AcceptanceReceipt closed on the candidate at `fd45771d`: `external_pass`,
  reviewer Claude, Reviewed Subject SHA256
  `sha256:ed7b43c54ab4ade52944e421d55422f416797e192e4af23436fa7dd2ba8db4bf`,
  Verification Evidence SHA256
  `sha256:38106b8276685698059d9cb6fed4f80bb784b9529182ad89774e86f20def5fec`.
  Three receipt findings (filing unpacked-size correction P3, third
  load-sensitivity timeout-class member P3, archctx bounded-verifier
  environment collision P2 — pre-existing, ledgered), none blocking. The gate
  first returned FAIL on the unreproducible unpacked-size figure; `6391e1dd`
  corrected it to the three-way-measured 15,425,182 before the receipt bound.
- `main` fast-forwarded `37b7cada..fd45771d`; GitHub Actions CI passed on both
  `37b7cada` (WP3 publication) and the merged tip `fd45771d` before
  publication (runs 32295196656 and 32301066428).
- npm publication via web auth returned `+ repo-harness@0.16.0`; registry
  readback: `latest=0.16.0`, shasum
  `76e601adab53a2a93104b70bb4e8b45d81d26924` (byte-identical to the candidate
  evidence), `gitHead=fd45771d95de6f32fc5ba22cbb2a2589c399c258`.
- Annotated tag `v0.16.0` peels to `fd45771d`; the stable GitHub Release is
  `https://github.com/Ancienttwo/repo-harness/releases/tag/v0.16.0`.
- `bash scripts/check-release-published.sh 0.16.0` passed registry, dist-tag,
  tarball integrity, tag, runtime receipt
  (`sha256:e68eb6fb0a99f81b71f457780c16835952e9f253f50f4418d6e6e2fb5c0fd56e`),
  and local-version agreement.
- `bun remove -g` + `bun install -g repo-harness@0.16.0` installed both
  binaries; `repo-harness --version` returned `0.16.0` and the global copy
  hoists `archctx@0.4.4`. The installed runtime now carries the full
  coordination plane: `repo-harness state board --json` answers with the
  correct exit-2 `--sprint` hint, and the finish auto-retirement tail from
  `39e359c2` is live for future closeouts.
- Post-refresh `repo-harness architecture-projection drain --json` reported
  `status=idle`, `pending=0`, `deadLetters=0`; `check-architecture-sync.sh`
  strict gate `blocking=0`.
