### Plan Annotation Protocol

Use `docs/researches/` for deep codebase understanding, `docs/spec.md` for stable intent, `plans/` for timestamped execution plans, and `tasks/todos.md` for deferred medium/long-term goals with tradeoffs and revisit triggers.

```yaml
PLAN_LOOP:
  MODE: {{RUNTIME_PROFILE}}
  RECOVERY: {{RECOVERY_PROFILE}}
  STATE: {{STATE_PROFILE}}
  CONTEXT: {{CONTEXT_PROFILE}}
  PHASES: research -> spec -> plan -> contract -> implement -> verify -> check -> review -> handoff
  RESEARCH_DIR: docs/researches/
  SPEC_FILE: docs/spec.md
  PLAN_DIR: plans/
  PLAN_ARCHIVE: plans/archive/
  ACTIVE_PLAN_RULE: .ai/harness/active-plan marker is scoped to this worktree; .ai/harness/active-worktree records the owner
  PLAN_SWITCH: repo-harness run switch-plan --plan <plan-file> | --list
  DEFERRED_LEDGER: tasks/todos.md
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
  CONTRACT_WORKTREE_FINISH: run Waza /check, fill the review artifact from that verdict, then repo-harness run contract-worktree finish
  COMMIT_POLICY: explicit commits after green checks; no automatic checkpoint hook
```

### Agentic Skill Routing

- Product discovery, early demand shaping, complex engineering plans, architecture lock-in, cross-module refactors, and UI/UX or design-system plans -> parent agent. Invoke `geju` before a contract exists to open the frame, then complete P1/P2/P3 with the parent agent's own capabilities and freeze the accepted direction into the plan and contract.
- Small or medium feature plans -> Waza `/think`.
- Bugs, regressions, crashes, errors, or failing tests -> Waza `/hunt`.
- Implemented diffs, pre-merge checks, or release follow-through -> Waza `/check`.
- Architecture diagrams or system-flow diagrams -> Markdown Mermaid first, `mermaid` for optional human HTML.
- Use P1/P2/P3 as the shared due-diligence protocol; report it explicitly for complex engineering or architecture planning, `/hunt`, risky refactors, deployments, auth/payment/data work, and shared contracts.
- Hooks may emit advisory Waza `/check` and `/health` route hints, but must not auto-run skills or vendor skill bodies.

### Task Management Protocol

Core rules (canonical source: see Workflow Orchestration section below):
- `docs/spec.md` is product truth; `plans/` is execution truth.
- `tasks/contracts/`, `tasks/reviews/`, and `tasks/notes/` are done gates; hooks are accelerators only.
- Treat `.ai/harness/active-plan` as authoritative only for its owning worktree; `.ai/harness/active-worktree` records that owner.
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
- Use `repo-harness run factor-lab-new --name <slug>` to create a candidate workspace when that optional helper is present in the global package.
- Use `repo-harness run factor-lab-promote --name <slug>` only after `hypothesis.md` and `backtest-summary.md` exist.
- Use `repo-harness run factor-lab-reject --name <slug> --reason "<reason>"` to reject a candidate with an auditable reason.
- Use `repo-harness run factor-lab-check` to validate registry state, candidate completeness, and promoted directory drift.
{{/IF}}
