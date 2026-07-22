# Task Contract: epc-05-checks-latest-materializer

> **Status**: Active
> **Plan**: plans/plan-20260722-1929-epc-05-checks-latest-materializer.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `822153362d008dc2f4418903711f85e9e8266207` (pinned per R1 post-wave: fresh fetch after EPC-04 PR #120 merged, plus its row-flip commit `docs(program): mark epc-04 done via PR #120; EPC-05 unblocked`; verified equal to this worktree's HEAD at task start)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-05-checks-latest-materializer`
> **PR Unit**: one PR carrying the new materializer module, the verify-producer payload upgrade, the verify-sprint.sh cutover (plus its deterministic `assets/templates/helpers/` mirror), the single `workflow-state.sh` bootstrap deletion, the red-first test suite, the characterization updates it required, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 21:45
> **Review File**: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md`
> **Notes File**: `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

EPC-05 implements Sprint C backlog row 9 and is the Program's first authority
cutover: `checks/latest.json` is authored today by whichever writer ran last
(the audit's "shadow authority" finding). With EPC-01..04 merged, every trust
class the Program recognizes (authoritative machine verification, observed
PostBash, human/external attestation) now flows into the EvidenceEvent
ledger, so `checks/latest.json` can finally become what D4 requires: a
projection carrying no independent trust of its own. This package deletes
the two direct-authoring sites EPC-00 froze as row 9's complete enumeration
(`scripts/verify-sprint.sh`'s `cp`, `.ai/hooks/lib/workflow-state.sh`'s `{}`
bootstrap) in the same package that replaces them (R5) -- what prevents a
dual authority from surviving the transition.

## Goal

1. `src/effects/evidence/checks-materializer.ts` (new): implements the frozen
   D7 selection predicate over the per-worktree ledger -- `worktree_id`
   equal to the active contract's own slug (this system's existing reduction
   of "worktree_id == current AND contract_id == active contract" into one
   filterable field, per `verify-producer.ts`'s `worktreeIdFor`, exported and
   reused rather than re-implemented), `subject_hash` exact equality,
   `trust_class` `authoritative_machine` always admitted plus
   `human_acceptance`/`external_attested` admitted only where the active
   contract's Acceptance Policy JSON enumerates them (D4; a local structural
   re-parse of the same block `acceptance-receipt.ts` reads, since `src/`
   must not depend on `scripts/`), supersedes excluded (already applied by
   the EPC-01 fold), winner = highest append position (never mtime/filename).
   Renders `checks/latest.json` preserving the consumer-facing
   `repo-harness-run-trace.v1` field shape plus a nested D8 provenance block
   (`schema_version`, `generated_at`, `materializer_version`,
   `source_event_ids`, `source_checkpoint_id: null`, `subject_hash`,
   `content_hash`, `worktree_id`, `contract_id`). No exact subject match (or
   a matching event that carries no run-trace content at all) renders a
   typed `status: "unsatisfied"` (fail closed).
2. Verify-producer payload upgrade (`verify-producer.ts`, `emit-verify-evidence.ts`):
   an optional, purely additive `runTrace` input carries the full finalized
   run-trace object; when supplied, it rides inside the existing "json"
   payload's `run_trace` field, so EPC-01's already-frozen D6 construction
   invariant (path-safety + redaction, then inline-or-blob by the existing
   200-line/8-KiB cap) decides inline-vs-blob exactly as it does for every
   other payload value -- no new bypass. Omitted entirely when the caller
   supplies nothing, so every existing direct caller of
   `emitAuthoritativeVerifyEvidence` (including
   `tests/evidence-verify-producer.test.ts`, out of this package's
   `allowed_paths`) observes a byte-identical payload shape to before.
   Producer invariants (subject binding, fail-closed classes, wrapper exit
   codes 0/3/other) unchanged.
