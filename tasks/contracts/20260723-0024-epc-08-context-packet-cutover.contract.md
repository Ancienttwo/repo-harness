# Task Contract: epc-08-context-packet-cutover

> **Status**: Active
> **Plan**: plans/plan-20260723-0024-epc-08-context-packet-cutover.md
> **Task Profile**: code-change
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `9ea195b99db26895821e9ee3e29ad2f460895649` (pinned per R1 post-EPC-07: fresh worktree branched from `origin/main` after EPC-07 merged (PR #123) plus its row-flip commit; verified equal to this worktree's HEAD at task start -- `git rev-parse HEAD` = `9ea195b9...` and `git merge-base --is-ancestor 9ea195b9... HEAD` holds)
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-08-context-packet-cutover`
> **PR Unit**: one PR carrying the Goal-1 inventory (this contract), the session-context.ts evidence-availability cutover, the deleted ad-hoc marker-scan, the 27-state panel measurement runner, the committed panel report, the red-first/characterization test updates, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-23 00:24
> **Review File**: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md`
> **Notes File**: `tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The SessionStart Context Packet (`src/cli/hook/session-context.ts`, consolidated
into one budgeted render by HRD-04) is the last consumer named by the sprint's
row-12 acceptance line. EPC-05/06/07 already built every canonical projection
this repo has (materialized `checks/latest`, the EPC-06 checkpoint, the EPC-07
recovery views) specifically so downstream consumers stop re-deriving
evidence/recovery claims on their own. Both the EPC-07 contract's Phase A
inventory and `recovery-materializer.ts`'s own module doc single out
`session-context.ts`'s `resumeAvailable()` by name as "an EPC-08 SessionStart
internal, out of this package's scope" -- i.e. explicitly deferred to this
package's own inventory-and-cutover decision, not resolved by EPC-07.

## Goal

1. Inventory (Goal 1, binding sequencing -- recorded below, before any Phase B
   edit) every source `session-context.ts` reads for packet content,
   classified (a) already-canonical projection, (b) primary-source
   re-derivation to cut over, or (c) legitimate live session context.
2. Cutover (Goal 2): the one (b) finding -- `resumeAvailable()`'s ad-hoc
   marker/header string-scan of the rendered resume.md -- is deleted and
   replaced by a direct call into the canonical checkpoint-backed evidence
   reader (`resolveRecoveryEvidence`, EPC-06/07, read-only import). Budget
   mechanics (`SESSION_CONTEXT_TOKEN_BUDGET = 1500`, `utf8_bytes_div_4`)
   stay frozen and unchanged.
3. Panel measurement runner (sibling script) renders the full SessionStart
   Context Packet across the 27-state Authority×Profile panel and gates on
   the two EPC-00-frozen token numbers.
4. Measurement report committed as a tracked package artifact.
5. Red-first tests prove the deleted ad-hoc scan is gone and the packet's
   evidence-availability gate now resolves from the canonical reader.

## Phase A: Inventory (recorded before any Phase B edit)

Every source read by `src/cli/hook/session-context.ts` for packet content,
in the file's own composition order
(`sessionStartMainContent`'s 8 sub-blocks, then `minimalChangeSessionSection`,
then `securitySentinelSessionSection`). "Packet" here is the full SessionStart
`additionalContext` string as actually delivered: `handler-registry.ts`'s
`session-context` handler also prepends an `effective-state` section
(`runtime.ts:179-244`, out of this package's owned surface -- see note below)
and `pendingPostEditJournalSection` (`mutation-observed.ts`, an EPC-03
producer/importer surface, explicitly read-only per this package's
EXECUTION_BOUNDARY) before `buildSessionStartSections()`'s three sections.

### 1. `resumeBlock` (`session-context.ts:621-631`)

- `workflowResumePacketFile`/`workflowHandoffFile` (`:239-247`) resolve the
  resume/handoff file paths via `.ai/harness/policy.json` (`policyGet`).
  **(c) legitimate** -- path/config resolution, not an evidence claim.
- `resumeCurrentForHandoff` -> `resumeAvailable` (`:577-593`): **today**, reads
  `resume.md`'s raw text and does
  `text.includes('<!-- generated-by: repo-harness codex-handoff-resume v1 -->') && text.includes('## Resume Prompt')`.
  **(b) primary-source re-derivation -- CUT OVER.** This re-derives "is there
  evidence-backed recovery state" by string-scanning the rendered Markdown
  instead of asking the checkpoint resolver that already knows the answer in
  typed form. Both the EPC-07 contract and `recovery-materializer.ts`'s own
  header comment name this exact function as deferred to EPC-08. Replacing
  projection: `resolveRecoveryEvidence(repoRoot).available`
  (`src/effects/evidence/recovery-materializer.ts`, wraps
  `resolveLastPublishedCheckpoint`, EPC-06/07, read-only import). Post-EPC-07
  every Stop produces the SAME one-shape resume.md via the single
  materializer, so the marker string is now a constant, format-coupled
  vestige of the pre-EPC-07 two-writer split this exact check used to
  discriminate; the checkpoint's own `available: true/false` is the
  authoritative signal the materializer itself already resolved when it
  rendered the file. `handoffSectionHasSignal`'s mtime/marker-independent
  gate (whether it fires at all) is unaffected; only the availability
  predicate changes.
- `resumeCurrentForHandoff`'s mtime comparison (`resumeMtime >= handoffMtime`,
  `:589-592`): **(c) legitimate**, kept as-is. This is a same-materializer-pass
  plumbing check (was resume written in the same or a later pass than
  handoff), not an evidence claim; EPC-07 already made both views one atomic
  write, so this gate is now nearly always true by construction, and it
  never asserts anything about evidence content.
- `activePlanExists`/`activeTodoExists` (`:542-555`) read the active plan file
  and `tasks/todos.md` for their own `Status`/checkbox state. **(c)
  legitimate** -- these are the ledger/plan's own tracked source of truth for
  "is there an active plan/todo," not a re-derivation of anything the
  EvidenceEvent ledger governs; there is no more-canonical projection of
  "plan status" than the plan file's own `Status` header.
- `handoffSectionHasSignal` (`:557-575`) scans the ALREADY-RENDERED
  `handoff/current.md` (the EPC-07 canonical view) for non-empty
  `## Blockers`/`## Changed Files` sections. **(a) already-canonical
  projection** -- reads the rendered view file itself, which
  `recovery-materializer.ts`'s own module doc explicitly classifies as
  workflow CONTEXT ("where work stands"), a different kind of fact from
  evidence ("what was proven") that the materializer itself reads fresh from
  the live repo on every render; no independent re-derivation happens here,
  only a presence check on the projection's own rendered section.
- `capResumeContent(readText(repoRoot, resumeFile))` (`:631`): **(a)
  already-canonical projection** -- quotes resume.md's own rendered text
  verbatim (capped at 12000 chars); this is "the view file it renders," named
  explicitly as an acceptable canonical-projection read.

### 2. `capabilityContextPendingContext` (`:635-671`)

Reads `.ai/harness/capability-context/requests.jsonl`. **(c) legitimate** --
an unrelated queue subsystem (capability-context sync requests), orthogonal to
the D1-D9 EvidenceEvent/checkpoint/checks topology; the queue file is its own
source of truth, not a re-derivation of ledger state.

### 3. `architectureQueuePendingContext` (`:674-720`)

Reads `docs/architecture/requests/*.md`. **(c) legitimate** -- the
architecture-drift queue, a separate tracked subsystem with its own
Status/Detected headers as source of truth; not evidence/recovery state.

### 4. `pendingPlanCaptureContext` (`:726-815`)

Reads `.ai/harness/planning/pending.json` + the active plan file. **(c)
legitimate** -- pending-orchestration marker, its own tracked source of truth
for "is a plan capture pending"; not an evidence claim.

### 5. `currentStatusSnapshotContext` (`:817-863`)

Reads `tasks/current.md` directly, plus `git show <target>:tasks/current.md`
for the target-branch copy of the SAME tracked file. **(a) already-canonical
projection** -- `tasks/current.md` is explicitly named as the canonical
tracked derived-status-snapshot projection (materialized by
`refresh-current-status.sh`, D9 KEEP verdict, EPC-07 Phase A); reading it (at
either ref) is reading the projection, not re-deriving it.

### 6. `activeSprintContext` (`:865-923`)

Reads `.ai/harness/sprint/active-sprint` + the referenced sprint file's own
`Status`/backlog table. **(c) legitimate** -- the sprint document is its own
tracked source of truth for backlog progress; not evidence/recovery state.

### 7. `toolingUpdateAdvisoryContext` (`:927-1208`)

Reads/writes `.ai/harness/security/tooling-update-advisory-*.{json,rendered,lock}`
via a `repo-harness setup check` subprocess (sync or detached). **(c)
legitimate** -- a version/tooling advisory cache, unrelated to the evidence
ledger; writes its own namespaced cache files, never touches
`checks/*` or the evidence store.

### 8. `codexDelegationAutoContext` (`:1210-1277`)

Reads `.ai/harness/policy.json` (`delegation.mode`/`max_agents`) and
`~/.repo-harness/config.json`. **(c) legitimate** -- policy/config resolution,
not an evidence claim.

### 9. `minimalChangeSessionSection` -> `loadMinimalChangePolicy` (`:51-68`)

Reads the minimal-change policy file. **(c) legitimate** -- policy-driven
advisory text, unrelated to evidence/recovery.

### 10. `securitySentinelSessionSection` -> `runSecurityScan` (`:153-195`)

Fingerprints `.claude/settings.json`/`.codex/hooks.json`/`.vscode/tasks.json`,
runs a security scan, writes `.ai/harness/security/{latest.json,state.sha256}`
(a DIFFERENT namespace from `.ai/harness/checks/latest.json`). **(c)
legitimate** -- its own scan/cache authority for a distinct domain (repo
config safety), never overlaps the D7/D8 evidence provenance this package
governs.

### Cold-path housekeeping (not packet content)

`rotateSessionStartEventLogs` (`:520-532`) rotates `.ai/harness/events.jsonl`
and `.ai/harness/architecture/events.jsonl` -- the pre-existing WORKFLOW event
log (`workflow_append_event`), a different, older subsystem from the
per-worktree EvidenceEvent ledger (`.ai/harness/evidence/events/`, D1). Byte
rotation only, never parsed/interpreted as content; produces zero session
content. Not classified (a)/(b)/(c) -- out of the packet-content inventory by
construction.

### Packet siblings outside `session-context.ts` (found, not owned by this package)

- **`effective-state` section** (`runtime.ts:179-244`, added directly by
  `handler-registry.ts`, not via `session-context.ts`): already sources
  verification state canonically -- `resolve-effective-state.ts:214`
  (`CHECKS_PATH = '.ai/harness/checks/latest.json'`) reads the SAME
  materialized file `checks-materializer.ts` (EPC-05) writes. This already
  satisfies the sprint's "checks/latest for verification state" requirement
  for the packet as a whole; it is a pre-existing, independently-owned core
  state resolution used by every hook route (not SessionStart-specific), well
  outside "`session-context.ts` and its direct assembly collaborators" --
  out of scope, not touched.
- **`pendingPostEditJournalSection`** (`mutation-observed.ts`, added directly
  by `handler-registry.ts`): an EPC-03 producer/importer surface, explicitly
  read-only per this package's EXECUTION_BOUNDARY. Out of scope, not touched.

### Conclusion

Exactly one (b) finding: `resumeAvailable()`'s marker/header string-scan.
Every other read is either (a) already reading a canonical projection file
(handoff/resume views, `tasks/current.md`) or (c) a legitimate direct read of
a tracked subsystem's own source of truth that the D1-D9 evidence topology
never claimed authority over. The "materialized checks/latest for
verification state" and "tasks/current.md for the derived snapshot" bullets
of the sprint's Goal 2 are both already satisfied -- the former by the
pre-existing, out-of-scope `effective-state` section, the latter by
`currentStatusSnapshotContext` -- so Goal 2's only in-package code change is
the `resumeAvailable()` cutover.

## P1: Architecture Map

- Design authority: EPC-00's amended row-12 acceptance line (panel, both
  token gates, method `utf8_bytes_div_4`) and frozen D4 (projections carry no
  independent trust -- the packet may cite, never re-derive); EPC-05/06/07
  surfaces consumed read-only via their public readers
  (`resolveRecoveryEvidence`/`resolveLastPublishedCheckpoint`).
- Owned surface: `src/cli/hook/session-context.ts` (the one cutover edit),
  the new panel measurement runner script, and its tests. Stop handler,
  recovery-materializer, checkpoint modules, checks-materializer, and
  producers/importers are read-only (consumed only via their existing public
  exports) per this package's EXECUTION_BOUNDARY.
- Authority×Profile fixtures reused: `tests/state/effective-state-fixture.ts`
  (`createEffectiveStateFixture`, `EFFECTIVE_STATE_SCENARIOS`,
  `replaceContractProfile`) is the existing HRD/LSC-era characterization
  fixture builder for exactly this shape of state (a git-initialized fixture
  repo with plan/contract/review/`checks/latest.json`/`tasks/current.md`,
  scenario setups including `foreign-worktree-owner` and
  `invalid-capability-registry`, and a `replaceContractProfile` helper for the
  Workflow Profile field). The panel runner (`scripts/`) cannot import this
  test-only module (no script in this repo imports from `tests/`, and
  `tsconfig.json`'s `include` never covers `scripts/**`), so its fixture
  builder is a small, self-contained duplicate of the same shape, documented
  as reusing this pattern -- consistent with this package's own established
  "small helper duplicated across a layer boundary, not imported" convention
  (`recovery-materializer.ts`/`checks-materializer.ts` both do this
  explicitly for their own tiny generic helpers).

## P2: Concrete Trace

EPC-07 merges -> `main` at `9ea195b9` -> EPC-08 worktree branches from it
(verified equal) -> Phase A inventory recorded in this contract -> the one
(b) finding cut over (`resumeAvailable` -> `resolveRecoveryEvidence`) with
the old marker-scan deleted -> panel runner renders 27 states (9 authority
states x 3 profiles) via the real `bun src/cli/hook-entry.ts SessionStart
--route default` subprocess, one deterministic token/within_budget sample per
state plus a >=20-iteration descriptive latency sample -> report committed
with both gate numbers green -> red-first tests updated/added -> full suite
green -> one PR.

## P3: Design Decision

- The (b) cutover is deliberately narrow: `resumeAvailable()`'s body changes
  from a string scan to one call into `resolveRecoveryEvidence`; nothing else
  in `session-context.ts` re-derives evidence/recovery state independently
  today (EPC-05/06/07 already built every canonical projection this file
  needed, so the remaining gap really is this small). No new
  verification-state section is added to `session-context.ts` itself --
  Goal 2's "checks/latest for verification state" requirement is already
  satisfied for the delivered packet by the pre-existing, out-of-scope
  `effective-state` section (confirmed by tracing `CHECKS_PATH` in
  `resolve-effective-state.ts` to the same materialized file
  `checks-materializer.ts` writes). Adding a duplicate section would be an
  unrequested extra, not a cutover.
- The panel is a NEW measurement capability (Goal 3/4), independent in size
  from the Goal-2 code diff; it renders the FULL packet (not just
  `session-context.ts`'s own sections) via the real SessionStart subprocess,
  matching how a live host actually invokes it and how
  `hook-dispatch-diet-report.ts`'s own `session_start_context` probe already
  measures this exact packet (mirrored, not imported: that file's
  `percentile`/token-estimator/subprocess-probe shape is duplicated in the
  new sibling script per the same small-helper-duplication convention, since
  neither is exported).
- One deterministic sample per state for tokens (packet content is
  deterministic per fixture state, EPC-00 confirmation); latency is
  non-deterministic and gets the `>=20`-iteration descriptive treatment only
  (matching HRD-08's own `HRD08_CHARACTERIZATION_CYCLES=20` precedent),
  never gated.

## Concurrency

- **R2 Layer 1 (repository ownership):** this package's changed paths
  (`src/cli/hook/session-context.ts`, `scripts/session-context-packet-panel.ts`,
  two test files, this package's own workflow artifacts) intersect no other
  active package's `allowed_paths` -- EPC-07 is Done/merged, EPC-09 has not
  started.
- **R2 Layer 2 / R3 (verification-subject freeze):** `src/cli/hook/` sits
  under `src/cli`, one of the benchmark subject inputs named by R2. **No
  benchmark subject freeze is active at this contract's pin time** -- the
  VGBR-R quiescence window closed when its report PR (#115) merged (git log:
  "quiescence window lifted"), and no later row has re-opened a frozen
  verification subject. This package's `src/cli` edit is therefore
  unconstrained by R2/R3 at pin time; if a future row opens a new subject
  freeze before this package's PR merges, re-check before merging rather than
  assuming this note still holds.

## Scope

- In scope: `src/cli/hook/session-context.ts` (the one `resumeAvailable()`
  cutover edit named in Phase A); `scripts/session-context-packet-panel.ts`
  (new panel measurement runner); `tests/session-context.test.ts` (resume-
  availability test updates + the no-independent-assembly proof);
  `tests/session-context-packet-panel.test.ts` (new, panel shape/gate/
  determinism tests); the tracked panel report
  `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.panel.md`; this
  package's own plan/contract/review/notes; `tasks/todos.md` projection;
  `.ai/harness/worktrees/epc-08-context-packet-cutover.json`.
- Out of scope: Stop handler, recovery materializer, checkpoint modules,
  checks materializer, producers/importers (EPC-02..07 surfaces, read-only
  consumed via their existing public exports only);
  `SESSION_CONTEXT_TOKEN_BUDGET` value or the `utf8_bytes_div_4` estimator
  method (frozen surfaces, imported/mirrored read-only, never modified);
  `resolve-effective-state.ts` / the `effective-state` SessionStart section
  (pre-existing, independently-owned, out of "`session-context.ts` and its
  direct assembly collaborators"); `tasks/current.md` content and
  `scripts/refresh-current-status.sh`; the sprint document; any new npm
  dependency.
- Taste constraints: none beyond the repo's default minimal-change policy.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing `.ai/context/`
  or architecture files.
- Stop if a panel state cannot reach the token gates without a content
  redesign beyond the one named cutover -- report the measured numbers for
  an orchestrator ruling (the gate numbers are frozen; the content knife is
  a design decision, not this contract's to make unilaterally).
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if `session-context.ts` needs to independently
re-derive evidence/recovery/verification claims that a canonical projection
cannot supply (i.e. Goal 1's inventory finds a real gap, not just the one
`resumeAvailable()` finding), or if the cutover or the panel cannot keep the
full SessionStart packet within the two frozen token gates across all 27
states. Cheapest proof: the committed 27-row panel table with every sample
<= 1500 / within_budget and p95 <= 700, produced by the committed runner
against the cutover code, plus the no-independent-assembly test proving the
old marker-scan is gone.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Workflow Inventory

- Source plan: `plans/plan-20260723-0024-epc-08-context-packet-cutover.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md`
- Notes file: `tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md`
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
  - plans/plan-20260723-0024-epc-08-context-packet-cutover.md
  - tasks/contracts/20260723-0024-epc-08-context-packet-cutover.contract.md
  - tasks/reviews/20260723-0024-epc-08-context-packet-cutover.review.md
  - tasks/reviews/20260723-0024-epc-08-context-packet-cutover.panel.md
  - tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md
  - tasks/todos.md
  - src/cli/hook/session-context.ts
  - scripts/session-context-packet-panel.ts
  - tests/session-context.test.ts
  - tests/session-context-packet-panel.test.ts
  - .ai/harness/worktrees/epc-08-context-packet-cutover.json
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
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
    - src/cli/hook/session-context.ts
    - scripts/session-context-packet-panel.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260723-0024-epc-08-context-packet-cutover.notes.md
    - tasks/reviews/20260723-0024-epc-08-context-packet-cutover.panel.md
  tests_pass:
    - path: tests/session-context.test.ts
    - path: tests/session-context-packet-panel.test.ts
  commands_succeed:
    - bun run check:type
    - bun scripts/session-context-packet-panel.ts --repo . --iterations 20
  manual_checks:
    - "Panel report committed: 27 rows, every sample <= 1500 with within_budget true, p95 <= 700, method utf8_bytes_div_4"
    - "No-independent-assembly test green (old path deleted)"
    - "tasks/current.md untouched"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: the single commit on `codex/epc-08-context-packet-cutover` before it merges.
- Revert strategy: revert the single PR -- restores `resumeAvailable()`'s
  marker/header string-scan and removes the panel runner + report; budget
  mechanics (`SESSION_CONTEXT_TOKEN_BUDGET`, `utf8_bytes_div_4`) were never
  modified either way, and `tasks/current.md` content was never touched, so
  reverting cannot regress either.
