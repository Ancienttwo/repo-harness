---
name: repo-harness-issue-flow
description: Run GitHub issue and PR driven development with agents. The orchestrator splits work by architecture module into requirement issues with explicit dependencies and boundaries, dispatches workers and follows PRs and CI to merge; a worker claims one issue and delivers one PR. Exclude PRD drafting and single-PR tasks.
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

## Roles and seats

| Role | Model fit | Seats it holds | Never does |
|---|---|---|---|
| Orchestrator | The strongest planning model available | Coordinator of the parent issue; integrator by default | Implements a child issue in its own sub-tree |
| Gap reviewer | A different model family from the orchestrator | None. Comments on the drafts | Rewrites the split or decides scope |
| Worker | Any capable coding model | Writer of one issue or PR slot; head owner of its PR | Widens scope, merges, pushes to another owner's branch |
| Acceptor | Fresh context, read-only; a different family for the High tier | Acceptor of one review round | Reviews its own code, pushes code |

Many agents work at once. A parent issue has children, a child can have
named PR slots, and PRs can depend on PRs with other owners. Each seat has
one holder at a time. Every PR has one head owner, the only agent that
pushes to it. Claims, handoffs and dependency rules are in
`references/board.md`.

The user stays the owner. Publication to the main branch, deletion outside
the issue, credentials and releases keep their own approval rules.

## Where each fact lives

| Fact | Authority |
|---|---|
| Module map and boundaries | `docs/architecture/archimap.html` (skill `repo-harness-archimap`), backed by the architecture model |
| Product intent | PRD or source document named in the parent issue |
| Requirement, scope, boundaries, dependencies, acceptance | Child issue body |
| Claim, status, handoff, scope changes, decisions | Issue comments |
| Change, verification, risk, rollback | PR body |
| Verification result | CI checks on the PR head |
| Acceptance claim, findings, verdict | PR review threads and acceptance comments |
| Durable architecture decisions | Architecture model, `docs/architecture/`, `docs/adr/` |
| Repeated mistakes | `tasks/lessons.md` |

The comment threads are the message board between agents. Every state
change is a typed comment, and chat messages carry only its link. Do not
copy an issue into a local file, and do not keep plan, task, review or
notes files. A copy drifts, and the next agent cannot tell which version
is current.

## Mode selection

- Orchestrator work (split a goal, write or fix issues, dispatch, follow PRs,
  accept, merge order, close out): read `references/orchestrator.md`.
- Worker work (deliver one claimed issue): read `references/worker.md`.
- Any seat, claim, handoff, dependency or board question: read
  `references/board.md`.
- Every body and comment shape: `references/templates.md`.

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
  you act. Follow the repository's issue-claim rules. Silence or an old
  timestamp does not release a claim.
- One child issue has one write scope. It has one PR, or PR slots that the
  issue names in advance. Parallel workers never share a file.
- One head owner per PR. Any other agent asks on the board, or takes the
  seat through a handoff comment before it pushes.
- The worker follows the issue boundary. A needed change outside it is a
  boundary question for the orchestrator, not a reason to widen the PR.
- No compatibility code unless the issue asks for it by name: no aliases,
  dual reads or writes, shadow parsers, semantic fallbacks or silent
  defaults. The old path that the issue retires goes in the same PR.
- Never weaken or delete a test assertion to pass CI.
- CI is the verification authority. A local pass does not replace a red
  required check.
- Only the orchestrator merges, and only under the owner's publication
  authorization.
