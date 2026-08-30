# Plan: Sprint task: C9 — real multi-agent canary and multi-seat decision

> **Status**: Executing
> **Created**: 20260830-1839
> **Slug**: c9-real-multi-agent-canary-and-multi-seat-decision
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#C9 — real multi-agent canary and multi-seat decision
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md`; after execution revert branch `codex/c9-real-multi-agent-canary-and-multi-seat-decision` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md`
> **Task Review**: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md`
> **Implementation Notes**: `tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#C9 — real multi-agent canary and multi-seat decision
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md`
- Sprint contract: `tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md`
- Sprint review: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md`
- Implementation notes: `tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md`.

## Approach
### Strategy
Freeze the usefulness rubric and three read-only protocol-trace fixtures before
the first live provider run. Run each fixture in two disposable, separately
initialized repositories: a one-reader baseline and a treatment with one
Module Engineer, three concurrent read-only delegated Workers, the real signal
store/context delivery path, one cited source signal, and one adopted handoff.
Persist provider-authoritative Codex JSONL usage, monotonic timings, context
packet sizes, collaboration reuse/adoption counts, and before/after delivery
authority digests. Use the three matched runs as C9-B evidence, then decide the
multi-seat gate from the frozen PRD conditions rather than from aggregate score.

The cheapest proof point is one real `codex exec --json` contribution. It must
survive `dispatchDelegatedRun()` -> immutable stdout evidence -> the provider
output adapter -> the contribution collector. The probe already established
that the shipped adapter was reading raw marker lines although the frozen argv
emits Codex JSONL; fix that exact boundary before spending the full canary
budget, and pin the real wire shape in tests.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Product-path live canary | Measures the actual provider, sandbox, immutable receipts, store and injection path | Provider output is stochastic and costs real tokens | Use, with three frozen matched fixtures and exact usage receipts |
| Native subagents only | Cheap orchestration | Cannot prove delegated-run provenance, contribution collection or the C7 binding fence | Reject |
| Deterministic shims only | Stable regression evidence | C4 already proved Host mechanics; it cannot answer C9's real-provider question | Keep only for unit regression coverage |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/effects/collaboration/provider-output-adapter.ts` | Modify | Decode the exact Codex JSONL stdout envelope, expose provider-authoritative usage, then parse only the final agent message as a contribution |
| `tests/helpers/collaboration-delegation-fixture.ts` | Modify | Make the fake Codex emit the same JSONL wire shape and allow a canary to name real read paths |
| `scripts/c9-collaboration-canary.ts` | Add | Run isolated baseline/treatment fixtures, collect frozen metrics and issue the gate decision |
| `scripts/c9-collaboration-dispatch-runner.ts` | Add | Dispatch one admitted real Worker in a separate process so three readers run concurrently |
| `tests/unit/c9-real-multi-agent-canary-and-multi-seat-decision.test.ts` | Add | Pin rubric, contamination fence, metric/decision semantics and exact provider parsing |
| `docs/researches/20260830-c9-real-multi-agent-canary.md` | Add | Durable P1/P2/P3 report and the three matched live-run results |
| `README.md`, `docs/CHANGELOG.md`, `docs/spec.md`, `examples/agent-architecture.md`, `deploy/release-checklists/260830-collaboration-canary-decision.md` | Modify/Add | Document activation, operator command, decision and release gate |

### Code Snippets
```text
isolated fixture + frozen question
  -> real read-only capability receipt
  -> admit three Workers under one live parent claim
  -> stable Work Exchange collection
  -> bounded untrusted context packet + per-run binding
  -> three concurrent dispatch processes (`codex exec --json`)
  -> immutable process receipt/stdout blob
  -> exact JSONL final-message + usage decode
  -> contribution commit (signals + one handoff)
  -> source signal reuse + explicit handoff adoption
  -> authority/store digests and metrics
  -> frozen C9-A/C9-B/multi-seat decision
```

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Provider final output violates the contribution schema | Medium | A run completes but contributes no signal | Record the typed rejection; do not synthesize a draft or retry through another provider |
| Baseline leaks into treatment | Low | Invalid comparison | Separate repo/common-dir/HOME roots and assert disjoint paths, repository ids and collaboration snapshots |
| Live model variance | Medium | One run overstates the result | Freeze three matched fixtures and rubric; report every run, including unusable outputs |
| Authority drift | Low | Kill gate | Hash Task/Lease/Publication/Acceptance stores before and after; any delta blocks promotion |
| Persistent-seat recommendation exceeds evidence | Medium | New authority surface without need | Require the PRD's repeated delegated-start/handoff bottleneck condition; otherwise NO-GO |

## Task Contracts
- Contract file: `tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md`
- Review file: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md`
- Implementation notes file: `tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md`; after execution revert branch `codex/c9-real-multi-agent-canary-and-multi-seat-decision` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md`, `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md`, and `tasks/notes/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md`; after execution revert branch `codex/c9-real-multi-agent-canary-and-multi-seat-decision` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: C9 — real multi-agent canary and multi-seat decision

## Context

- Sprint: `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
- Backlog row: 10
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `C9 — real multi-agent canary and multi-seat decision` so that the acceptance line holds: C9-A 可行性通过；C9-B 重复证据成立；aggregate compute/cost 记录完整；usefulness rubric 开跑前冻结；跨臂污染防护到位；零 authority drift；输出 persistent multi-seat go/no-go

## Planning Expansion

Before editing code, use `$think` to expand this sprint row into a decision-complete implementation plan. The `$think` pass should read the sprint file, preserve the acceptance line, name concrete files or commands, and produce the detailed `plans/plan-*.md` body that drives contract execution.

## Task Breakdown

- [x] Expand the sprint row into this decision-complete P1/P2/P3 plan before implementation.
- [x] Freeze the usefulness rubric, three matched task fixtures and contamination checks in code and docs.
- [x] Correct and test the real Codex JSONL contribution boundary exposed by the cheapest proof point.
- [x] Run three isolated baseline/treatment pairs with three concurrent read-only Workers per treatment.
- [x] Prove signal reuse, handoff adoption, N-way competition, writer count <= 1 and zero delivery-authority drift.
- [x] Record aggregate provider usage, wall time, useful findings/10k tokens, first-useful/adopted latency, duplicate dead ends, reuse, restart cost, never-read rate and context sizes.
- [x] Run protocol-consumer, unit/effects/CLI/MCP/operator, type, build, workflow, packaging and ArchContext gates.
- [x] Update README, changelog, spec, example, research and release checklist with the persistent multi-seat and Phase 5/6 decisions.
- [ ] Record an external AcceptanceReceipt, finish the contract, back-fill sprint row 10 and push the branch.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Run `$think` for backlog task `C9 — real multi-agent canary and multi-seat decision` using sprint `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md` and acceptance: C9-A 可行性通过；C9-B 重复证据成立；aggregate compute/cost 记录完整；usefulness rubric 开跑前冻结；跨臂污染防护到位；零 authority drift；输出 persistent multi-seat go/no-go
- [ ] Capture the approved `$think` output with `repo-harness run capture-plan --source waza-think --source-ref sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#C9 — real multi-agent canary and multi-seat decision`
- [ ] Verify acceptance: C9-A 可行性通过；C9-B 重复证据成立；aggregate compute/cost 记录完整；usefulness rubric 开跑前冻结；跨臂污染防护到位；零 authority drift；输出 persistent multi-seat go/no-go
