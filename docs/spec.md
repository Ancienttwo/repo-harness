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

The same authority model may support persistent logical Module Engineers. The
engineer is a repo-defined role with a reviewed SOP and repo-grounded knowledge;
a Codex App Thread or tmux CLI Agent is only its replaceable runtime binding,
while native Subagents remain bounded workers under one canonical task claim.

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
- Hooks remain fail-open observers. The prepare-acceptance gate recomputes a
  policy-base-bound Change Assessment packet over final content; it selects
  high-risk paths and required executable oracles without making Hook journals
  or model judgments into authority. Each risk reason must have an allowed
  oracle covering every selected path or `*`. AcceptanceReceipt remains the
  sole merge authority by recomputing and binding that packet in canonical
  verification evidence.
- Worktree isolation protects unrelated dirty state; agents must not absorb
  unrelated changes from the target tree.
- Direct coding MCP is default-off, user-scoped, OAuth profile/revision-bound,
  worktree-first, and explicit that local-user Bash is not a filesystem sandbox.
- Continuation surfaces are non-authoritative: the continuation envelope is a
  read-only projection of effective state plus the sprint marker, the closeout
  journal records operation progress for explicit recovery only (never workflow
  state, never read by state resolution), and attempt receipts are liveness
  evidence that never enter effective state or `progress_token`.
- Agent Runtime effects are provider-neutral, at-most-once control-plane effects.
  An adapter receives only a bounded inbox-control reference after intent and
  `effect_started` are durable; only the exact persisted Task or Module Inbox
  receipt proves delivery, and every ambiguous outcome requires reconciliation
  without an automatic retry.

## Workflow Surfaces

| Surface | Owner | Purpose |
|---|---|---|
| `repo-harness run <helper>` | Package runtime | Canonical workflow helper execution |
| `repo-harness state next --json` | Package runtime | Canonical pull-based continuation entry: a read-only projection returning one unit or one halt per tick, byte-identical for identical repo bytes and identical attempt-ledger bytes |
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
- Collaboration remains an untrusted knowledge plane: signals, context packets
  and handoff adoption cannot acquire a Claim, move a Lease, publish or accept.
  The C9 live gate keeps one writer, records exact provider JSONL usage, and
  requires repeated evidence before any persistent same-capability seat can be
  proposed.
- A Module Engineer binding is shared git-common-dir authorization state for
  engineer-scoped commands only. It cannot create, transfer, or replace task
  Lease, Publication, Acceptance, or merge authority.
- Engineer binding transitions publish an immutable idempotency-fenced event
  before CAS-replacing the sole current pointer. Dangling events remain audit
  evidence only; retries cannot select by time, change payload under one key,
  or fabricate current state after a crash.
- Engineer identity is derived by an authenticated runtime boundary; an LLM may
  not gain authority by supplying `engineer_id` or binding generation as command
  arguments.
- One claimed worktree has at most one writer actor, including the parent
  Engineer itself. A writable delegated worker must hold an independently
  enforced child grant and settle it before publication. Writable delegation
  is available only when a Worker Host controls both Parent and child mutation
  capability; unmanaged Provider Sessions remain read-only.
- Parent freeze, Worker activation, settlement, and Parent restoration are
  separate crash-recoverable writer-slot states. Transitional or unverifiable
  states admit no mutation or publication and never silently restore a writer.
- Provider threads, transcripts, auto memory, and context summaries are caches.
  Durable module knowledge remains in architecture, research, lessons,
  workstreams, and task-local notes, with any engineer memory kept as a
  rebuildable index.
- Agent Runtime adapters are a closed set (`codex-app-thread`,
  `tmux-cli-agent`). They cannot create endpoints, carry message bodies, execute
  generic tmux commands, infer receipt state, or change Task, Lease,
  Collaboration, Publication, Acceptance, or Fleet column authority.

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

