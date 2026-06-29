## Workflow Orchestration

### 1. Research Before Planning
- Deeply inspect relevant code and persist findings in `docs/researches/`.
- Avoid implementation before research, spec, plan, and contract are complete.

### 2. Annotation Cycle
- Keep active plans in `plans/plan-*.md` and iterate with inline notes.
- Treat `.ai/harness/active-plan` as authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition.
- Resolve annotations before implementation.

### 3. Plan Node Default
- Enter plan mode for non-trivial tasks.
- If `docs/spec.md` is missing, run `repo-harness run new-spec` first.
- Capture decision-complete work-package output from Codex Plan mode or Waza `/think` with `repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason <merge_boundary|rollback_boundary|verification_boundary|risk_boundary|human_decision_boundary|worktree_boundary>`; if no captured active execution plan exists, use `repo-harness run new-plan`; after approval, run `repo-harness run plan-to-todo` or capture with `--artifact-level work-package --promotion-reason <reason> --status Approved --execute`.
- Use `new-sprint.sh` only for Sprint backlogs; it writes `plans/sprints/*.sprint.md`, while PRDs stay in `plans/prds/`.
- Keep active checklist items in the active plan's `## Task Breakdown`; record only deferred goals in `tasks/todos.md`.

### 4. Research Delegation Strategy
- The main agent decides whether to spawn based on task breadth, context impact, raw-log volume, and callable runner availability.
- Parallelize only non-dependent paths.
- Do not ask the user for spawn confirmation. If no sidecar runner is callable or spawning is not worth the context cost, do the same bounded trace in the main thread and write conclusions to `docs/researches/`.

### 4b. Durable Handoff
- Treat auto-compact as an unreliable fallback.
- Before switching sessions or worktrees, refresh `.ai/harness/handoff/current.md` and `.ai/harness/handoff/resume.md`, then resume from the filesystem artifacts.

### 5. Self-Improvement Loop
- After correction, append prevention rule to `tasks/lessons.md`.

### 6. Verification Before Done
- No completion without verification evidence.

### 6b. Contract Verification
- Use task contracts in `tasks/contracts/` as completion gates.
- Use implementation notes in `tasks/notes/` for task-local decisions that should not automatically become memory.
- Validate exit criteria and the Waza `/check` review recommendation before any done/completed response.

### 7. Balanced Elegance
- Redesign hacky non-trivial fixes before shipping.

### 8. Autonomous Bug Fixing
- Start fixes when logs/errors/tests are sufficient.

---
