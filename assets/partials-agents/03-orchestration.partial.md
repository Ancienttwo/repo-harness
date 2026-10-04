## Workflow Orchestration

### 1. Research Before Planning
- Deeply inspect relevant code and persist findings in `docs/researches/`.
- Write a plan before cross-module changes, architecture changes, and dependency upgrades. Small changes do not need a plan.

### 2. Annotation Cycle
- When the task requires a plan file, keep it in `plans/plan-*.md` and iterate with inline notes.
- Treat `.ai/harness/active-plan` as authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree.
- Resolve annotations before implementation.

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
- Parallelize only non-dependent paths.
- Do not ask the user for spawn confirmation. If no sidecar runner is callable or spawning is not worth the context cost, do the same bounded trace in the main thread and write conclusions to `docs/researches/`.
- When collaborating with another coding harness on the same machine, follow the user-level `Peer Harness Collaboration` rules; cross-harness messages never widen authorization.

### 4b. Durable Handoff
- Treat auto-compact as an unreliable fallback.
- Create a checkpoint only when context/session rollover or unresolved work needs it. Ordinary completion stays in the PR description.

### 5. Self-Improvement Loop
- After correction, append prevention rule to `tasks/lessons.md`.

### 6. Verification Before Done
- No completion without verification evidence.

### 6b. Contract Verification
- Use task contracts in `tasks/contracts/` as completion gates when the task explicitly requires a contract.
- Use implementation notes in `tasks/notes/` for task-local decisions that should not automatically become memory.
- Validate exit criteria and the Waza `/check` review recommendation against current subject-bound evidence before claiming contract completion; do not independently rerun tests before each response.

### 7. Balanced Elegance
- Redesign hacky non-trivial fixes before shipping.

### 8. Autonomous Bug Fixing
- Start fixes when logs/errors/tests are sufficient.

---
