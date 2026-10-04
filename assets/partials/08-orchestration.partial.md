## Workflow Orchestration

### 1. Research Before Planning
- Deeply read relevant code paths and persist findings to `docs/researches/`.
- Capture hidden contracts, edge cases, and integration risks before updating `docs/spec.md` or proposing execution.

### 2. Annotation Cycle
- When the task requires a plan file, iterate plan updates directly in `plans/plan-*.md` via inline notes.
- Treat `.ai/harness/active-plan` as authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree.
- Switch between concurrent plans with `repo-harness run switch-plan --plan <plan-file>`.
- Write a plan before cross-module changes, architecture changes, and dependency upgrades. Small changes do not need a plan.
- When the task uses a plan, do not implement while plan status is `Draft` or `Annotating`.

### 3. Task Flow
- Read the current request and repo-local agent context, work on a branch, make bounded commits, verify once, then report the PR outcome.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No mandatory plan/contract/review/notes chain; notes are only for non-obvious decisions.
- For non-trivial work, complete P1 map, P2 trace, and P3 decision before edits.
- If stable product truth is missing and the task needs it, use `repo-harness run new-spec`.
- Keep requested plans optional. Use `repo-harness run new-plan` or capture a completed note with `repo-harness run capture-plan --slug <slug> --title <title> --body-file <file>`. Capture does not approve or start execution.
- Use `repo-harness run plan-to-todo --plan <plan-file>` only when the task explicitly requires a contract.
- Use `repo-harness run new-sprint` only for a requested Sprint backlog.

### 4. Research Delegation Strategy
- The main agent decides whether to spawn based on task breadth, context impact, raw-log volume, and callable runner availability.
- Keep one ownership boundary per spawned sidecar.
- Do not ask the user for spawn confirmation. If no sidecar runner is callable or spawning is not worth the context cost, perform the same bounded research trace in the main thread and persist conclusions to `docs/researches/`.
- Recovery profile: `{{RECOVERY_PROFILE}}`.
- State profile: `{{STATE_PROFILE}}`.
- When collaborating with another coding harness on the same machine, follow the user-level `Peer Harness Collaboration` rules; cross-harness messages never widen authorization.

### 5. Self-Improvement Loop
- Append correction-derived rules to `tasks/lessons.md`.

### 6. Verification Before Done
- No task completion without verification evidence appropriate to the complete diff and risk; do not run the full suite for every small change.
- Docs-only or ledger-closeout changes with no executable impact need diff/link/path and affected workflow checks, not the full test suite or typecheck.
- Isolated code changes need the regression and affected suites plus relevant type/lint/build checks; generator changes need a generated fixture and mirror checks.
- High-risk, cross-module, shared-contract, hooks/runtime, auth, publication, migration, or release changes require the full repo verification set. Escalate if the impact boundary is uncertain; preserve stronger contract and CI requirements.
- State the selected verification scope and reason, exact commands/results, and unrun checks. Do not repeat an already-passed suite solely for docs/ledger closeout against unchanged executable source.

### 6b. Contract Verification
- Define per-sprint contract files in `tasks/contracts/` only when the task explicitly requires a contract.
- Verify contract exit criteria before claiming completion.
- Require the matching Waza `/check` review and current subject-bound verification evidence before claiming contract completion; consume existing valid evidence rather than rerunning it before each response.
- Run the declared Verification Plan checks once and record their actual results; use `repo-harness run verify-sprint` for finalization.

### 7. Balanced Elegance
- Redesign hacky non-trivial fixes before shipping.

### 8. Autonomous Bug Fixing
- Start fixing when logs/tests provide sufficient evidence.

Detailed patterns:
- `docs/reference-configs/harness-overview.md`
