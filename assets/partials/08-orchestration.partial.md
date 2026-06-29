## Workflow Orchestration

### 1. Research Before Planning
- Deeply read relevant code paths and persist findings to `docs/researches/`.
- Capture hidden contracts, edge cases, and integration risks before updating `docs/spec.md` or proposing execution.

### 2. Annotation Cycle
- Iterate plan updates directly in `plans/plan-*.md` via inline notes.
- Treat `.ai/harness/active-plan` as authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition.
- Switch between concurrent plans with `repo-harness run switch-plan --plan <plan-file>`.
- Fill the plan/contract workflow inventory before implementation.
- Do not implement while plan status is `Draft` or `Annotating`.

### 3. Plan Node Default
- Enter plan mode for non-trivial tasks.
- If no stable product truth exists, run `repo-harness run new-spec`.
- When Codex Plan mode or Waza `/think` reaches a decision-complete work-package plan, capture it with `repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason <merge_boundary|rollback_boundary|verification_boundary|risk_boundary|human_decision_boundary|worktree_boundary>` and the plan text on stdin.
- When the output is only the next checklist row for the current active plan, capture it with `repo-harness run capture-plan --artifact-level checklist-row --slug <slug> --title <title>` so the row stays in `## Task Breakdown`.
- If no captured active execution plan exists, run `repo-harness run new-plan --slug <slug> --title <title>` or capture a finished planning note with `repo-harness run capture-plan`.
- If the user asks for a Sprint backlog, run `repo-harness run new-sprint --slug <slug> --title <title>`; it writes `plans/sprints/*.sprint.md`, not `plans/plan-*.md`.
- When the user approves implementation, run `repo-harness run plan-to-todo --plan <active-plan>` or capture the approved work-package plan with `--artifact-level work-package --promotion-reason <reason> --status Approved --execute`; this creates contract/review/notes scaffolding and leaves plan tasks in `## Task Breakdown`.
- Promote work into a top-level plan only when `Artifact Level: work-package` and the Promotion Gate are concrete: merge/PR unit, rollback surface, verification boundary, review/acceptance boundary, high-risk surface, and why it cannot stay a checklist row. Inline sprint rows stay in the sprint backlog or active plan `## Task Breakdown`.
- Re-plan when execution drifts.

### 4. Research Delegation Strategy
- The main agent decides whether to spawn based on task breadth, context impact, raw-log volume, and callable runner availability.
- Keep one ownership boundary per spawned sidecar.
- Do not ask the user for spawn confirmation. If no sidecar runner is callable or spawning is not worth the context cost, perform the same bounded research trace in the main thread and persist conclusions to `docs/researches/`.
- Recovery profile: `{{RECOVERY_PROFILE}}`.
- State profile: `{{STATE_PROFILE}}`.

### 5. Self-Improvement Loop
- Append correction-derived rules to `tasks/lessons.md`.

### 6. Verification Before Done
- No task completion without test/build evidence.

### 6b. Contract Verification
- Define per-sprint contract files in `tasks/contracts/`.
- Verify contract exit criteria before claiming completion.
- Require Waza `/check` to produce the matching evaluator review before any done/completed response.
- Use `repo-harness run verify-contract --contract tasks/contracts/{plan-stem}.contract.md --strict`.

### 7. Balanced Elegance
- Redesign hacky non-trivial fixes before shipping.

### 8. Autonomous Bug Fixing
- Start fixing when logs/tests provide sufficient evidence.

Detailed patterns:
- `docs/reference-configs/harness-overview.md`