3. `scripts/verify-sprint.sh` cutover (+ `assets/templates/helpers/verify-sprint.sh`
   mirror via `bun run sync:helpers`): both direct-authoring sites named by
   EPC-00 are deleted. `emit_verify_evidence()` now reads its subject/run-snapshot
   binding from an explicit run-trace file argument (not from
   `$checks_file`, which this script no longer writes directly), passes that
   file through as the emitted event's `run_trace`, and passes
   `--checks-file "$checks_file"` so a successful emission also materializes
   `checks/latest.json` from the ledger (`emit-verify-evidence.ts` is this
   materializer's single call site). Emission is now attempted for both a
   passing AND a failing verify result (a failing run is still a real,
   subject-bound `authoritative_machine` fact; consumers already read the
   payload's own status field, not the event's trust class, to tell pass
   from fail) -- this is required for `checks/latest.json` to ever reflect a
   failing outcome once direct authoring is gone. Cannot-bind (exit 3) means
   `checks/latest.json` is simply not (re)written this run, never a
   fabricated or stale-content fallback. The `--prepare-acceptance` freeze
   and `finalize_prepared_acceptance` semantics (frozen `review_subject`
   binding, receipt pending -> pass flow, `acceptance-receipt.ts verify`
   staleness check) are unchanged in a ledger-reachable context; the ONE
   named residual is documented in Deliverable D below.
4. `.ai/hooks/lib/workflow-state.sh` deletes ONLY the `{}` bootstrap line
   inside `workflow_ensure_harness_surface`; nothing else in this file
   changes. **Scope correction found during full-suite verification**:
   `.ai/hooks/lib/workflow-state.sh` is not independently authoritative --
   it is a generated projection of `assets/hooks/lib/workflow-state.sh`
   (`scripts/sync-hook-sources.ts`, `canonical_root: assets/hooks`,
   `projection_target: .ai/hooks`). Editing only the projected copy is not
   durable: `tests/hook-source-projection.test.ts`'s own drift/idempotency
   checks (part of the full `bun test` run) regenerate `.ai/hooks/` from the
   canonical source and silently reverted the edit. The identical one-line
   deletion is therefore applied to BOTH `assets/hooks/lib/workflow-state.sh`
   (the canonical source -- added to `allowed_paths` below) and
   `.ai/hooks/lib/workflow-state.sh` (regenerated from it via `bun run
   sync:hooks`, byte-identical). Every existing consumer of
   `workflow_checks_file`'s content (`workflow_checks_pass`,
   `workflow_acceptance_receipt_status`, `workflow_next_action`'s own
   `[[ ! -f "$checks_file" ]]` branch) already treats "missing or empty" as
   its own fail-closed case, so this changes no consumer's observable
   pass/fail outcome, only which message it prints.
5. `tests/evidence-checks-materializer.test.ts` (new, red-first: fails with
   "Cannot find module" before the materializer existed): the full D7
   predicate matrix (exact-subject-only, stale-subject unsatisfied,
   append-position winner over `created_at`, supersedes exclusion,
   trust-class + policy gating for all four trust classes, worktree_id
   mismatch), D8 provenance completeness and `content_hash` self-consistency
   plus replay determinism, a hand-edited `checks/latest.json` fully
   overwritten by the next materialization, two end-to-end
   producer-then-materializer tests (pass and fail), and a
   no-independent-authoring sweep over `scripts/`, `src/`, `.ai/hooks/` that
   fails if any writer of `checks/latest.json` exists outside this
   materializer module, its single call site, and a small named allowlist of
   pre-existing project-initialization/adoption scaffolding that seeds a
   brand-new downstream repo's genesis placeholder (a distinct, out-of-scope
   lifecycle -- see Scope).
6. All characterization suites green, updated only where they asserted the
   deleted direct-authoring mechanics (the sanctioned semantic change of this
   row): 8 `verify-sprint` fixtures in `tests/helper-scripts.test.ts` (every
   deployed-helper fixture in that file cannot-binds emission today --
   `scripts/emit-verify-evidence.ts` and the ledger/materializer modules are
   source-repo-only tooling, never copied into `assets/templates/helpers/`,
   mirroring the EPC-03/04 precedent for `post-bash-importer.ts`/`attested-import.ts`).
   `tests/prompt-handler.test.ts` and `tests/acceptance-receipt.test.ts`
   needed zero changes (verified by running them unmodified). Full `bun
   test` green; one independent PR on
   `codex/epc-05-checks-latest-materializer`.
