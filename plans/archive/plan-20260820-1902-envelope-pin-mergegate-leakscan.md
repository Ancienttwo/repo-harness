# Plan: Envelope quoting pins + merge-gate leak scan

> **Status**: Archived
> **Created**: 20260820-1902
> **Slug**: envelope-pin-mergegate-leakscan
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md`; after execution revert branch `codex/envelope-pin-mergegate-leakscan` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md`
> **Task Review**: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md`
- Sprint contract: `tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md`
- Sprint review: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md`
- Implementation notes: `tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md`
- Review file: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md`
- Implementation notes file: `tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md`; after execution revert branch `codex/envelope-pin-mergegate-leakscan` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1902-envelope-pin-mergegate-leakscan.contract.md`, `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md`, and `tasks/notes/20260820-1902-envelope-pin-mergegate-leakscan.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1902-envelope-pin-mergegate-leakscan.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260820-1902-envelope-pin-mergegate-leakscan.md`; after execution revert branch `codex/envelope-pin-mergegate-leakscan` or the explicitly reviewed diff.

## Captured Planning Output

# Work Package: envelope quoting pins + merge-gate leak scan

Closes three deferred-goal ledger rows in one small work-package (shared plan/contract/finish overhead, per owner direction): the single-quote Task-cell test pin, the `shellArgv()` POSIX-divergence tripwire, and the merge-gate staged-diff leak-pattern scan.

## P1 Map

- `src/core/state/project-continuation-envelope.ts:63-65` — `advanceCommand(task)` is the sole producer of interpolated envelope command strings; escaping is `'` → `'\''` single-quote escaping. `scripts/sprint-backlog.sh` only consumes the already-quoted value.
- `tests/continuation-envelope.test.ts` — string-level envelope assertions; the ledger row names this file as the pin's home.
- `tests/continuation-conformance.test.ts:363-407` — hand-rolled `shellArgv()` parser, single call site at `:526` (`executeHostCommand`). It never special-cases `"` and does not treat unquoted `\n` as a separator; both fall into plain-char accumulation and would be silently mis-tokenized.
- `scripts/merge-gate.ts` (installed helper) + `assets/templates/helpers/merge-gate.ts` (shipped template twin, must stay in sync) — `runMergeGateCli` `run` path calls `candidate(root, base)` at `:496`, which already materializes the full diff (`diff: Buffer`) and `changedFiles` before `writeSeal` at `:539`. `fail()` at `:141-144` is the existing error convention.
- Existing machine leak gate: `src/cli/chatgpt-browser/secret-scan.ts` (Gitleaks, delegation bundles only). It is NOT reused here: merge-gate is a helper shipped to consuming repos, and adding a Gitleaks binary dependency to every merge would be a hidden environment dependency. The ledger row itself specifies "small pattern set".

## P2 Trace (merge-gate path)

`repo-harness run merge-gate run --base <ref>` → `runMergeGateCli` → `candidate()` computes base/head SHAs, `git diff --binary --full-index --no-ext-diff base...head` into `current.diff`, `git diff --name-only` into `current.changedFiles` → (new scan step here) → `writeSeal`. A leak hit must `fail()` before any seal is written, so a leaking candidate never acquires a merge seal. Fail closed: scanner errors are gate failures, not skips.

## P3 Decision

- Pin test proves the property with real bash (argv identity through an actual `bash` spawn), not just string equality — proof-by-probe becomes a standing assertion. Corpus reconstructed in-repo (the original 12-sample transcript was never committed).
- `shellArgv` tripwire goes inside the parser (single choke point, existing `expect(quoted, ...)` style), not at emission — the risk named by the ledger is parsing divergence, and Surface A already covers the production side.
- Leak scan is an in-repo small pattern set embedded in `merge-gate.ts`, unconditional under the existing `merge_gate.enabled` gate, fail closed, no allowlist mechanism of any kind (no policy key, no inline suppression). No new config surface.

## Task Breakdown

