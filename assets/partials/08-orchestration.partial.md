## Workflow Orchestration

### 1. Research Before Planning
- Deeply read relevant code paths and persist findings to `tasks/research.md`.
- Capture hidden contracts, edge cases, and integration risks before updating `docs/spec.md` or proposing execution.

### 2. Annotation Cycle
- Iterate plan updates directly in `plans/plan-*.md` via inline notes.
- Treat `.claude/.active-plan` as authoritative when present; latest non-archived `plans/plan-*.md` is a compatibility fallback only.
- Switch between concurrent plans with `bash scripts/switch-plan.sh --plan <plan-file>`.
- Fill the plan/contract workflow inventory before implementation.
- Do not implement while plan status is `Draft` or `Annotating`.

### 3. Plan Node Default
- Enter plan mode for non-trivial tasks.
- If no stable product truth exists, run `bash scripts/new-spec.sh`.
- When Codex Plan mode or Waza `/think` reaches a decision-complete plan, capture it with `bash scripts/capture-plan.sh --slug <slug> --title <title>` and the plan text on stdin.
- If no captured active plan exists, run `bash scripts/new-sprint.sh --slug <slug> --title <title>`.
- When the user approves implementation, run `bash scripts/plan-to-todo.sh --plan <active-plan>` or capture the approved plan with `--status Approved --execute`.
- Re-plan when execution drifts.

### 4. Research Delegation Strategy
- The main agent decides whether to spawn based on task breadth, context impact, raw-log volume, and callable runner availability.
- Keep one ownership boundary per spawned sidecar.
- Do not ask the user for spawn confirmation. If no sidecar runner is callable or spawning is not worth the context cost, perform the same bounded research trace in the main thread and persist conclusions to `tasks/research.md`.
- Recovery profile: `{{RECOVERY_PROFILE}}`.
- State profile: `{{STATE_PROFILE}}`.

### 5. Self-Improvement Loop
- Append correction-derived rules to `tasks/lessons.md`.

### 6. Verification Before Done
- No task completion without test/build evidence.

### 6b. Contract Verification
- Define per-sprint contract files in `tasks/contracts/`.
- Verify contract exit criteria before claiming completion.
- Require a matching evaluator review before any done/completed response.
- Use `scripts/verify-contract.sh --contract tasks/contracts/{slug}.contract.md --strict`.

### 7. Balanced Elegance
- Redesign hacky non-trivial fixes before shipping.

### 8. Autonomous Bug Fixing
- Start fixing when logs/tests provide sufficient evidence.

Detailed patterns:
- `docs/reference-configs/harness-overview.md`
