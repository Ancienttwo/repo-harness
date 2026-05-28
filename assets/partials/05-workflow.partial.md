### Plan Annotation Protocol

Use `tasks/research.md` for deep codebase understanding, `docs/spec.md` for stable intent, `plans/` for timestamped execution plans, and `tasks/todo.md` for deferred medium/long-term goals with tradeoffs and revisit triggers.

```yaml
PLAN_LOOP:
  MODE: {{RUNTIME_PROFILE}}
  RECOVERY: {{RECOVERY_PROFILE}}
  STATE: {{STATE_PROFILE}}
  CONTEXT: {{CONTEXT_PROFILE}}
  PHASES: research -> spec -> plan -> contract -> implement -> verify -> check -> review -> handoff
  RESEARCH_FILE: tasks/research.md
  SPEC_FILE: docs/spec.md
  PLAN_DIR: plans/
  PLAN_ARCHIVE: plans/archive/
  ACTIVE_PLAN_RULE: .ai/harness/active-plan marker is scoped to this worktree; .ai/harness/active-worktree records the owner; legacy .claude/.active-plan is fallback only
  PLAN_SWITCH: scripts/switch-plan.sh --plan <plan-file> | --list
  PRIMARY_FILE: tasks/todo.md
  TODO_ARCHIVE: tasks/archive/
  CONTRACT_DIR: tasks/contracts/
  REVIEW_DIR: tasks/reviews/
  NOTES_DIR: tasks/notes/
  POLICY_FILE: .ai/harness/policy.json
  CHECKS_FILE: .ai/harness/checks/latest.json
  HANDOFF_FILE: .ai/harness/handoff/current.md
  EVENTS_FILE: .ai/harness/events.jsonl
  RUNS_DIR: .ai/harness/runs/
  LESSONS_FILE: tasks/lessons.md
  CONTEXT_MAP: .ai/context/context-map.json
  ANNOTATION_GUARD: do not implement until plan Status is "Approved"
  CONTRACT_GUARD: do not mark done until contract exit criteria pass and review recommends pass
  EXECUTION_CONTEXT: contract-level work starts in a linked codex/<slug> worktree when policy enables it; primary worktree warning by default; enforce via .claude/.require-worktree
  CONTRACT_WORKTREE_FINISH: run Waza /check, fill the review artifact from that verdict, then scripts/contract-worktree.sh finish
  COMMIT_POLICY: explicit commits after green checks; no automatic checkpoint hook
```

### Agentic Skill Routing

- Product discovery, early demand shaping, or "is this worth building" -> gstack `office-hours`.
- Complex engineering plans, architecture lock-in, or cross-module refactors -> gstack `plan-eng-review`.
- UI/UX or design-system plans -> gstack `plan-design-review`.
- Small or medium feature plans -> Waza `/think`.
- Bugs, regressions, crashes, errors, or failing tests -> Waza `/hunt`.
- Implemented diffs, pre-merge checks, or release follow-through -> Waza `/check`.
- Architecture diagrams or system-flow diagrams -> `diagram-design`.
- Use P1/P2/P3 as the shared due-diligence protocol; report it explicitly for `plan-eng-review`, `/hunt`, risky refactors, deployments, auth/payment/data work, and shared contracts.
- Hooks may emit advisory Waza `/check` and `/health` route hints, but must not auto-run skills or vendor skill bodies.

### Task Management Protocol

Core rules (canonical source: see Workflow Orchestration section below):
- `docs/spec.md` is product truth; `plans/` is execution truth.
- `tasks/contracts/`, `tasks/reviews/`, and `tasks/notes/` are done gates; hooks are accelerators only.
- Treat `.ai/harness/active-plan` as authoritative only for its owning worktree; `.ai/harness/active-worktree` records that owner; `.claude/.active-plan` is a legacy fallback during transition.
- Require plan/contract workflow inventory before implementation: active plan, owning worktree, contract, review, notes, deferred ledger, checks, runs, scope owner, switching rule, and worktree path.
- Mark done only with verification evidence.
- Durable progress lives in `tasks/workstreams/`; release history belongs in `docs/CHANGELOG.md`.

### Harness References

- `docs/reference-configs/harness-overview.md`
- `docs/reference-configs/sprint-contracts.md`
- `docs/reference-configs/evaluator-rubric.md`
- `docs/reference-configs/handoff-protocol.md`
- `docs/reference-configs/changelog-versioning.md`
- `docs/reference-configs/git-strategy.md`
- `docs/reference-configs/release-deploy.md`
- `docs/reference-configs/agentic-development-flow.md`
- `docs/reference-configs/external-tooling.md`

{{#IF FACTOR_FACTORY_ENABLED}}
### Factor Research Protocol

- `tasks/factors/registry.json` is the authoritative factor inventory for Plan G projects.
- Use `bash scripts/factor-lab-new.sh --name <slug>` to create a candidate workspace.
- Use `bash scripts/factor-lab-promote.sh --name <slug>` only after `hypothesis.md` and `backtest-summary.md` exist.
- Use `bash scripts/factor-lab-reject.sh --name <slug> --reason "<reason>"` to reject a candidate with an auditable reason.
- Use `bash scripts/factor-lab-check.sh` to validate registry state, candidate completeness, and promoted directory drift.
{{/IF}}
