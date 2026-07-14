# Implementation Notes: verification-evidence-decoupling

> **Status**: Active
> **Plan**: plans/plan-20260714-0430-verification-evidence-decoupling.md
> **Contract**: tasks/contracts/20260714-0430-verification-evidence-decoupling.contract.md
> **Review**: tasks/reviews/20260714-0430-verification-evidence-decoupling.review.md
> **Last Updated**: 2026-07-14 12:46
> **Lifecycle**: notes

## Design Decisions

- Slice 1: applied the base_ref/base_rev hash-exclusion to both hash sites
  in `diff-fingerprint.ts` -- `buildDiffFingerprint` (lower-level,
  currently only consumed internally by `buildImplementationDiffFingerprint`
  for its sub-hashes, not its own `.fingerprint`) and
  `buildImplementationDiffFingerprint` (the actual review-freshness path).
  The contract named the file, not one function; leaving the dead-path
  hash inconsistent with its sibling would be a latent correctness bug if
  `buildDiffFingerprint`'s own fingerprint is ever consumed directly.
- Slice 1: the new "same-file target change" test needed a real `git
  rebase`, not just a target advance, to move the merge-base. Discovered
  empirically that single-line edits on adjacent lines (feature line 5,
  target line 6) make git's default merge-based rebase report a conflict
  even though the two sides touch different lines -- git's 3-way merge
  treats adjacent changed lines as one hunk. Used a 1-line gap (feature
  line 5, target line 7) instead: far enough apart for a clean rebase,
  still inside the default 3-line diff context window so the patch hash
  genuinely changes post-rebase.
- Slice 2: searched `scripts/`, `tests/`, `docs/` for "Human Review Card"
  and for any test constructing "canonical missing/unavailable + Card
  external=pass" before touching code (contract's Falsifier). Found no
  existing test that exercises the removed fallback path -- the closest
  matches (`tests/helper-scripts.test.ts` "should write passing structured
  checks", and `workflow-state-lib.test.ts`'s "external acceptance parser"
  test) all drive the canonical section's own Manual Override note, a
  separate and still-supported mechanism untouched by this change. There
  was nothing literal to delete; added a fresh end-to-end regression test
  instead and verified it would have passed pre-fix (reintroduced the old
  fallback block in a scratch copy, confirmed exit 0, confirmed exit 1
  with the fix) so it has real discriminating power.
- Slice 4: the dispatch said delete "the arm's temp directory," which read
  literally as the whole `runRoot` (`base/` + `workspace/` + `host/`).
  Before implementing, checked what `--regrade-existing`
  (`regradeHarnessBenchmarkReport`) needs: it re-runs the scenario's
  acceptance command with `cwd: record.workspace` and diffs
  `changedFiles(record.workspace)`, and
  `docs/architecture/modules/verification/evals-checks.md:40` already
  documents this as operating "against retained run workspaces" -- an
  existing, committed architectural invariant, not a speculative concern.
  Also `workspace` is a git worktree of `base` (`git worktree add`), so it
  shares `base`'s object store; deleting `base` would corrupt `workspace`
  even if `workspace`'s own directory were left alone. Only `host` (the
  isolated HOME/BUN_INSTALL/CODEX_HOME toolchain root) is: (a) never
  referenced by any field on `BenchmarkRunRecord`, and (b) never read again
  by `executeRun` after the provider process exits. Deleted only `host`,
  named it via an exported `cleanupArmHostRoot()` so the mechanism itself
  is unit-testable (the alternative, running `executeRun` end-to-end,
  requires a real provider process this task must not invoke).