7. **Orchestrator ruling on residual finding 2b (authorized mid-package
   widening)**: `src/cli/hook/mutation-observed.ts`'s
   `processContractVerification` (Stop-time continuous contract
   verification, via the post-edit-guard cascade) IS a live direct-authoring
   path for `checks/latest.json` -- it invokes `verify-contract.sh
   --report-file <path>` where `<path>` defaulted to the policy
   `harness.checks_file` (`.ai/harness/checks/latest.json`), the same file
   the materializer now exclusively authors. Row 9's acceptance line
   ("every direct authoring path deleted in this package") requires closing
   it here. Fix: `resolveContractVerificationTarget` now points the
   continuous-verification report at a dedicated
   `.ai/harness/checks/contract-verify.latest.json` instead of resolving the
   policy checks_file; the policy default itself (`resolveChecksFile`,
   `harness.checks_file`) is unchanged for every other consumer. Rationale:
   continuous verification is Stop-time telemetry (a different, incompatible
   schema -- `verify-contract.sh`'s own `write_report()` has no
   `source`/`status`/`exit_code` fields at all), not acceptance evidence;
   writing it to the acceptance-evidence path was exactly the last-writer-wins
   shadow authority the audit called out (Stop-time telemetry could silently
   clobber a frozen `--prepare-acceptance` evidence bundle). The new filename
   is already covered by the existing `.ai/harness/checks/*.latest.json`
   gitignore pattern. `isCheckpointPath`'s existing check for
   `.ai/harness/checks/latest.json` is unchanged and NOT extended to the new
   filename (documented decision: that guard flags a hand-EDIT of the
   acceptance-evidence file as checkpoint-worthy; the new file is
   machine-written telemetry, never edited via a tool call, so extending the
   guard to it would be dead code). `tests/mutation-observed.test.ts`'s one
   assertion characterizing the old target path is updated; every other
   assertion in that file (including the `isCheckpointPath` coverage) is
   unchanged. Full `bun test` re-verified green after this change.
8. **Gatekeeper CRITICAL fix (orchestrator ruling, authorized mid-package
   widening): D6 entropy redaction was mangling the run_trace payload**.
   `src/core/evidence/redaction.ts`'s high-entropy pattern
   (`[A-Za-z0-9+/_-]{32,}`) matched legitimate 32+ char dot-free runs in
   structured payload values -- an already-computed `sha256:`-prefixed hash
   got double-hashed (`sha256:sha256:...`), and any repo-relative path whose
   directory+filename-stem run reached 32+ chars (any realistic contract
   slug, including this package's own) had that run replaced with a hash,
   breaking `review_subject_sha256`, `run_file`, `lifecycle.snapshot`,
   `contract.file`, `active_plan`, `allowed_paths`/`files_changed` array
   entries, and 40-char git SHAs in `diff_base`. Live repro:
   `evt-01KY4YMNNF0BFAPHV968AX04J6` in this worktree's own ledger (the
   gatekeeper's own dogfood run of this contract). Fix (Option B, a
   within-letter D6 refinement -- D6's frozen text pins the invariant that
   secrets never appear raw, not this exact pattern): two typed exemptions
   applied structurally BEFORE the entropy pass runs (deny-by-construction
   preserved, never a post-hoc unhash) -- (1) a whole string value matching
   `^(sha256:)?[0-9a-f]{40,64}$` is a declared hash, entropy-exempt (kills
   the double-prefix bug; whole-value match only, no partial-token
   exemption); (2) a field whose key follows the existing path-key
   convention (`path`/`_path`/`Path` suffix) keeps its existing fail-closed
   repo-relative validation and is entropy-exempt, AND a value that
   whole-value parses as a safe repo-relative path (contains `/`, no
   leading `/`, no `..` segment, ends in a file extension) is exempt too --
   covering the named fields above without renaming any of them. The
   secret-value denylist check still runs unconditionally over every field,
   exempted or not. Free-text fields (a command line embedding a path
   inside other words, `branch`, or any bare identifier with no path
   separator+extension) are NOT exempted and keep the entropy pattern
   exactly as before -- an accepted, out-of-ruling-scope residual since no
   consumer gates on those fields' exact value (documented in notes.md).

## Scope

- In scope: `src/effects/evidence/checks-materializer.ts`,
  `src/effects/evidence/verify-producer.ts` (payload upgrade only),
  `scripts/emit-verify-evidence.ts`, `scripts/verify-sprint.sh` +
  `assets/templates/helpers/verify-sprint.sh` (deterministic mirror via `bun
  run sync:helpers`), `.ai/hooks/lib/workflow-state.sh` +
  `assets/hooks/lib/workflow-state.sh` (its canonical projection source,
  discovered necessary during full-suite verification -- see Goal 4; the
  `{}` bootstrap site only, in both, kept in sync via `bun run sync:hooks`,
  which also mechanically updates its own tracked digest marker
  `.ai/hooks/.projection.json`), `tests/evidence-checks-materializer.test.ts`,
  `tests/helper-scripts.test.ts` (checks/latest.json-content assertions in
  the 8 `verify-sprint` fixtures only -- redirected to the unchanged run
  snapshot file, or asserting absence, per the cannot-bind reality of a
  deployed-helper fixture; every other assertion in every other fixture is
  untouched), `src/cli/hook/mutation-observed.ts` (the
  `resolveContractVerificationTarget` report-path redirect only -- see Goal
  7; authorized by orchestrator ruling after initial delivery) +
  `tests/mutation-observed.test.ts` (one characterization assertion for the
  same redirect), this package's plan/contract/review/notes,
  `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-05-checks-latest-materializer.json`.
  `tests/prompt-handler.test.ts` and `tests/acceptance-receipt.test.ts` are
  allowed-path but were NOT touched (verified green unmodified).
