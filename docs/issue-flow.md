# Issue flow

Every durable fact has one home. Do not add a second place for the same fact.

| Fact | Home | Lifecycle |
| --- | --- | --- |
| Task identity, claim, dependencies and status | GitHub issue and PR | Open, claim, implement and close in the issue/PR loop. |
| Proof | PR description, PR checks and CI | Record the exact commands, results, revision and risk in the PR. |
| Product intent | `docs/prds/*.prd.md` | Keep PRDs as product intent. A PRD does not own task state or approval. |
| Design brief | `docs/prds/DESIGN-*.md` | Write one only when the task requests design work. It does not gate ordinary work. |
| Architecture boundary | `.archcontext/model/` and `docs/architecture/` | Update the model only for a real responsibility change. |
| Research | `docs/researches/` | Keep durable findings and runtime evidence here. |
| Lesson | `tasks/lessons.md` | Read active lessons at session start. Keep correction rules here. |
| Session recovery | `.ai/harness/handoff/` | Restore a session. This is not task state. |
| Release history | `docs/CHANGELOG.md` | Record shipped releases only. |

## Rules

- Use the `repo-harness-issue-flow` skill (`assets/skills/repo-harness-issue-flow/SKILL.md`) to order issues and run the issue/PR loop.
- Do not create or read `plans/`, sprints, contracts, notes, reviews, todos, workstreams or `tasks/current.md`. Only `tasks/lessons.md` stays.
- Ordinary tasks use the PR description: goal, scope, changes, verification, risk and rollback. No plan, contract, review, notes or approval artifact is mandatory.
- Record a one-time decision in the issue as a `repo-harness decision` comment. Record runtime evidence in `docs/researches/`.
- Create a task worktree with `repo-harness run contract-worktree start --issue <number>`. Keep it at `/tmp/<repo>-wt-<slug>`.
- Keep `docs/CHANGELOG.md` as history. Do not rewrite it.
