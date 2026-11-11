# Replan

A replan is a fresh look at the whole board of one parent issue. The
orchestrator asks its advisor for a proposal. The advisor reads the board
and returns one proposal. The orchestrator decides each row and writes the
result to the board. This file is the only authority for replan. Other
files link it and do not restate it.

The advisor is the long-lived hc terminal in the pane beside the orchestrator
([Issue-flow topology](https://github.com/aimpact-inc/repo-harness/blob/main/docs/reference-configs/herdr-notify.md#issue-flow-topology)).
It holds no claim role. It does not commit, write to GitHub or
decide. Its other duties are in `advisor.md`.

## 1. Triggers

Ask for a replan when any one of these is true:

- The owner asks for one.
- At least 3 open issues or PRs are not in the parent's latest `plan`.
- A claim shows no `issue claim status` for one working session.
- One PR still fails after its second fix round. Its review rounds
  continue by `acceptor.md` §2.2.
- The lowest unmerged PR in the merge order is blocked.
- The triage queue (`orchestrator.md` §8.1) holds more P1 and P2 items
  than active writer seats.
- No PR merged to main for 4 hours while the plan block's merge order holds
  an accepted PR or a PR that is ready for review.

The orchestrator itself cannot see the last trigger when it is stuck: an
idle session runs no tool, so a hook in that session never fires. The
detection is a scheduled check outside the session. The check sends an
`[rh-notice] replan #<parent>` message to the orchestrator, and the notice
enters the triage queue (`orchestrator.md` §8.1) as P1, like a stalled
worker. The advisor's scheduled review (`advisor.md` §2) is this check.

## 2. Request (orchestrator → advisor)

Send the request through the host channel, for example
`hc send <advisor terminal> <text>`. The request holds links only:

```text
replan request
Parent: <parent issue URL>
Main: <current main SHA>
Plan: <URL of the latest plan comment, or the parent body>
Trigger: <the trigger from §1>
Question: <what the orchestrator wants decided>
Proposal: <file path in the orchestrator's scratch space>
```

The advisor reads the board itself with `gh` and `git`, read-only. No
copy of board state goes into the request, so no second version of the
board exists.

## 3. Proposal (advisor → orchestrator)

The advisor writes one file at the `Proposal:` path. The file is in the
orchestrator's scratch space, never in the repository. Each row gives a
recommendation, not a decision. Every row cites evidence: a file:line, a
comment URL, a PR URL or a CI run.

The file has these sections, in this order:

1. **Staleness map.** One row for each open issue and PR under the parent:

   | Item | Recommendation | Evidence |
   |---|---|---|
   | `#<n>` | `valid`, `fix body`, `close`, `duplicate of #<m>`, `blocked by #<m>` or `owner hold` | `<file:line or URL>` |

2. **Edges.** The blocked-by edges and the file-overlap
   edges between open items. Two items that write one file cannot run in
   parallel.
3. **Lanes and merge order.** The proposed parallel lanes and the order in
   which ready PRs go to `repo-harness publication merge` (`orchestrator.md`
   §9.2).
4. **Claim changes.** Each claim to reassign or release, with the evidence
   of a stall: the last `issue claim status` URL and the branch head.
5. **Owner questions.** The decisions that only the owner can make.

When the file is complete, the advisor sends
`[rh-notice] replan #<parent> <proposal path>` to the orchestrator. The
notice enters the triage queue (`orchestrator.md` §8.1).

## 4. Decision (orchestrator)

The orchestrator accepts, changes or rejects each row. The proposal file
is input only. The board holds the result:

- Post a `decision` comment on the parent for the decisions, with the
  reason for each changed or rejected row.
- Post a new `plan` on the parent that supersedes the previous plan.
- Fix an issue body with a `scope change`. Close a stale or duplicate
  issue with a comment that links the decision.
- Ask the owner each owner question. An owner answer becomes a board rule
  only through the orchestrator's `decision` or `scope change`.
- Move a claim role only by the handoff rules in `board.md`. A replan does not
  release a claim by itself.

After the decision, the orchestrator deletes the proposal file.