- Out of scope: EPC-01 store/fold modules (`src/core/evidence/*`,
  `src/effects/evidence/event-log.ts`, `blob-store.ts`, `event-writer.ts`,
  `epoch.ts`, `paths.ts`, `atomic-append.ts` -- read-only imports/pattern
  reference only), `post-bash-importer.ts`, `attested-import.ts`; consumer
  logic in `scripts/acceptance-receipt.ts`, `src/cli/hook/prompt-handler.ts`,
  `scripts/merge-gate.ts`, `scripts/verify-contract.sh` (must stay green
  unmodified -- verified: `mutation-observed.ts`'s fix changes only the
  ARGUMENT it passes to `verify-contract.sh --report-file`, never
  `verify-contract.sh` itself); project-initialization/adoption scaffolding
  (`scripts/plan-to-todo.sh`, `scripts/ensure-task-workflow.sh`,
  `scripts/lib/project-init-lib.sh`, `src/core/adoption/standard-plan.ts`);
  checkpoint/handoff/current writers (EPC-06/07); Context Packet (EPC-08);
  `tasks/current.md`; the sprint document; any new npm dependency.
- Non-goals: checkpoint materialization; recovery-view cutover; retiring
  `post-bash-latest.json`; deploying the ledger/materializer tooling to
  downstream adopted repos (residual 2a -- accepted by the orchestrator as a
  known Program intermediate state for EPC-09 to document; see notes.md's
  Open Questions).

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `822153362d008dc2f4418903711f85e9e8266207` before this package's worktree
  was created -- re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if a named consumer
  (`acceptance-receipt.ts`/`prompt-handler.ts`/`merge-gate.ts`/`verify-contract.sh`)
  cannot stay green without modification -- report instead of widening scope
  silently.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing `.ai/context/`
  or architecture files.
- Stop if the receipt staleness invariant (record immediately after
  prepare, no commit between) cannot be preserved under the materialized
  flow.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if materializing from the ledger cannot reproduce a
consumer-equivalent `checks/latest.json` in a ledger-reachable context
(i.e. a named consumer needs a rewrite to stay green), or if deleting the
two named direct-authoring sites breaks the frozen prepare/record/finalize
acceptance flow in that same context. Cheapest proof: this package's own
acceptance flow (a real, git-backed, source-rooted worktree -- this one)
completes end-to-end on the materialized file, and the full characterization
suite passes with only deleted-mechanics assertions updated.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260722-1929-epc-05-checks-latest-materializer.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md`
- Notes file: `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260722-1929-epc-05-checks-latest-materializer.md
  - tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md
  - tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md
  - tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md
  - src/effects/evidence/checks-materializer.ts
  - src/effects/evidence/verify-producer.ts
  - scripts/emit-verify-evidence.ts
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
  - .ai/hooks/lib/workflow-state.sh
  - assets/hooks/lib/workflow-state.sh
  - .ai/hooks/.projection.json
  - src/cli/hook/mutation-observed.ts
  - tests/mutation-observed.test.ts
  - src/core/evidence/redaction.ts
  - tests/evidence-event-store.test.ts
  - tests/evidence-checks-materializer.test.ts
  - tests/helper-scripts.test.ts
  - tests/prompt-handler.test.ts
  - tests/acceptance-receipt.test.ts
  - .ai/harness/worktrees/epc-05-checks-latest-materializer.json
  - tasks/todos.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Materializer/producer row; no benchmark-subject-touching change in this package.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/evidence/checks-materializer.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md
  tests_pass:
    - path: tests/evidence-checks-materializer.test.ts
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "No direct authoring path for checks/latest remains (cp and {} bootstrap deleted; no-independent-authoring test green)"
    - "Package's own acceptance evidence carries D8 provenance whose source_event_ids resolve to accepted ledger events"
    - "tasks/current.md untouched"
