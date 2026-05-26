## Workflow Orchestration

### 1. Research Before Planning
- Deeply inspect relevant code and persist findings in `tasks/research.md`.
- Avoid implementation before research, spec, plan, and contract are complete.

### 2. Annotation Cycle
- Keep active plans in `plans/plan-*.md` and iterate with inline notes.
- Treat the latest non-archived plan file as the active plan.
- Resolve annotations before implementation.

### 3. Plan Node Default
- Enter plan mode for non-trivial tasks.
- If `docs/spec.md` is missing, run `bash scripts/new-spec.sh` first.
- If no active plan exists, run `bash scripts/new-sprint.sh --slug <slug> --title <title>` before implementation.
- Keep active checklist items in `tasks/todo.md`.

### 4. Research Delegation Strategy
- The main agent decides whether to spawn based on task breadth, context impact, raw-log volume, and callable runner availability.
- Parallelize only non-dependent paths.
- Do not ask the user for spawn confirmation. If no sidecar runner is callable or spawning is not worth the context cost, do the same bounded trace in the main thread and write conclusions to `tasks/research.md`.

### 4b. Context Budget
- Treat auto-compact as an unreliable fallback.
- At orange/red context pressure, refresh `.ai/harness/handoff/current.md` and `.ai/harness/handoff/resume.md`, then resume from a fresh session.

### 5. Self-Improvement Loop
- After correction, append prevention rule to `tasks/lessons.md`.

### 6. Verification Before Done
- No completion without verification evidence.

### 6b. Contract Verification
- Use task contracts in `tasks/contracts/` as completion gates.
- Use implementation notes in `tasks/notes/` for task-local decisions that should not automatically become memory.
- Validate exit criteria and review recommendation before any done/completed response.

### 7. Balanced Elegance
- Redesign hacky non-trivial fixes before shipping.

### 8. Autonomous Bug Fixing
- Start fixes when logs/errors/tests are sufficient.

---
