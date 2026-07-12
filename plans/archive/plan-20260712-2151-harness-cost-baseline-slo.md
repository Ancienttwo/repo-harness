# Plan: Harness Cost Baseline and SLO

> **Status**: Archived
> **Created**: 20260712-2151
> **Slug**: harness-cost-baseline-slo
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: codex-approved-analysis
> **Source Ref**: user-approved:开工
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused reporter and skill-eval tests plus the repository required checks must prove additive metrics without runtime hook behavior changes.
> **Rollback Surface**: Revert the reporter, eval metadata, tests, SLO documentation, and workflow artifacts from this branch; no persisted data migration is involved.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md`
> **Task Review**: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md`
> **Implementation Notes**: `tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: user-approved:开工
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260712-2151-harness-cost-baseline-slo.md`
- Sprint contract: `tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md`
- Sprint review: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md`
- Implementation notes: `tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260712-2151-harness-cost-baseline-slo.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260712-2151-harness-cost-baseline-slo.md`.

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
- Contract file: `tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md`
- Review file: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md`
- Implementation notes file: `tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260712-2151-harness-cost-baseline-slo.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the reporter, eval metadata, tests, SLO documentation, and workflow artifacts from this branch; no persisted data migration is involved.
- **Verification boundary**: Focused reporter and skill-eval tests plus the repository required checks must prove additive metrics without runtime hook behavior changes.
- **Review/acceptance boundary**: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260712-2151-harness-cost-baseline-slo.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md`, `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md`, and `tasks/notes/20260712-2151-harness-cost-baseline-slo.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the reporter, eval metadata, tests, SLO documentation, and workflow artifacts from this branch; no persisted data migration is involved.

## Captured Planning Output

## Summary

Add an evidence-first cost baseline to the existing hook-diet report and skill-eval runner so repo-harness can measure synthetic hook phase latency, SessionStart output size, and provider-reported token usage without claiming unavailable live telemetry. This is the approved first slice from the architecture analysis; it deliberately does not change routing, workflow profiles, hook frequency, or runtime enforcement.

## Goal

Produce machine-readable, fail-closed cost evidence and explicit SLO fields using existing benchmark surfaces. Available structured provider values are recorded verbatim; unavailable values remain null with an authority reason.

## Success Criteria

- Hook phase probes report sample count, total, p50, p95, p99, and max latency.
- A SessionStart probe reports output/context bytes and an explicitly labeled `utf8_bytes_div_4` token estimate with a 1500-token context SLO.
- The hook report contains a runtime-evidence availability block; live hook invocation latency, repeat-guard count, and time-to-first-edit remain null because the current runtime does not record them.
- Claude skill evals use structured single-result JSON and Codex evals use structured JSONL while preserving final-response behavior.
- Skill eval metadata records provider-authoritative input/cached/output tokens, cost/turn/session fields when exposed, plus changed-file count; malformed or missing usage stays null and does not become zero.
- `modelCallCount`, `subagentCallCount`, and workflow `artifactCount` stay null unless an authoritative structured source is present.
- Existing with-skill/without-skill behavior and grader behavior remain intact; reports label the latter as a skill-disabled baseline, not No Harness.

## Constraints

- No new dependency, service, compatibility alias, fallback parser, regex inference, or hot-path runtime instrumentation.
- Do not modify `src/cli/hook/runtime.ts`, hook route semantics, prompt routing, delegation, worktree guards, or workflow profiles.
- Provider parsers accept only documented structured JSON/JSONL fields and fail closed to unavailable/null.
- Keep implementation inside existing reporter/runner files; add no new abstraction file.

## P1 Architecture Map

- `scripts/hook-dispatch-diet-report.ts` owns static route topology and synthetic phase probes.
- `scripts/run-skill-evals.ts` owns benchmark process execution, raw stdout/stderr artifacts, metadata, and Markdown summary.
- `src/cli/hook/runtime.ts` and `assets/hooks/post-tool-observer.sh` remain out of scope; their current evidence cannot prove live hook wall time.
- `docs/reference-configs/harness-overview.md` is the durable human entrypoint for the evidence authority and SLO definitions.

## P2 Concrete Trace

- Hook baseline: report CLI -> subprocess probe -> capture duration/stdout -> percentile/context calculation -> JSON report -> SLO booleans.
- Eval usage: benchmark profile -> Claude JSON or Codex JSONL -> raw stdout retained -> provider-specific structured parser -> nullable RunMetadata -> benchmark summary.
- Error path: malformed/missing structured usage -> agent exit/grader behavior remains unchanged -> usage authority unavailable -> missing fields null.

## P3 Decision Rationale

Extend the two existing evidence owners rather than create a telemetry subsystem. This preserves one source of truth, avoids adding overhead to every hook, and gives enough evidence to decide whether a later runtime instrumentation slice is justified. At 10x benchmark volume, synchronous agent execution remains the first pressure point; this slice does not alter concurrency.

## In Scope

- Add percentile, SessionStart context-size, token-estimate, authority, and SLO fields to the hook-diet report.
- Add structured Claude/Codex usage parsing and nullable cost metadata to skill evals.
- Add focused regression tests and durable SLO/evidence documentation.
- Update only the workflow artifacts required to execute and review this work-package.

## Out of Scope / Future Work

- Live per-route/per-script hook wall-time instrumentation.
- Guard repeat fingerprints, real time-to-first-edit, provider request/model-call count, native subagent count.
- A true host-isolated No Harness profile, Adaptive Lite, Standard, or Strict execution profiles.
- Explicit-first routing, context truncation, hook removal, Skill consolidation, install profiles, or effective-state resolver changes.

## File Changes

- `scripts/hook-dispatch-diet-report.ts`: additive cost distribution, SessionStart size estimate, runtime evidence authority, SLO result.
- `tests/hook-dispatch-diet-report.test.ts`: deterministic percentile/context/null-authority coverage.
- `scripts/run-skill-evals.ts`: structured provider parsers, nullable usage metadata, summary fields, skill-disabled label.
- `tests/run-skill-evals.test.ts`: Claude JSON, Codex JSONL, malformed/missing usage, preserved final-response and grader behavior.
- `docs/reference-configs/harness-overview.md`: evidence authority, metric semantics, and SLO thresholds.
- `assets/reference-configs/harness-overview.md`: byte-identical product-source projection required by the brain manifest.
- Current plan/contract/review/notes/current-status/handoff artifacts required by repo workflow.

## Verification

- `bun test tests/hook-dispatch-diet-report.test.ts tests/run-skill-evals.test.ts`
- `bun scripts/hook-dispatch-diet-report.ts --repo . --out /tmp/harness-cost-baseline.json --iterations 20 --baseline-ms 250 --json`
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `cmp docs/reference-configs/harness-overview.md assets/reference-configs/harness-overview.md`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts adopt --repo . --dry-run`

## Task Breakdown

- [x] Extend hook-diet cost distributions, SessionStart context estimate, explicit unavailable runtime evidence, SLO fields, and focused tests.
- [x] Add fail-closed structured Claude/Codex usage parsing, nullable cost metadata, summary output, and focused tests.
- [x] Document metric authority and SLO semantics in the existing harness overview.
- [ ] Run focused and required checks, complete reviewer evidence, and close workflow artifacts without merging unrelated main work.
