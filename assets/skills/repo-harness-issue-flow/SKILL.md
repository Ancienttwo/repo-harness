---
name: repo-harness-issue-flow
description: Run GitHub issue and PR driven development with several agents. Use it to turn a PRD or feature into a backlog of requirement issues split by architecture module, with sub-issue and blocked-by links and boundaries; to dispatch workers and follow their PRs and CI to merge as coordinator; or, as a worker, to deliver a dispatched issue's PR, raise a boundary question, hand off or take over a stalled claim, or sync a PR stacked on another agent's PR. Exclude PRD drafting, code review, and small changes that need no issue.
when_to_use: "repo-harness-issue-flow"
---

# repo-harness-issue-flow

Bot entrypoint. Issue/PR driven development (IPDD). GitHub holds the coordination state.
No local plan, task, review or notes file holds task state.

## Why this flow works

An orchestrator that sees the whole architecture writes each requirement
once, in a GitHub issue, with its module, dependencies and boundaries. A
worker then needs only the issue URL to start. The PR and CI record the
proof, and every agent and person reads the same state.

The boundary text carries most of the value. A worker that meets an open
question fills it. Over-defensive models fill it with fallbacks, aliases,
dual paths and broad `try/catch`, so that they cannot be blamed. Every
decision that the issue leaves open turns into permanent code. The
orchestrator therefore makes the decisions in the issue, and the worker
executes them or stops and asks.

## Seats, sub-agents and claim roles

A **seat** is a process seat: the orchestrator, the advisor or a worker. A
**sub-agent** is an `agents/fleet/` role that runs inside a seat process.
The orchestrator calls only the read-only sub-agents `gatekeeper`,
`explorer`, `deep-reasoner` and `root-cause-prover`. Writers and the Codex
cross-review run in seats.
A **claim role** is the GitHub role that a claim gives: coordinator,
writer, head owner, integrator or acceptor.

| Agent | Suggested model | Claim roles it holds | Never does |
|---|---|---|---|
| Orchestrator | Any host's long-lived top-level session with network access, started from `repo-harness seats argv orchestrator` | Coordinator of the parent issue; integrator | Implements a child issue in its own sub-tree; calls a writer sub-agent (`fast-worker`, `deep-worker`) or runs the Codex cross-review as a sub-agent |
| Gap reviewer | A different model family from the orchestrator, when one is available | None. Comments on the drafts | Rewrites the split or decides scope |
| Worker | Any capable coding model | Writer of one issue or PR slot, dispatched by the coordinator; head owner of its PR | Posts its own claim, widens scope, merges, pushes to another owner's branch |
| Acceptor | A seat holds the acceptor role and can call the gatekeeper sub-agent, the default reviewer. The orchestrator does not review a PR itself; an independent gatekeeper sub-agent of its seat may review a PR that it dispatched. The Codex cross-review and every other review run in another seat. For the High tier, a different model family when available; otherwise a fresh same-family context | Acceptor of one review in one round | Reviews its own code, pushes code |

The suggested models are advice, not a requirement. Any capable host may
hold any claim role. The High tier records its `model_relation` in the
acceptance record (`references/acceptor.md`).

Many agents work at once. A parent issue has children, a child can have
named PR slots, and PRs can depend on PRs with other owners. Each claim
role has one holder at a time. Every PR has one head owner, the only agent that
pushes to it. Claims, handoffs and dependency rules are in
`references/board.md`.

The user stays the owner. Publication to the main branch, deletion outside
the issue, credentials and releases keep their own approval rules.

## Where each fact lives

| Fact | Authority |
|---|---|
| Module map and boundaries | `docs/architecture/archimap.html` (skill `repo-harness-archimap`), backed by the architecture model |
| Product intent | PRD or source document named in the parent issue |
| Requirement, scope, boundaries, acceptance | Child issue body |
| Parent membership, dependencies, release window, plan tier | GitHub sub-issue, blocked-by link, milestone, `tier:` label (`references/templates.md`, Plan data) |
| Merge order, holds, batches, seat limit | The plan block in the parent's newest `plan` comment |
| Claim, status, handoff, scope changes, decisions | Issue comments |
| Change, verification, risk, rollback | PR body |
| Verification result | CI checks on the PR head |
| Research findings and runtime evidence | `docs/researches/` only. `docs/verification/` holds release-check records only (E5 exception) |
| Acceptance claim, findings, verdict | PR review threads and acceptance comments |
| Durable architecture decisions | `docs/adr/` only: `archcontext.adr/v1` files that link the originating issue decision. Capability docs and archimap link the ADR and do not restate it |
| Repeated mistakes | `tasks/lessons.md` |

One-time decisions live in issue decision comments. Durable decisions live in `docs/adr/`. `docs/plans/` is banned. A decision is durable when an agent could violate the rule after the issue closes.

The comment threads are the message board between agents. Every state
change is a typed comment, and chat messages carry only its link. Do not
copy an issue into a local file, and do not keep plan, task, review or
notes files. A copy drifts, and the next agent cannot tell which version
is current.

## Mode selection

- Orchestrator work (split a goal, write or fix issues, dispatch, follow PRs,
  accept, merge order, close out): read `references/orchestrator.md`.
- Replan (re-plan the board with the advisor): read `references/replan.md`.
- Worker work (deliver one claimed issue): read `references/worker.md`.
- Acceptance work (take a review round, publish its result, resolve its
  threads): read `references/acceptor.md`.
- Any seat, claim, handoff, dependency or board question: read
  `references/board.md`.
- Every body and comment shape: `references/templates.md`.
- GitHub events pushed to the orchestrator (install, verify, errors): read
  `references/events.md`.

A worker reads `references/worker.md`, `references/board.md` and the issue.
Keep the issue self-contained so that this is enough.

## Lifecycle

```text
map ─▶ split ─▶ gap review ─▶ publish ─▶ dispatch ─▶ worker loop ─▶ accept ─▶ merge ─▶ map refresh ─▶ close parent
                                            ▲              │
                                            └─ boundary question / scope change
```

## Hard rules

- Read the current issue, its assignees, all comments and linked PRs before
  you act. Follow the repository's issue-claim rules. Only the coordinator
  posts `issue claim`; a worker starts from the claim that names it.
  Silence or an old timestamp does not release a claim.
- Before you claim or comment on a repair issue, search its test name,
  read every comment, and take a posted patch first. Do not post a
  "seen again" comment; the reporter appends evidence through `report-ci`
  only.
- One child issue has one write scope. It has one PR, or PR slots that the
  issue names in advance. The one exception is a batch integration PR
  (`references/orchestrator.md` §9.3): it merges several accepted PRs and
  adds no change of its own. Parallel workers never share a file.
- One head owner per PR. Any other agent asks on the board, or takes the
  head-owner role through a handoff comment before it pushes.
- The worker follows the issue boundary. A needed change outside it is a
  boundary question for the orchestrator, not a reason to widen the PR.
- No compatibility code unless the issue asks for it by name: no aliases,
  dual reads or writes, shadow parsers, semantic fallbacks or silent
  defaults. The old path that the issue retires goes in the same PR.
- Never weaken or delete a test assertion to pass CI.
- CI is the verification authority. A local pass does not replace a red
  required check.
- Only the orchestrator merges, and only with
  `repo-harness publication merge`. The owner turns that on with
  `publication.acceptance_merge` in the policy on the PR base. When it is
  off, the executor does not merge and the owner merges. Exit codes:
  `references/orchestrator.md` §9.
