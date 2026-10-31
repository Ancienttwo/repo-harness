# Document Generation

Generated repos use a minimal documentation profile by default.

## Required

- `docs/spec.md`: stable product or operator outcome.
- `docs/architecture/index.md`: umbrella architecture ledger and diagram links.
- `tasks/lessons.md`: the one local task document. Issue/PR owns current and deferred work.
- `.ai/harness/`: workflow policy, checks, handoff, failures, and run state.

## On Demand

Create these only when the agent has concrete repo evidence or the user asks:

- `docs/brief.md`: product positioning and user scope.
- `docs/tech-stack.md`: confirmed runtime, framework, and dependency choices.
- `docs/decisions.md`: accepted architecture decisions with trade-offs.
- Mermaid fenced blocks in `docs/architecture/modules/**.md`: semantic diagram source for agents and review diffs.
- `docs/packages.md`: package inventory for real multi-package repos.
- `docs/prds/*.prd.md`: upper-layer PRDs generated through `repo-harness-product`'s PRD mode from `docs/prds/prd.template.md`.
- `docs/prds/DESIGN-*.md`: optional design briefs generated from `.claude/templates/design-brief.template.md` when the task requests design work.

## Rules

- Do not create empty business docs as placeholders.
- Do not create root `specs/`; use `docs/spec.md` for stable product intent, `interfaces/` for machine-consumed runtime boundaries, and tests for executable behavior.
- Do not duplicate workflow rules already indexed in `docs/reference-configs/`.
- Prefer short docs that name sources, owners, and verification commands.
- Write human-facing documents (`docs/`, `docs/prds/`, design briefs) in the language set by `.ai/harness/policy.json#documentation.language`; keep section headers, field keys, and technical terms in English. Agent-facing artifacts stay English.
- Keep task scope, changes, checks, risk and rollback in the PR description. Local plan, contract, review and notes files are not workflow artifacts.
- Let capability `CLAUDE.md` and `AGENTS.md` carry local contract projections; root docs stay concise.
- Keep deferred work in the GitHub issue. Do not create local todo or workstream ledgers.
- Keep onboarding docs split by reader: agents read the issue, PR and active source artifacts first; humans review the PR description, diff, latest trace and rollback first.
- `.archcontext/model/` owns architecture boundaries. Agents change the model, semantic decisions and human-written sections. The archctx rolling writer publishes generated regions and diagrams. Do not apply and commit generated output in feature PRs.
- archctx-generated Markdown Mermaid is the model's generated diagram; do not hand-write diagrams or standalone HTML. The `repo-harness-archimap` skill owns the human-facing map `docs/architecture/archimap.html`.
- Treat `mermaid` as an external authoring/review skill at `~/.codex/skills/mermaid`; do not copy or inline its assets into generated repos.
