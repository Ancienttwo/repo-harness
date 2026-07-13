# Task Contract: native-role-capability-gate

> **Status**: Fulfilled
> **Plan**: plans/plan-20260712-0219-native-role-capability-gate.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-13 13:10
> **Review File**: `tasks/reviews/20260712-0219-native-role-capability-gate.review.md`
> **Notes File**: `tasks/notes/20260712-0219-native-role-capability-gate.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The installed Codex custom-agent TOMLs describe desired role configuration, but current native GPT-5.6 MultiAgentV2 can still spawn `agent_role:null` children that inherit the root model. Presence-only readiness and advisor role labels therefore create false confidence unless stable runtime metadata is captured and reported separately.

## Goal

Record Codex's authoritative SubagentStart `turn_id`, `agent_id`, `agent_type`, and `model` fields as atomic per-child observations, compare them with the custom-agent profile selected by schema-authoritative `name`, and expose a deterministic aggregate through the delegation context and agent-tooling report. Static fleet presence must remain separate from verified runtime routing.

## Scope

- In scope:
  - Advisor state and wording that require runtime evidence before role/model claims.
  - SubagentStart capture of the official `turn_id`, `agent_id`, `agent_type`, and `model` fields.
  - Project-then-user custom-agent TOML enumeration by authoritative `name`, complete required-field validation with `Bun.TOML.parse`, and fail-closed ambiguity handling.
  - Atomic digest-bound per-child evidence, deterministic sibling aggregation, and agent-tooling strict failure after authoritative `unavailable`, `mismatch`, `invalid`, malformed, or config-drift evidence.
  - Source/asset hook parity, focused regression tests, reference documentation, and workflow closeout.
- Out of scope:
  - Changing Codex's spawn schema, choosing a non-native runner, parsing Codex transcripts, or inferring support from a CLI version.
  - Verifying `model_reasoning_effort`, because the released SubagentStart payload does not expose it.
  - Renaming fleet roles, changing fleet model assignments, or altering Claude behavior.
  - Making missing runtime evidence a strict-readiness failure.
- Taste constraints: no new dependency, no transcript coupling, no version allowlist, and no synthesized role/model fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if the released official SubagentStart payload lacks either `agent_type` or `model`.
- Stop if detecting the selected role would require parsing unstable Codex transcript/session internals.

## Falsifier

The direction is wrong if `codex-cli 0.144.1` does not define required SubagentStart `agent_type` and `model` fields, or if those fields are not derived from the resolved subagent role/model. Cheapest proof: the official release schema and `hook_runtime.rs` mapping from `agent_role` to `agent_type`.

## Root Cause Evidence

Task Profile is `code-change`; bugfix root-cause artifact gating is not applicable. The predecessor canary evidence is summarized in the plan and implementation notes.

## Workflow Inventory

- Source plan: `plans/plan-20260712-0219-native-role-capability-gate.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260712-0219-native-role-capability-gate.review.md`
- Notes file: `tasks/notes/20260712-0219-native-role-capability-gate.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260712-0219-native-role-capability-gate.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260712-0219-native-role-capability-gate.contract.md
  - tasks/reviews/20260712-0219-native-role-capability-gate.review.md
  - tasks/notes/20260712-0219-native-role-capability-gate.notes.md
  - .ai/harness/checks/
  - .ai/harness/handoff/
  - .ai/hooks/codex-delegation-advisor.sh
  - assets/hooks/codex-delegation-advisor.sh
  - .ai/hooks/subagent-start-context.sh
  - assets/hooks/subagent-start-context.sh
  - .ai/hooks/stop-orchestrator.sh
  - assets/hooks/stop-orchestrator.sh
  - .ai/hooks/.projection.json
  - scripts/check-agent-tooling.sh
  - assets/templates/helpers/check-agent-tooling.sh
  - tests/cli/hook.test.ts
  - tests/check-agent-tooling.test.ts
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .ai/hooks/codex-delegation-advisor.sh
    - assets/hooks/codex-delegation-advisor.sh
    - .ai/hooks/subagent-start-context.sh
    - assets/hooks/subagent-start-context.sh
  files_contain:
    - path: .ai/hooks/subagent-start-context.sh
      pattern: 'agent_type'
    - path: scripts/check-agent-tooling.sh
      pattern: 'native_role_routing'
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260712-0219-native-role-capability-gate.notes.md
  tests_pass:
    - path: tests/cli/hook.test.ts
    - path: tests/check-agent-tooling.test.ts
  commands_succeed:
    - bun test tests/cli/hook.test.ts tests/check-agent-tooling.test.ts
    - bun run check:hooks
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/sync-brain-docs.sh --all
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts adopt --repo . --dry-run
    - bun run check:type
  qa_scores:
    - dimension: functionality
      min: 8
    - dimension: design_quality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: complete. Official SubagentStart observations are separated from static fleet presence and aggregated deterministically; focused 56/56 and full 1158/1158 runnable tests pass (grown from 55/1143 after rebasing onto `origin/main`).