Before semantic review, reviewers use the prepared `ReviewSelectionPacket` to
focus on selected paths, the closed reason set, and declared test/readback oracles.
The packet is bound to the exact final subject and policy target revision; a
reviewer disagreement may escalate it but cannot weaken it. The overlay takes
effect only after a fresh `verify-sprint --prepare-acceptance` rebinds it into
canonical evidence; a stale prepared packet cannot finalize. `pattern_novelty`
is driven only by abstraction-shaped additions relative to the policy base.
Release runtime
readback is recorded separately as `RuntimeEvidenceReceipt`, never as a task
AcceptanceReceipt field.

## Acceptance Scenarios

- An existing repo can adopt the harness, generate workflow files, and pass
  `repo-harness run check-task-workflow --strict`.
- A standard downstream init or migration does not create repo-local
  repo-harness helper scripts under `scripts/` or `.ai/harness/scripts/`.
- A sprint row can expand into a plan, contract, notes, review, latest trace,
  and handoff without relying on previous chat.
- A fresh agent session can read source artifacts first and resume from the
  exact next step.
- A maintainer can reject or accept an agent change from the Human Review Card
  plus machine evidence.
- A host loop can drive an approved sprint to completion using only
  `repo-harness state next` output; an interrupted closeout is recoverable
  explicitly without duplicating push or merge; two consecutive no-progress
  turns halt the loop instead of spinning.

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
- **Capability**: A functional block registered in the capability authority
  selected by `.ai/harness/policy.json#context.capability_source` and resolved
  by longest-prefix path match, owning local agent context and ownership
  boundaries for the files under it.
- **Module Engineer**: A stable logical engineering role that references one
  canonical capability and a reviewed SOP. It is not a Session, task owner,
  Lease, or acceptance identity.
- **Engineer binding**: The current shared, generation-fenced association between
  a Module Engineer and one Agent runtime endpoint. Its contract revision covers
  the canonical Profile bytes, SOP bytes, and capability revision. It authorizes
  only explicitly engineer-scoped runtime commands issued through a trusted
  principal boundary.
- **Agent Runtime effect**: An immutable V2 intent and observation chain that
  fences one persisted inbox message to one current endpoint and admits at most
  one closed `notify_inbox` Host action. Reachability and delivery are read-model
  facts, never scheduling or acceptance authority.
- **Delegated worker grant**: A non-transferable child mutation permit under one
  current task claim and one exclusive worktree writer slot. It is not a second
  task Lease and cannot authorize publication or acceptance.
- **Task profile**: The declared execution shape of a contract (for example
  `code-change`) that determines which verification and delegation rules
  apply to that task.
- **Refactor Mode**: The `off | shadow | active` operating mode under which
  repo-harness consumes an external structural authority to discover and
  execute refactors. It is a narrowed entry into the existing plan, contract,
  worktree, and ship flow, never a second workflow engine.
- **Proposal Author**: The repo-harness-side agent or human that writes a
  refactor proposal for the external structural authority to assess. The
  author supplies intent, scope, target outcomes, and kill list; it never
  decides the structural scale, the workflow route, or a recommendation's
  status.
- **RefactorWorkflowRoute**: The repo-harness workflow routing decision
  deterministically projected from the external authority's structural scale
  and its evidence reason codes. It may stop more conservatively than the
  upstream scale but may never route below it.
- **Refactor Program**: One authorized Refactor Mode run, holding only the
  bindings from external recommendations to local work packages. It carries no
  recommendation status; every status is re-read from the external authority.
- **Cutover Closure**: The provider-independent gate asserting that every
  declared old implementation, caller, fallback, test, document, and
  compatibility window of a replaced surface has an explicit disposition, and
  that nothing declared removed still exists at the candidate head.
- **Refactor Execution Binding**: The append-only, immutable set of references
  tying one external recommendation to the plan, contract, closure,
  acceptance, and merge evidence of one execution. It has no status field, so
  a merged pull request can never by itself mean the refactor is resolved.
- **Joined Refactor Board**: The read-only projection joining the external
  semantic refactor ledger with local execution evidence. It owns no state and
  is fully rebuildable from its authorities.