- Slice 2: `scripts/verify-sprint.sh` projects into
  `assets/templates/helpers/verify-sprint.sh` via
  `scripts/sync-helper-sources.ts` (checked by
  `tests/helper-scripts.test.ts`'s "workflow contract drives a
  deterministic helper projection" test). The contract's Goal text named
  only `scripts/verify-sprint.sh`, but `assets/` was already in
  `allowed_paths`, and leaving the projection stale would fail that test
  in the final full `bun test` pass. Ran `bun run sync:helpers` to
  re-project after editing the canonical source.
- Codex acceptance P2#1 (`not_required` dead literal in the external
  acceptance gate): traced production/consumption before editing.
  `workflow_external_acceptance_status` (`.ai/hooks/lib/workflow-state.sh`)
  has exactly four `printf` outcomes -- `missing`, `fail` (several message
  variants), `manual_override`, `pass` -- and no code path anywhere in that
  function emits `not_required`. Its only historical "producer" was the
  Human Review Card fallback branch (assigning `external_status` from the
  Card's own free-text field) that slice 2 already deleted from
  `verify-sprint.sh`; no other layer -- task-profile judgment or otherwise
  -- generates `not_required` and feeds it into this case statement. So
  deleting the literal (rather than tightening it to an explicit
  "profile declares no external acceptance required" condition) removes no
  legitimate closeout path: docs-only/eval-only/etc. profiles already had
  to reach canonical `pass` or `manual_override` like every other profile.
  Left three adjacent `not_required` occurrences untouched as genuinely out
  of contract, not affected by the fix: `README*.md` (5 language variants;
  not in `allowed_paths`, and the prose describes the Human Review Card's
  own free-text "External acceptance" field -- a legitimate display value,
  not this gate's `$external_status` variable); the closed
  `tasks/{contracts,reviews,notes}/20260616-HE-*` artifacts (historical
  record, not in `allowed_paths`); and
  `tests/fixtures/harness-traces/*.json`'s hand-authored `not_required`
  sample values (`scripts/harness-trace-grade.sh` never reads
  `.external_acceptance.status` or `.review.card.change_type`'s sibling
  `external_acceptance` field at all -- confirmed by running the "harness-
  trace-grade should pass all local trace fixtures" test unchanged after
  the case-statement fix -- so these fixtures are inert either way).
- Codex acceptance P2#2 (canonical-failure test strengthening): once a
  fixture installs the real `.ai/hooks/lib/workflow-state.sh`,
  `scripts/verify-sprint.sh` resolves `contract_file`/`review_file` via
  `workflow_active_contract`/`_review` instead of the directory-scan
  fallback used when that helper file is absent -- that path requires a
  `.ai/harness/active-plan` marker pointing at a plan file. Used an
  explicit `> **Task Contract**:`/`> **Task Review**:` declaration in the
  fixture plan so resolution does not also depend on matching the
  timestamp-stem naming convention. The original "helper missing" test
  never needed this setup because it never sources the helper and so never
  enters that branch; renamed it to say so instead of implying it covers
  every "Card can't rescue canonical" scenario.
- Codex acceptance P2#3 (benchmark cleanup ordering test is a source-text
  scan): accepted as advisory, no test added. The
  `tests/harness-benchmark-matrix.test.ts` ordering assertion scans
  `executeRun`'s source text for the delete-after-extract call order
  rather than driving a real `executeRun`, which would require spawning a
  live provider process -- fabricating one for this test would itself
  violate this package's own minimal-mechanism principle. This guards
  against a wording/reordering regression in the literal source but not
  against a future change that reaches the arm's host root indirectly
  (e.g. through an intermediate helper) without the asserted-on ordering
  text changing. Limitation accepted as-is; no behavioral harness added.
- Orchestrator ruling on P1 (fingerprint integration-context bypass,
  external Codex acceptance): by design, not touched in this dispatch.
  `src/cli/hook/diff-fingerprint.ts` and `tests/review-freshness.test.ts`
  keep exactly the freshness semantics slice 1 left them with -- an
  unrelated target/main advance must not mark a review stale. Rebase-
  driven integration risk after such an advance is the deterministic
  verifier's job (the contract's `exit_criteria` commands re-run against
  current HEAD at closeout), not the fingerprint's; an integration token
  is on the source plan's explicit do-not-do list. No code changed for
  this item.

## Deviations From Plan Or Spec

- Slice 3: the plan expected to remove a live `benchmark:harness
  --require-authoritative` example and a duplicate tests_pass/
  commands_succeed authority from the contract templates. Audited
  `.claude/templates/contract.template.md`,
  `assets/templates/contract.template.md`,
  `docs/reference-configs/sprint-contracts.md`, and
  `docs/reference-configs/contract-brief-example.md` -- neither pattern
  exists in any of them, and `git log` on those four paths shows the
  prior "harness kernel optimization phase 2" merge never touched them
  either, so they were never contaminated. The only place the live-matrix
  example exists is the archived
  `tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md:202`,
  which is explicitly out of scope (historical record; the plan itself
  says no active contract instance needs migration). Made no template
  edit for that part; only added the new invariant paragraph (the part
  that was genuinely missing).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Post-acceptance incident: recursive gate execution via fixture env inheritance

- During `contract-worktree finish`, the new workflow-state-lib fixtures spawned `verify-sprint.sh` with inherited `REPO_HARNESS_TARGET_REPO_ROOT` (verify-sprint.sh cds there at :5-6), escaping the fixture into the real worktree and re-running the real contract's exit criteria — which execute this very test file, forming an unbounded process chain (observed ~130 fixture roots before kill). Standalone test runs never carried that env, which is why worker/gatekeeper verification stayed green.
- Fix: `fixtureEnv()` strips `REPO_HARNESS_*`/`HOOK_REPO_ROOT` from every fixture subprocess env in tests/workflow-state-lib.test.ts; reproduction with the incident env combination now completes in ~2s with no recursion.
- Deliberately NOT added: a nested-execution sentinel inside verify-sprint.sh (guardrail minimalism — the only observed escape path is this env leak, now removed; revisit only if nested gate execution recurs via a different path).
- Also observed during finish attempts: the global `repo-harness run` wrapper enforces a 120s helper timeout, so finish must run via `bash scripts/contract-worktree.sh` directly; and the stale global `repo-harness-hook` binary computes old-semantics fingerprints (base_rev still hashed) — refresh the global install after this package merges.