- Edge cases: covered — no state, default role, missing/malformed/ambiguous profile, filename different from `name`, valid unrelated profile without optional model, malformed authoritative metadata, concurrent siblings, empty reset retention, model mismatch, verified role, config drift, symlinked config/evidence paths, and a delayed-write TOCTOU race against a newer delegation scope.
- Regression risks: missing evidence intentionally remains advisory; authoritative default, mismatch, invalid, malformed, or drifted evidence fails strict. Reasoning effort remains explicitly unverified.
- 2026-07-13 rebase and independent-review follow-up: rebased this worktree from stale base `788ba60` onto `origin/main` `7b6ba87`. An independent Codex review against the new base surfaced two real P1 blockers, both fixed in this session: a TOCTOU race in `subagent-start-context.sh` where a stale in-memory write could clobber a newer delegation's `latest.json` pointer (fixed by re-checking `scope_id` immediately before that write), and a stale `sonnet -> gpt-5.6-sol/high` model-routing row in the `external-tooling.md` mirrors (resolved by the rebase itself, which carries origin/main's already-corrected `sonnet -> gpt-5.6-luna/xhigh` row; verified against `.codex/agents/*.toml` and existing tests). Re-verification also found and fixed two more stale-base artifacts in this contract/workflow: the deleted `scripts/migrate-project-template.sh` exit-criteria command (replaced with `bun src/cli/index.ts adopt --repo . --dry-run`), and a transient stale handoff resume packet (resolved by re-running `prepare-handoff` last). See `tasks/notes/20260712-0219-native-role-capability-gate.notes.md` for full detail, including an unresolved open question about a mid-task `sonnet -> gpt-5.6-luna/max` assertion that conflicts with every current repo source.
- 2026-07-13 second TOCTOU round: a further independent Codex review found the first-round TOCTOU fix still incomplete — the re-read-and-compare and the following `atomicWriteJson` (temp file, write, rename) are two separate steps, so a fresher write from another invocation could still land in that gap and be clobbered. Closed with a dependency-free `fs.mkdirSync`-based mutual-exclusion lock (`acquireLock`/`releaseLock`/`sleepMs` in `assets/hooks/subagent-start-context.sh`) wrapping the whole read-compare-write sequence, with an 8s stale-lock reclaim threshold and a ~2s bounded acquire retry that falls back to skipping the write (never hanging the hook) if contention does not clear. An empirical probe proved a lock confined to that one file cannot close Codex's exact scenario, because `codex-delegation-advisor.sh` writes the same `latest.json` unconditionally with no lock of its own; extended the identical lock to that file's write too (both already inside `allowed_paths` from the first round, so no contract widening was needed — see notes file for the explicit scope-flag). Two new regression tests in `tests/cli/hook.test.ts` target the remaining gap specifically (not the earlier, already-covered window): one deterministic single repro (polls for evidence turn B's write landed before releasing turn A, rather than guessing a fixed delay, so the pre-fix failure reproduces reliably) and one 10-trial real-concurrency stress test with varying timing. Fail-then-pass reconfirmed for both by reverting just the lock guard, re-running (real captured failures), then restoring and re-running (pass). Full suite now 1160 pass / 1 skip / 0 fail (grown from 1158 by the two new tests); focused `hook.test.ts` 42/42.
- 2026-07-13 third round (lock ownership token): a further independent Codex review of the second-round lock found stale-reclaim checked mtime only, with no check that the recorded holder process was actually gone, and `releaseLock` removed the lock directory unconditionally with no ownership check — so a holder merely slow past the 8s threshold (not crashed) could have its lock stolen by a waiter, and a resumed stale holder could then delete a legitimate new owner's lock on release. Closed with an ownership token: `acquireLock` now writes an `owner.json` marker (`pid`, `token`, `acquired_at`) inside the lock directory at acquire time and returns `{ acquired, token }`; `releaseLock(lockDir, token)` only removes the lock when its caller's token still matches the current marker; stale-reclaim now additionally requires a new `isLockOwnerAlive` check (`process.kill(pid, 0)`, treating `ESRCH`/clean-call as dead and `EPERM` as still alive) before reclaiming, alongside the existing mtime check. Both hook files and their `assets/hooks` mirrors (the canonical projection source) received the identical implementation. Two new regression tests in `tests/cli/hook.test.ts` drive `acquireLock`/`releaseLock` directly (extracted verbatim from the real shipped source) as separate OS processes: one proves a concurrent attempt cannot steal the lock from a still-live holder past the stale threshold; the other proves a new acquirer can still reclaim once the recorded owner has actually exited. Fail-then-pass reconfirmed with real captured output (`Expected: false, Received: true` against a temporarily reverted pre-fix file, 3/3 passing re-runs after restoring the fix). Full suite now 1162 pass / 1 skip / 0 fail (grown from 1160 by the two new tests); focused `hook.test.ts` 44/44.
- 2026-07-13 fourth round (replace the mkdir-based lock, not patch it again): a fourth independent Codex review of the third-round mkdir-plus-owner.json lock found two more real races — (1) `mkdirSync` succeeding and the separate `owner.json` write were not atomic together, so a holder pausing in exactly that gap could be reclaimed while its own marker write then silently landed inside and overwrote the reclaimer's directory, letting both believe `acquired:true`; (2) the stale-reclaim path itself (check-dead, delete, recreate) was its own check-then-act sequence, so two concurrent reclaimers could race such that one deletes the lock the other just legitimately recreated. Per explicit user decision, this round replaces the mechanism outright instead of patching it a fourth time: a single lock FILE per `${latestPath}.lock` (no more `.lock` directory), acquired via `fs.writeFileSync(lockPath, JSON.stringify({pid, token, acquired_at}), { flag: "wx" })` — `O_CREAT | O_EXCL | O_WRONLY` atomically creates-and-writes in one call, closing race (1) structurally.
  - Closing race (2) took two attempts, both recorded honestly rather than only reporting the one that worked. First attempt: require a byte-for-byte content match, re-verified immediately adjacent to the destructive unlink, against the snapshot the reclaim decision was based on. An initial small sample (5/5) looked clean, but a rigorous 15-run follow-up failed 3/15 with the same `Received: 2` output — re-reading once more before acting does not create exclusivity, it only adds one more check-then-act step of the same kind, and two racers running identical code from the identical forced starting point routinely pass that check together before either has acted. Actual fix: gate entry into the destructive unlink-then-recreate step behind its own exclusive marker file (`${lockPath}.reclaiming`), created with the identical `wx` primitive — only the process whose own marker-create call succeeds may touch the main lock destructively, reducing "two reclaimers racing the same destructive step" to an ordinary contended `wx` create, which the OS already guarantees has exactly one winner. Verified far more rigorously given the first fix's false confidence: 50 repeated runs (250 forced-race trials) with 0 failures.
  - Ownership is established ONLY when a call's own `tryCreateLockFile` invocation returns `created:true`, never from having merely performed a preceding unlink or won the reclaim marker alone; this property was traced explicitly through every return path. Both hook files and their `assets/hooks` mirrors received the identical implementation, synced via `bun run sync:hooks` and verified with `bun run check:hooks`.
  - One new regression test (`two concurrent reclaimers racing the same stale-and-dead lock never both believe acquired:true`) forces the exact adversarial interleaving via a real, spliced rendezvous barrier across two genuine concurrent OS processes (not sequential simulation), repeated 5 times internally; the two prior rounds' lock tests were updated (variable rename `lockDir` -> `lockPath`, harness extraction list gains `tryCreateLockFile`) to keep exercising the current mechanism. Fail-then-pass confirmed against the naive content-blind-unlink baseline (2/8 runs reproduced `Expected: 1, Received: 2` with real captured output); the restored marker-based fix passed 50/50 runs. Full suite now 1163 pass / 1 skip / 0 fail (grown from 1162 by exactly the one new test); focused `hook.test.ts` 45/45.
- 2026-07-13 fifth round (drop reclaim entirely -- final round, explicit user decision): a fifth independent Codex review of the fourth-round exclusive-reclaim-marker lock found it STILL had two residual races nested one layer deeper: (a) `writeFileSync(lockPath, ..., { flag: "wx" })` is technically `open()` then `write()` as two syscalls, so an OS preemption between them could theoretically be misread as abandonment; (b) the reclaim-marker's own stale-marker cleanup did a raw `unlinkSync` with no verification it was still deleting the content it judged stale, so it could delete a different process's brand-new legitimate marker. Five consecutive independent review rounds, each finding a new TOCTOU race exactly one layer deeper than the fix that closed the previous one, is a decisive structural signal rather than bad luck: safely reclaiming a lock from a possibly-crashed holder using only bare filesystem primitives (no flock, no new dependency) cannot be made fully correct through incremental patching. Per explicit user decision, this is the final round for this lock: the stale-lock reclaim feature is dropped entirely rather than patched a sixth time.
  - `tryCreateLockFile` is unchanged (it was never the source of any of the five findings). `acquireLock(lockPath, options)` is now: try the `wx` create; on success return `{ acquired: true, token }`; on `EEXIST`, do not check staleness, liveness, or attempt any reclaim -- just check the bounded ~2s default deadline and either return `{ acquired: false, token: null }` or sleep ~25ms and retry. `isLockOwnerAlive` and the entire reclaim-marker path (`${lockPath}.reclaiming` and its own stale-marker cleanup) are deleted outright, along with every `mtimeMs`/`staleMs` read. `releaseLock` is intentionally unchanged in logic (token-verified unlink) since the dispatch confirmed it was never the source of a live bug; only its doc comments (and two now-stale inline comments referencing the deleted reclaim concept) were corrected. Applied identically to both hook files and their `assets/hooks` mirrors, synced via `bun run sync:hooks`, verified with `bun run check:hooks` (new digest `sha256:842c6bd5f0c112920aa9b4885de4845261b118fc854b10d2804fd7dc7d785f3a`).
  - Tests: removed `acquireLock reclaims a stale lock once its recorded owner process has actually exited` and `two concurrent reclaimers racing the same stale-and-dead lock never both believe acquired:true` outright, since both asserted behavior (reclaim-from-a-dead-holder, and mutual exclusion between two racing reclaimers) that no longer exists. Adapted the live-holder test (dropped `staleMs`/liveness framing; same two-real-process mechanic) and renamed it `acquireLock never lets a concurrent attempt acquire while the lock file still exists`. Added `two concurrent contenders for the same never-released lock: exactly one acquires it` (two real OS processes race a fresh lock path in the harness's existing `die-holding` mode; the OS's own `O_EXCL` guarantee proves exactly one wins, no forced rendezvous needed) and `a caller correctly skips the shared write and does not hang when the lock is held past the bounded timeout` (hook-level: externally holds the real `latest.json.lock` for 8s, runs the real `SubagentStart` hook, and asserts it exits 0 well under the 8s hold, the shared pointer is byte-for-byte untouched, and the isolated per-turn write still lands). One real timing flake was found and fixed during verification (a too-tight wall-clock margin under repeated local runs, not a lock-correctness bug); widened and re-confirmed clean across 8+ additional runs.
  - Verification (only the commands this round's dispatch explicitly listed; no file outside `tests/cli/hook.test.ts` and the two hook script pairs changed, so the broader root checks were not re-run this round): focused `tests/cli/hook.test.ts` 45 pass / 0 fail, 332 `expect()` calls (re-run twice clean, plus the three lock tests individually re-run 3-8x each). Full suite 1163 pass / 1 skip / 0 fail, 11586 `expect()` calls across 102 files (re-run twice, identical). `bun run check:type` pass (one type-only fix: `toContain` against a nullable close-code type replaced with an equivalent boolean comparison). `bun run check:hooks` and `bun run check:helpers` both pass. `bash -n` on all four hook scripts passes. Both mirror pairs confirmed byte-identical via `diff`.
- 2026-07-13 sixth round (a genuinely new discovery, not a continuation of the lock TOCTOU chain, rounds 1-5 above): a fresh independent Codex review found a THIRD file, `stop-orchestrator.sh` (not previously in this contract's `allowed_paths`; widened above to add both copies — flagging this scope extension explicitly, per the same convention the second round used for `codex-delegation-advisor.sh`), also touches the shared `.ai/harness/delegation/latest.json` and has two real bugs, neither related to the five-round lock-mechanism TOCTOU chain: **Bug 1 (uncoordinated writer defeats the lock entirely)** — `delegation_mark_fallback_used()`'s `fs.writeFileSync(paths.latestPath, ...)` had no lock acquisition at all, so no matter how correct the lock is between the other two scripts, this third writer could still clobber a newer pointer written by either of them while they correctly held the lock, because it never checked for or respected that lock. **Bug 2 (scope-resolution priority gap causes Stop enforcement to fail open)** — `codex-delegation-advisor.sh`'s `delegationScope` checks `turn_id` first; `stop-orchestrator.sh`'s own `delegationScope` (inside `delegation_state_paths_json`) had no `turn_id` check at all, resolving via `run_id` first instead. A delegation scoped by `turn_id` at creation time therefore computed a DIFFERENT, non-matching scope id at Stop time whenever Stop's own input also carried `run_id`/`session_id` (the realistic case, since a real host supplies multiple stable identifiers for the same turn), and `delegation_should_block` silently failed open (no block) via `state_paths="$(delegation_state_paths_json)" || return 1` — a turn-scoped delegation could silently bypass Stop's own enforcement.
  - Fixed both: (1) ported the exact `sleepMs`/`tryCreateLockFile`/`acquireLock`/`releaseLock` functions verbatim from `subagent-start-context.sh` into `delegation_mark_fallback_used()`'s embedded `bun -e` script, wrapping the `paths.latestPath` write in the same acquire-write-release-in-`finally` pattern the other two writers use (skip-not-hang on a failed acquire, matching the established safe-skip convention; the `paths.statePath` per-turn write stays unconditional and unaffected by this lock, exactly like the other two files); (2) added the identical `turn_id` check as first priority to `stop-orchestrator.sh`'s own `delegationScope`, so all three files now agree on priority order (`turn_id > run_id > session_id > transcript_path > env_session`).
  - Investigated for other callers of `delegationScope` and other writers of `latest.json`, both in this file and repo-wide (`grep` across all `.sh`/`.ts` sources, excluding archives): confirmed exactly one `delegationScope` call site and exactly one `latest.json` writer (`delegation_mark_fallback_used`) in `stop-orchestrator.sh`; no further scope widening beyond this one file's two mirrors was needed.
  - Two new regression tests added to `tests/cli/hook.test.ts`: `Codex Stop resolves delegation scope by turn_id first, matching the advisor, even when its own input also carries run_id and session_id` (creates a delegation with `turn_id`+`run_id`+`session_id` all present, matching the advisor's turn_id-first resolution, then calls Stop with the identical fields and asserts the block side effect `fallback_used: true` — `HOOK_HOST=codex` suppresses stdout on a successful Stop exit, so the block is observed through its persisted side effect, matching the pre-existing "Codex Stop fallback marks once" test's own convention, not by parsing stdout JSON); `Stop delegation fallback write for a third writer respects the same latest.json lock as the other two writers` (externally holds the real `latest.json.lock` — built from `subagent-start-context.sh`'s lock functions so the external holder stays valid independent of which fix is reverted — then runs the real Stop hook and asserts the guarded `latest.json` write is skipped (byte-identical to before) while the unguarded per-turn state write still lands).
  - Fail-then-pass confirmed with real captured output for both: reverting just the `turn_id` check reproduced `Expected: true, Received: false` on `fallback_used` (the fail-open bug); reverting just the lock-wrap reproduced a real diff showing `latest.json` clobbered (`"fallback_used": false` -> `true` plus a stray `updated_at`/`fallback_used_at`) while an external process held the lock. Both restores confirmed byte-identical via `diff` before re-confirming pass.
  - Verification: focused `tests/cli/hook.test.ts` 47 pass / 0 fail, 344 `expect()` calls (45 plus the two new tests, +12 `expect()` calls). Full suite 1165 pass / 1 skip / 0 fail, 11598 `expect()` calls across 102 files (grown from the fifth round's 1163/11586 by exactly the two new tests). `bun run check:type` pass. `bun run check:hooks` pass (new digest `sha256:ed480be20f02fe77ff085654c71c4ef458cd08004f2688a7a3d6a4c3a2b7a8c7`, reflecting the two `stop-orchestrator.sh` fixes). `bun run check:helpers` pass, unchanged digest (no helper file touched this round). `bash -n` on both `stop-orchestrator.sh` copies passes. Both mirror pairs (`subagent-start-context.sh`, `codex-delegation-advisor.sh`, and now `stop-orchestrator.sh`) confirmed byte-identical via `diff`. Zero stray apostrophes confirmed in the new `bun -e` block (grep, excluding the two shell quote-delimiter lines).
- 2026-07-13 seventh round (three named parity gaps, declared FINAL for this lock-protocol contract by explicit user decision): a seventh independent Codex review found three remaining gaps, all within the same three-hook surface this contract already tracks. No `allowed_paths` widening was needed this round (unlike the second and sixth rounds): every touched path was already listed.
  - **Fix A (unscoped writes bypassed the lock):** `resolveStatePath` (`subagent-start-context.sh`) and `delegation_state_paths_json` (`stop-orchestrator.sh`) both return `statePath === latestPath` when `latest.json` has no `scope_id` yet (the unscoped case). Both call sites wrote that single collapsed path unconditionally, with the lock-guarded branch skipped entirely because it was gated on `paths.latestPath !== paths.statePath` — false in exactly this case, so an unlocked write reached the shared pointer whenever no scope had been claimed yet. Fixed in both files by restructuring into an explicit `if (paths.latestPath === paths.statePath) { ...lock-guarded write... } else { ...unconditional statePath write, then the pre-existing lock-guarded latestPath write... }`. Investigated `codex-delegation-advisor.sh` for the identical shape as explicitly asked, and confirmed by reading the file (not assuming) that it does NOT have the same bug: its per-turn write is what is conditionally skipped when unscoped, while its shared `latestPath` write is unconditionally lock-guarded regardless of scope — the inverse of the other two files' shape. No change was needed or made there.
  - **Fix B (Stop's writer lacked the in-lock scope_id re-check):** `subagent-start-context.sh` already re-reads `latest.json` inside the lock and only overwrites when `currentLatest.scope_id === state.scope_id`; `stop-orchestrator.sh`'s `delegation_mark_fallback_used` resolved paths and read state before acquiring the lock, then (pre-fix) wrote unconditionally once the lock was acquired, with no re-check — so a newer delegation scope committed in that gap could be rolled back. Fixed as part of the same restructuring as Fix A: the scoped (`else`) branch now mirrors `subagent-start-context.sh`'s exact in-lock re-check; the new unscoped branch carries the identical re-check for consistency.
  - **Fix C (firstString trim parity):** `stop-orchestrator.sh`'s own `firstString` (one definition, inside `delegation_state_paths_json`) returned the raw, untrimmed value; made byte-identical to the advisor's and `subagent-start-context.sh`'s `value.trim()` siblings. `turn_id`/`run_id`/`session_id`/`env_session` all funnel through `sanitize()`, whose regex happens to neutralize plain whitespace padding regardless of trim; `transcript_path` is the one scope source that feeds `firstString`'s return value directly into a byte-sensitive SHA1 hash, so a padded `transcript_path` is the concrete case where the pre-fix mismatch actually manifests as a fail-open Stop.
  - Three new regression tests added to `tests/cli/hook.test.ts`, reusing the existing spawn helpers and rendezvous-splice harness from prior rounds: an unscoped-lock test (seeds an unscoped delegation, externally holds `latest.json.lock`, runs both the real SubagentStart hook and the real Stop hook, asserts neither clobbers `latest.json` nor hangs), an in-lock re-check test (splices a rendezvous pause into `stop-orchestrator.sh`'s fallback writer right before it enters the lock-guarded branch, commits a newer scope via a real concurrent advisor call during the pause, asserts the newer scope survives and Stop's own per-turn file still updates), and a trim-parity test (whitespace-padded `transcript_path`, asserts the advisor and Stop resolve the same scope and fallback marking works instead of failing open).
  - Fail-then-pass confirmed with real captured output across four isolated revert cycles (Fix A tested separately in each of the two files it touches, plus Fix B and Fix C each in isolation): Fix A / `subagent-start-context.sh` (clobber reproduced — `spawned:true` appeared despite the held lock), Fix A / `stop-orchestrator.sh` (clobber reproduced — `fallback_used:true` appeared despite the held lock, with the SubagentStart half of the same test still passing since that file's fix was left intact), Fix B / `stop-orchestrator.sh` (an isolated intermediate snapshot keeping the Fix A branch split but reverting only the in-lock re-check reproduced the stale-scope rollback), and Fix C (reverting just the `.trim()` reproduced the fail-open). All four restores confirmed byte-identical via `diff` before re-confirming pass.
  - A structural side effect: Fix A's restructuring duplicated a lock-compare line two pre-existing second-round tests relied on for splice-anchor uniqueness. Fixed with a small `spliceSecondOccurrence` test helper so both tests keep targeting the same window they always targeted, rather than silently splicing into the new (wrong) occurrence.
  - Verification: focused `tests/cli/hook.test.ts` 50 pass / 0 fail, 369 `expect()` calls (47 plus the three new tests, +25 `expect()` calls). Full suite 1168 pass / 1 skip / 0 fail, 11623 `expect()` calls across 102 files (grown from the sixth round's 1165/11598 by exactly the three new tests). `bun run check:type` pass. `bun run check:hooks` pass (new digest `sha256:c1b9e37ed5361878e08a0f43124ec90075d023cf4a4c910d9ccb8af0745f27c8`, reflecting the Fix A/B restructuring in both files and the Fix C trim). `bun run check:helpers` pass, unchanged digest (no helper file touched this round). `bash -n` on all six hook scripts passes. All three mirror pairs confirmed byte-identical via `diff`. This round's dispatch scoped Verification narrowly (matching the fifth/sixth-round precedent); the broader root checks were not re-run since no file outside the three named hook scripts, their mirrors, and the test file changed.
  - Per explicit user decision, this closes the lock-protocol work for this contract: no further gap was found or pursued beyond the three named fixes, and any future finding in this area starts a new task rather than an eighth round here.

## Rollback Point

- Commit / checkpoint: rebased 2026-07-13 onto `origin/main` `7b6ba87`; prior stale base was `788ba60cca5e0072febc19833002a3ffe497b0a1`.
- Revert strategy: revert the single work-package diff (uncommitted at time of writing); no external data or migration rollback is needed.