- [ ] T1 Single-quote pin test: in `tests/continuation-envelope.test.ts`, add one test that feeds an adversarial corpus of Task cells (at minimum: embedded `'`, `'\''` itself, spaces/tabs, `$(...)`, backticks, `"`, backslashes, `;`, `&&`, leading `-`) through the projected envelope's `advance_sprint` command, then round-trips each produced command through a real spawned `bash` that echoes its argv (e.g. `bash -c 'printf "%s\0" "$@"' _ ...` style or a tiny argv-echo script), asserting the recovered `--task` argument is byte-identical to the original Task cell and produces exactly the expected argv shape. No injection artifact may appear as a separate argv token.
- [ ] T2 `shellArgv` tripwire: in `tests/continuation-conformance.test.ts`'s `shellArgv()`, fail loudly (same `expect(...)` style as the existing unterminated-quote assertion at `:404`) when an unquoted `"` or an unquoted newline is encountered, so any future envelope emission beyond single-quoted words turns silent misparsing into an explicit conformance failure. Do NOT complete the parser into full POSIX.
- [ ] T3 Merge-gate leak scan: in `scripts/merge-gate.ts` `run` path, after `candidate()` and before `writeSeal`, scan (a) added lines of `current.diff` against a small credential pattern set (private-key PEM headers, AWS `AKIA[0-9A-Z]{16}`, GitHub `ghp_`/`gho_`/`github_pat_` tokens, Slack `xox[baprs]-` tokens, npm `_authToken`, generic `-----BEGIN ... PRIVATE KEY-----`) and (b) `current.changedFiles` against private-path patterns (`_ops/` prefixed paths, absolute `/Users/<name>/` home paths appearing as tracked file paths). Any hit → `fail()` with a receipt-style message naming pattern id and file (redact the matched secret content), exit before seal. Scanner malfunction is also `fail()` (fail closed). Mirror the identical change into `assets/templates/helpers/merge-gate.ts` and verify the two stay in sync the way the repo already checks template/installed parity.
- [ ] T4 Tests for T3: unit coverage that a diff containing a seeded fake credential fails the gate before sealing, a clean diff still seals, and a `_ops/` changed path fails. Follow existing merge-gate test conventions if a test file exists; otherwise add one beside the existing helper tests.
- [ ] T5 Close the three ledger rows in `tasks/todos.md` (rows: single-quote pin, `shellArgv` divergence, merge-gate leak scan) referencing this work-package, and run the repo Required Checks.

## Verification

- `bun test --timeout 60000` (canonical invocation; per-file timeout trap means never bare `bun test <file>` for acceptance)
- `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`
- `bun src/cli/index.ts init --repo . --dry-run` (template/helper parity)
- Contract verify: `repo-harness run verify-contract --contract <this contract> --strict`

## Non-goals

- No full POSIX `shellArgv` parser.
- No Gitleaks dependency in merge-gate; no allowlist/suppression surface; no new policy.json key.
- No changes to the ChatGPT delegation-bundle secret scan.
- No touching other ledger rows (ESA-06, Lite phase-3, evals ownership stay deferred pending owner decisions).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 Single-quote pin test: in `tests/continuation-envelope.test.ts`, add one test that feeds an adversarial corpus of Task cells (at minimum: embedded `'`, `'\''` itself, spaces/tabs, `$(...)`, backticks, `"`, backslashes, `;`, `&&`, leading `-`) through the projected envelope's `advance_sprint` command, then round-trips each produced command through a real spawned `bash` that echoes its argv (e.g. `bash -c 'printf "%s\0" "$@"' _ ...` style or a tiny argv-echo script), asserting the recovered `--task` argument is byte-identical to the original Task cell and produces exactly the expected argv shape. No injection artifact may appear as a separate argv token.
- [x] T2 `shellArgv` tripwire: in `tests/continuation-conformance.test.ts`'s `shellArgv()`, fail loudly (same `expect(...)` style as the existing unterminated-quote assertion at `:404`) when an unquoted `"` or an unquoted newline is encountered, so any future envelope emission beyond single-quoted words turns silent misparsing into an explicit conformance failure. Do NOT complete the parser into full POSIX.
- [x] T3 Merge-gate leak scan: in `scripts/merge-gate.ts` `run` path, after `candidate()` and before `writeSeal`, scan (a) added lines of `current.diff` against a small credential pattern set (private-key PEM headers, AWS `AKIA[0-9A-Z]{16}`, GitHub `ghp_`/`gho_`/`github_pat_` tokens, Slack `xox[baprs]-` tokens, npm `_authToken`, generic `-----BEGIN ... PRIVATE KEY-----`) and (b) `current.changedFiles` against private-path patterns (`_ops/` prefixed paths, absolute `/Users/<name>/` home paths appearing as tracked file paths). Any hit → `fail()` with a receipt-style message naming pattern id and file (redact the matched secret content), exit before seal. Scanner malfunction is also `fail()` (fail closed). Mirror the identical change into `assets/templates/helpers/merge-gate.ts` and verify the two stay in sync the way the repo already checks template/installed parity.
- [x] T4 Tests for T3: unit coverage that a diff containing a seeded fake credential fails the gate before sealing, a clean diff still seals, and a `_ops/` changed path fails. Follow existing merge-gate test conventions if a test file exists; otherwise add one beside the existing helper tests.
- [x] T5 Close the three ledger rows in `tasks/todos.md` (rows: single-quote pin, `shellArgv` divergence, merge-gate leak scan) referencing this work-package, and run the repo Required Checks.
