# Product Spec

> **Status**: Approved
> **Owner**: repo-harness maintainers

## Product Outcome

`repo-harness` makes long-running AI engineering work reviewable and resumable
inside the repository while keeping unified workflow helper implementation in
the global package runtime. A maintainer should be able to hand Claude, Codex,
or a future agent an approved plan or sprint, let it work in an isolated branch
or worktree, and review completion from files: plan, contract, notes, checks,
trace, review, and handoff.

## Primary Users

- Maintainers adopting an existing repository that already has product code.
- Engineers running Claude/Codex sessions across multiple days, hosts, or
  worktrees.
- Reviewers who need a concise human review card plus machine evidence before
  accepting agent-authored changes.

An optional local MCP sidecar can expose the same file-backed workflow contract
to ChatGPT. Its default profiles remain workflow-scoped; a separate, user-owned
`coding` profile may directly edit and run Bash only for explicitly granted
repos.

## Non-Goals

- `repo-harness` is not a hosted agent gateway, hosted product runtime, or
  database service. The MCP sidecar remains a loopback local process behind an
  operator-managed tunnel.
- It does not replace the target repository's build, test, deploy, or release
  authority.
- It does not vendor unified helper scripts into downstream repositories; the
  canonical helper invocation is `repo-harness run <helper>`.
- It does not treat chat history, SQLite state, or hosted agent threads as the
  durable source of truth.

## Core Invariants

- Durable truth lives in repo files: `plans/`, `tasks/contracts/`,
  `tasks/reviews/`, `tasks/notes/`, `.ai/harness/checks/latest.json`,
  `.ai/harness/runs/*.json`, and `.ai/harness/handoff/`.
- Helper implementation is package-owned for adopted downstream repositories;
  root `scripts/` in this repository are self-hosted source/runtime only.
- `tasks/current.md` is a generated orientation snapshot, not a kanban board,
  live lock, or implementation gate.
- Agents may only widen scope by editing the active contract and leaving
  reviewable evidence.
- Contract verification, review recommendation, external acceptance or manual
  override, and latest trace evidence are required before closeout.
- Worktree isolation protects unrelated dirty state; agents must not absorb
  unrelated changes from the target tree.
- Direct coding MCP is default-off, user-scoped, OAuth profile/revision-bound,
  worktree-first, and explicit that local-user Bash is not a filesystem sandbox.

## Workflow Surfaces

| Surface | Owner | Purpose |
|---|---|---|
| `repo-harness run <helper>` | Package runtime | Canonical workflow helper execution |
| `docs/spec.md` | Maintainers | Stable product intent and safety boundary |
| `plans/prds/`, `plans/sprints/`, `plans/plan-*.md` | Planner | Decision-complete work packages |
| `tasks/contracts/*.contract.md` | Implementer | Allowed paths, delegation, and exit criteria |
| `tasks/reviews/*.review.md` | Evaluator | Human Review Card, evidence, risk, acceptance |
| `.ai/harness/checks/latest.json` | Verifier | Current structured gate result |
| `.ai/harness/runs/*.json` | Verifier | Immutable run/trace snapshots |
| `.ai/harness/handoff/` | Session owner | Resume packets and exact next step |
| `docs/reference-configs/ux-feature-guard.md`, `docs/reference-configs/design-options.md`, `.claude/templates/design-brief.template.md` | Conventions | Frontend behavior discipline: freeze rules and non-goals before implementation, product boundary before imagegen variants, taste-class refinement ceiling, role-aware visible-concept declaration; `frontend` task_profile contracts must cite a design brief, and the runtime `[UXFeatureGuard]` advisory fires only on frontend-scoped feature intent |

## Safety Boundaries

- Hook logic is a guardrail and context accelerator; it must not silently make
  product decisions, merge work, publish releases, or bypass review.
- External knowledge and memory are advisory. Current repo files and live check
  output override summaries.
- Delegated work remains parent-owned: explorer and verifier are read-only;
  worker edits are constrained to contract `allowed_paths`.

## Human Review Expectations

Human reviewers should start with the task review's `## Human Review Card`,
then inspect the active contract, changed files, latest trace, and failed or
skipped checks. A pass means the reviewer can see what changed, why it is in
scope, what verified it, what risk remains, and how to roll it back.

The card is a reading surface, not an acceptance authority. Closeout requires
canonical `## External Acceptance Advice` with `pass`, bound under Review Rubric
v2 to the normalized final-content review subject and current benchmark evidence.
Machine verification is bounded and consumes frozen evidence; it must not launch
providers, adoption, substantive installation, or benchmark production.

## Acceptance Scenarios

- An existing repo can adopt the harness, generate workflow files, and pass
  `repo-harness run check-task-workflow --strict`.
- A standard downstream adopt or migration does not create repo-local
  repo-harness helper scripts under `scripts/` or `.ai/harness/scripts/`.
- A sprint row can expand into a plan, contract, notes, review, latest trace,
  and handoff without relying on previous chat.
- A fresh agent session can read source artifacts first and resume from the
  exact next step.
- A maintainer can reject or accept an agent change from the Human Review Card
  plus machine evidence.

## Canonical Terms

- **Plan (work-package)**: A decision-complete `plans/plan-*.md` document
  promoted to work-package level because it needs its own merge, rollback, or
  verification boundary, rather than staying a checklist row in a sprint
  backlog or active plan.
- **Task contract**: The authoritative delegation brief in
  `tasks/contracts/*.contract.md` that fixes allowed paths, exit criteria, and
  scope for one execution slice; an implementer works from the contract, not
  from surrounding chat history.
- **Workstream**: A durable, capability-scoped progress record under
  `tasks/workstreams/<domain>/<capability>/` that carries status across
  sessions and plans instead of living only in chat memory.
- **Capability**: A functional block registered in
  `.ai/context/capabilities.json` and resolved by longest-prefix path match,
  owning local agent context and ownership boundaries for the files under it.
- **Task profile**: The declared execution shape of a contract (for example
  `code-change`) that determines which verification and delegation rules
  apply to that task.
