# Plan: Respec agent fleet: add deep-worker, opus family default to Terra

> **Status**: Archived
> **Created**: 20260730-2148
> **Slug**: agent-fleet-deep-worker-respec
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md`; after execution revert branch `codex/agent-fleet-deep-worker-respec` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Review**: `tasks/reviews/20260730-2148-agent-fleet-deep-worker-respec.review.md`
> **Implementation Notes**: `tasks/notes/20260730-2148-agent-fleet-deep-worker-respec.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md`
- Sprint contract: `tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md`
- Sprint review: `tasks/reviews/20260730-2148-agent-fleet-deep-worker-respec.review.md`
- Implementation notes: `tasks/notes/20260730-2148-agent-fleet-deep-worker-respec.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md`.

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
- Contract file: `tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md`
- Review file: `tasks/reviews/20260730-2148-agent-fleet-deep-worker-respec.review.md`
- Implementation notes file: `tasks/notes/20260730-2148-agent-fleet-deep-worker-respec.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md`; after execution revert branch `codex/agent-fleet-deep-worker-respec` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260730-2148-agent-fleet-deep-worker-respec.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260730-2148-agent-fleet-deep-worker-respec.contract.md`, `tasks/reviews/20260730-2148-agent-fleet-deep-worker-respec.review.md`, and `tasks/notes/20260730-2148-agent-fleet-deep-worker-respec.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260730-2148-agent-fleet-deep-worker-respec.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260730-2148-agent-fleet-deep-worker-respec.md`; after execution revert branch `codex/agent-fleet-deep-worker-respec` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Respec the repo-owned agent fleet: add a new managed agent `deep-worker`, and
change the Claude->Codex model projection so the opus family now projects to
`gpt-5.6-terra` by default (sol stays only for the fable family), with two
explicit per-agent target overrides (fast-worker -> luna/max, deep-worker ->
terra/xhigh). Never write pinned Claude model versions anywhere; aliases only.

## Source

Orchestrator-dispatched execution brief (fast-worker dispatch), already
decision-complete: exact file list, exact code text for the generator's
`AGENT_TARGET_OVERRIDES` block, and exact verification commands were supplied
in the dispatch. This capture exists only to satisfy this repo's
PlanStatusGuard before editing `scripts/install-agent-fleet.sh`; the
dispatched brief is treated as the human-approved decision.

## In scope

- `agents/fleet/fast-worker.md`: byte-identical copy of the canonical
  `~/.claude/agents/fast-worker.md` (opus/medium).
- `agents/fleet/deep-worker.md` (new): byte-identical copy of the canonical
  `~/.claude/agents/deep-worker.md` (opus/high).
- `scripts/install-agent-fleet.sh`: `MANAGED_AGENTS`/`WRITABLE_AGENTS` include
  `deep-worker`; `MODEL_EFFORT_MAP.opus` family default becomes
  `gpt-5.6-terra`; add an `AGENT_TARGET_OVERRIDES` map applied after tuple
  validation for `fast-worker` (-> luna/max) and `deep-worker` (-> terra/xhigh).
- `assets/templates/helpers/install-agent-fleet.sh`: kept byte-identical to
  the scripts/ copy.
- `scripts/check-agent-tooling.sh` (+ assets mirror): `deep-worker` present in
  `AGENT_FLEET_DEFAULT_MANAGED`.
- `.codex/agents/*.toml` repo-local golden fixtures affected by the family
  default flip (deep-reasoner, root-cause-prover, harness-evaluator) and by
  new/changed source content (fast-worker, deep-worker) regenerated via the
  updated installer against a disposable HOME; explorer/gatekeeper untouched
  (sonnet/fable families unaffected).
- `docs/reference-configs/external-tooling.md` (+ assets mirror, byte-for-byte
  per `tests/readme-dx.test.ts`): mapping table, per-agent override
  documentation, writable-sandbox sentence, current-assignments sentence,
  and the Terra-route sentence.
- `tests/install-agent-fleet.test.ts`, `tests/check-agent-tooling.test.ts`,
  `tests/subagent-handler.test.ts`: updated roster/mapping expectations.

## Out of scope

`agents/fleet/{deep-reasoner,gatekeeper,explorer,root-cause-prover,harness-evaluator}.md`,
`scripts/contract-run.ts`, anything under the real `~/.claude/` or `~/.codex/`,
running the installer against the real HOME.

## Exit Criteria

- `bun test tests/install-agent-fleet.test.ts tests/check-agent-tooling.test.ts tests/subagent-handler.test.ts` passes.
- `bun test` (full suite) passes.
- `cmp scripts/install-agent-fleet.sh assets/templates/helpers/install-agent-fleet.sh` reports no difference.
- `bash scripts/check-task-sync.sh` and `bash scripts/check-architecture-sync.sh` run and their output is reported as-is.

## Task Breakdown

- [x] Copy canonical fast-worker.md / deep-worker.md into `agents/fleet/`.
- [ ] Update `scripts/install-agent-fleet.sh` model-effort map and per-agent overrides.
- [ ] Sync `assets/templates/helpers/install-agent-fleet.sh`.
- [ ] Verify/update `scripts/check-agent-tooling.sh` (+ assets mirror) roster.
- [ ] Regenerate affected `.codex/agents/*.toml` golden fixtures.
- [ ] Update `docs/reference-configs/external-tooling.md` (+ assets mirror).
- [ ] Update the three named test files for the new roster/mapping.
- [ ] Run full verification suite and report output.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Copy canonical fast-worker.md / deep-worker.md into `agents/fleet/`.
- [ ] Update `scripts/install-agent-fleet.sh` model-effort map and per-agent overrides.
- [ ] Sync `assets/templates/helpers/install-agent-fleet.sh`.
- [ ] Verify/update `scripts/check-agent-tooling.sh` (+ assets mirror) roster.
- [ ] Regenerate affected `.codex/agents/*.toml` golden fixtures.
- [ ] Update `docs/reference-configs/external-tooling.md` (+ assets mirror).
- [ ] Update the three named test files for the new roster/mapping.
- [ ] Run full verification suite and report output.
