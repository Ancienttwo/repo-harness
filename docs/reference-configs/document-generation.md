# Document Generation

Generated repos use a minimal documentation profile by default.

## Required

- `docs/spec.md`: stable product or operator outcome.
- `docs/architecture/index.md`: umbrella architecture ledger, pending drift requests, snapshots, and diagram links.
- `tasks/`: execution, lessons, research, contracts, and reviews.
- `tasks/workstreams/`: durable capability workstream ledgers; `tasks/todos.md` is only the deferred-goal ledger.
- `.ai/harness/`: workflow policy, checks, handoff, failures, and run state.

## On Demand

Create these only when the agent has concrete repo evidence or the user asks:

- `docs/brief.md`: product positioning and user scope.
- `docs/tech-stack.md`: confirmed runtime, framework, and dependency choices.
- `docs/decisions.md`: accepted architecture decisions with trade-offs.
- `docs/architecture/snapshots/*.md`: current module boundaries and data flow for architecture-sensitive changes.
- Mermaid fenced blocks in `docs/architecture/modules/**.md` or `docs/architecture/snapshots/*.md`: semantic diagram source for agents and review diffs.
- `docs/architecture/diagrams/*.html`: optional human-readable `mermaid` renderings produced when a visual is clearer than prose.
- `docs/packages.md`: package inventory for real multi-package repos.
- `plans/prds/*.prd.md`: upper-layer PRDs generated through `repo-harness-prd` from `.claude/templates/prd.template.md`; keep Sprint backlogs in `plans/sprints/`.

## Rules

- Do not create empty business docs as placeholders.
- Do not create root `specs/`; use `docs/spec.md` for stable product intent, `interfaces/` for machine-consumed runtime boundaries, and tests for executable behavior.
- Do not duplicate workflow rules already indexed in `docs/reference-configs/`.
- Prefer short docs that name sources, owners, and verification commands.
- Let capability `CLAUDE.md` and `AGENTS.md` carry local contract projections; root docs stay concise.
- Keep complete workstream TODOs in `tasks/workstreams/<domain>/<capability>/`; contract blocks should link to them instead of becoming task logs.
- Keep onboarding docs split by reader: agents read active source artifacts first; humans review the Human Review Card, diff, latest trace, and rollback first.
- Hooks may create `docs/architecture/requests/*.md`; agents own semantic snapshots, embedded Mermaid, and optional `mermaid` HTML output.
- Archive handled architecture requests with `.ai/harness/scripts/archive-architecture-request.sh`; keep `docs/architecture/requests/` pending-only and preserve handled requests under `docs/architecture/requests/archive/YYYY/`.
- When both Mermaid and HTML exist, keep the Mermaid in Markdown as the semantic source and make the HTML link back to that Markdown source.
- Treat `mermaid` as an external installed skill dependency at `~/.codex/skills/mermaid`; do not copy or inline its assets into generated repos.
