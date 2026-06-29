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

## Non-Goals

- `repo-harness` is not an agent gateway, product runtime, database service, or
  MCP server.
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