```

## Concurrency and Ownership

- This package runs serially (R4 default); it is not part of a parallel
  wave, so no cross-package `allowed_paths` disjointness proof is required.
- No shared barrel/export file: there is no `index.ts` anywhere under
  `src/effects/evidence/` (confirmed at task start and unchanged by this
  package).
- One same-package shared helper is intentional and documented:
  `checks-materializer.ts` imports `worktreeIdFor` from `verify-producer.ts`
  (both owned by this package) rather than re-implementing it. This is not a
  re-opening of the EPC-02/03/04 wave's "no shared private helper"
  qualification, which concerned proving independence across DIFFERENT
  parallel packages, not sharing within one serial package's own two files.
- **Resolved during this package (orchestrator ruling, see Goal 7)**:
  `src/cli/hook/mutation-observed.ts`'s `processContractVerification` was a
  third, previously-unnamed direct-authoring path for `checks/latest.json`
  (it invoked `scripts/verify-contract.sh --report-file <checks_file>` from
  the post-edit-guard Stop-time cascade, writing a narrower
  contract-verification-only schema directly over the acceptance-evidence
  path). The orchestrator ruled this must close in this package (row 9's
  "every direct authoring path" acceptance line). Fix: the report now
  targets a dedicated `.ai/harness/checks/contract-verify.latest.json`;
  `verify-contract.sh` itself (a named consumer) was never modified, only
  the argument `mutation-observed.ts` passes it. Reader trace (full
  results in the notes file): no reader anywhere depends on
  `verify-contract.sh`'s own report landing at the acceptance-evidence path
  -- `pendingPostEditJournalSection` (SessionStart) only reads event
  count/id, never payload content; no test exercises
  `processContractVerification`'s actual subprocess call; `isCheckpointPath`
  is a distinct, unrelated concern (detects a hand-EDIT of the
  acceptance-evidence file, deliberately not extended to the new
  machine-written telemetry file). `tests/mutation-observed.test.ts`'s one
  characterizing assertion is updated; every other assertion in that file
  (32 tests total in the combined suite run) is unchanged and green.
- If an out-of-band merge lands on `main` touching this package's
  `allowed_paths` before this package's PR merges, stop, re-fetch, and
  re-derive against the new state; never force-push over it.

## Acceptance Notes (Human Review)

- Functional behavior: `checks/latest.json` is now a deterministic
  materialization of the evidence ledger (D7 selection + D8 provenance);
  both named direct-authoring sites are deleted in this same package.
  Emission (and, on success, materialization) is attempted for both a
  passing and a failing verify-sprint run.
- Edge cases: no matching accepted event (`unsatisfied`); a matching event
  whose payload carries no `run_trace` (`unsatisfied`, fail closed rather
  than fabricating content); a superseded event (excluded, per the
  already-frozen D5 fold); append-position ties broken only by append order,
  never `created_at`/mtime; policy-gated `human_acceptance`/`external_attested`
  admission; a cannot-bind emission (no active contract, dirty contract, or
  the ledger/materializer tooling simply not reachable in a deployed-helper
  context) leaves `checks/latest.json` absent rather than stale or
  fabricated.
- Regression risks: the one remaining accepted residual (2a) is that in any
  context where the ledger/materializer tooling is unreachable (every
  downstream adopted repo today, and any self-hosted worktree without
  `REPO_HARNESS_SOURCE_ROOT` pointing at a full source checkout),
  `checks/latest.json`'s acceptance_receipt pending -> pass transition no
  longer becomes observable on that file (it stays at whatever a
  ledger-reachable run last materialized, or absent) -- accepted by the
  orchestrator as a known Program intermediate state (EPC-09 to document),
  not this package's to resolve. Residual 2b (mutation-observed.ts's
  Stop-time continuous-verification writer) was found and closed within
  this same package per orchestrator ruling; see
  `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`'s
  Open Questions for both writeups in full.

## Rollback Point

- Commit / checkpoint: the single commit on
  `codex/epc-05-checks-latest-materializer` before it merges.
- Revert strategy: revert the single PR -- restores the direct `cp`
  authoring, the `{}` bootstrap, and mutation-observed.ts's
  continuous-verification report target pointed back at the acceptance
  checks_file; removes the materializer module and the payload upgrade. No
  named consumer (`acceptance-receipt.ts`, `prompt-handler.ts`,
  `merge-gate.ts`, `verify-contract.sh`) was ever modified, so reverting
  cannot regress any existing consumer; this package's workflow artifacts
  revert with it.
