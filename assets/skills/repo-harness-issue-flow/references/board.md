# Claim roles, topology and the comment board

Many agents work on one goal at the same time. This file defines who owns
what, and how they talk. The issue and PR comment threads are the message
board. Every agent and the owner can read them, they persist, and GitHub
orders them. Chat, Herdr and session messages carry only a link to a
comment. They never carry the content itself.

## Claim roles

A claim role is a role on one GitHub object. An agent holds a claim role by
an active claim comment. One claim role has at most one active holder. A
seat is a process (`SKILL.md`, Seats, sub-agents and claim roles).

| Claim role | Object | Holds it | Can write | Released by |
|---|---|---|---|---|
| Coordinator | Parent issue | Orchestrator | Parent body (child table), plan, plan data (sub-issues, blocked-by, milestone, `tier:` labels), dispatch, scope changes | Closing comment, or handoff |
| Writer | Child issue, or one PR slot of it | Worker | Its branch, its PR body, status comments | PR merged, or released or handed-off status |
| Head owner | One PR | The writer of that PR | Pushes to the PR branch. Only this role pushes | Merge, or a handoff that names the next head owner |
| Acceptor | One review in one round of one PR (`acceptor.md` §2.2 sets the reviews of a round) | A read-only reviewer; the gatekeeper is the default (`acceptor.md`) | Its review threads and the acceptance record row, through the review-round runner | The acceptance record row for its review |
| Integrator | Main branch publication | Orchestrator | Merge with `repo-harness publication merge` only, main sync of a PR (only with the head-owner role) (`orchestrator.md` §9) | Merge done, or handoff |

Rules that keep the topology safe:

- **One pusher per PR.** Only the head owner pushes to a PR branch. Another
  agent that needs a change in it (a reviewer's fix, a main sync, a repair)
  either asks the head owner on the board, or takes the head-owner role
  through a handoff comment first. Two pushers on one branch lose work.
  Exception: for a Codex worker seat in a linked contract worktree, the
  orchestrator is the head owner of record. It commits the worker's diff
  with the worker's message and explicit paths only, pushes the branch,
  opens the PR and pushes each fix round. No other agent pushes to that
  PR. The Codex seat remains the content author and answers review threads
  through the orchestrator.
- **Acceptor ≠ writer.** The acceptor of a round did not write the subject
  SHA. A High head needs two reviews, and at least one of them comes from a
  model family different from the writer's (`acceptor.md` §2.2). The other
  can use a fresh same-family context and record
  `model_relation: same-family` in the acceptance record.
- **A coordinator of a sub-tree does not write in it.** A child issue that
  turns out to be large becomes a parent. Its claimant becomes the
  coordinator of that sub-tree, opens grandchildren and dispatches them.
  It does not also implement them.
- **One merge path.** The integrator merges only with
  `repo-harness publication merge`. When `publication.acceptance_merge` is
  `off` at the live tip of the base branch, the executor does not merge. The integrator posts
  that the PR is ready, and the owner merges.
- **One integrator.** Only the integrator sends ready PRs to
  `repo-harness publication merge` or asks a head owner to sync. The
  executor enqueues each PR when the queue is on. The queue tests it on
  the current main.
- **Earliest claim wins.** For two claims on one role without an explicit
  handoff, the earliest comment wins. Break ties by comment ID. The later
  claimant posts a released status and stops.

## Claims

One `issue claim` comment takes one claim role. `issue claim` is seat-only:
only the active coordinator holder posts it (see "Seat-only comment
kinds"). A claim that takes over a role also carries `Prior claim`. The
required fields are in `templates.md` § issue claim.
Board rules 2, 3 and 8 apply: one identity, read back, and
stop on an uncertain read or post.

- **The coordinator posts every claim.** It claims its own coordinator
  role on the parent. For each worker it dispatches, it posts one writer
  claim with `Agent:` set to that worker's identity and `Coordinator:`
  set to its own claim URL. The worker never posts a claim of its own.
  That claim is the identity that the worker uses in every later comment.
- **Read the parent first.** Before the coordinator claims a role, it
  reads the parent child table and the latest `plan` on the parent, every
  comment on this issue, and every PR that links it. It does not claim a
  dependent issue while its dependency is open, unless the issue allows
  early start.
- **Write access is the coordinator's authority.** A claim is valid only
  when the account that posts it has write access to the repository: its
  `author_association` is `OWNER`, `MEMBER` or `COLLABORATOR`. GitHub
  is the only source of that permission; do not keep a separate list. A
  claim from any other account holds no role.
- **A claim from anyone else is a request.** An `issue claim` comment
  from an agent without the coordinator role is a request, not a claim.
  The coordinator accepts it with one `issue claim` that names that
  agent, or rejects it with a `To: <agent>` comment. No work starts
  until the coordinator's claim is on the board.
- **No coordinator, no start.** While the parent has no coordinator, no
  child starts. The owner appoints a coordinator, and it claims the parent
  before it dispatches any child.
- **Invalid claim.** A claim that misses a required field is invalid. The
  coordinator releases it with `issue claim status` and
  `Status: released`, then posts one complete claim. It names the missing
  fields in a `To: <agent>` comment and does not dispatch work on that
  issue until the corrected claim is on the board. The parent table never
  makes an invalid claim valid.

## Seat-only comment kinds

`plan`, `decision`, `scope change`, `unblocked` and `issue claim`
belong to the coordinator role. Only the active coordinator holder posts
them.

- A comment of one of these kinds from an agent without the coordinator
  role is invalid. It takes effect only when the coordinator confirms it
  in its own comment of the same kind. Until then no worker acts on it,
  and the parent table does not change.
- An `issue claim` from another agent is a request. The coordinator
  accepts or rejects it as `Claims` says. No claim role changes until the
  coordinator posts the claim.
- An owner instruction becomes a board rule through the coordinator. The
  coordinator records it as a `decision`, or as a `scope change` when
  the issue body moves. The owner's message alone is not a board entry.
- A drafting session without a claim may create a parent issue and child issues
  on the owner's instruction. It writes `unclaimed` in the parent child
  table and posts no seat-only comment. The coordinator adopts or rewrites
  the drafts after it claims.

`handoff` is not seat-only: the current holder posts it, or the
coordinator posts it on the owner's instruction.

## Topology

```text
Parent issue ── coordinator role
 ├─ Child A (module X) ── writer role ── PR-A ── head owner = writer A
 │                                        └─ acceptance rounds (acceptor roles, `acceptor.md` §2.2)
 ├─ Child B (module Y) ── PR slots named in the issue:
 │    ├─ PR-B1 ── writer B1 (slot claim by coordinator)
 │    └─ PR-B2 ── writer B2, base branch = PR-B1's branch
 └─ Child C (module Z) ── blocked by #A ── PR-C draft until PR-A merges
Integrator (coordinator) merges in the plan block's merge order, one PR at a time.
```

**Parent table status.** The role/status column of the parent child table
uses only these values: `unclaimed`, `unclaimed · waits for #n`,
`writer <agent> · active`, `writer <agent> · PR #p`, `merged`. A
Chinese-language repository writes `待认领`, `待认领 · 等待 #n 合并`,
`writer <agent> · active`, `writer <agent> · PR #p`, `merged`. The
claim comment wins over the table, and the coordinator corrects the table
after each claim or status change.

- **Plan data lives in GitHub fields** (`templates.md`, Plan data). A
  child is a sub-issue of its parent. An issue dependency is a blocked-by
  link. A release window is a milestone. The plan tier is one label
  `tier:low`, `tier:medium` or `tier:high`. The merge order, holds and
  batches are the plan block in the newest `plan` comment. A body line
  `Depends on #N` is not a dependency. The coordinator checks the
  blocked-by graph for cycles before dispatch.
- **PR slots.** One issue can name several PRs in advance (PR-1a, PR-1b),
  each with its own scope. Each slot is claimed separately: the
  coordinator posts one `issue claim` per slot, with `Slot: PR-1b`.
  Without named slots, one issue is one writer.
- **PR dependencies** are base branches. A PR that needs another PR's
  unmerged code sets its base to that PR's branch. A PR to issue link is
  `Closes #<issue>` or `Refs #<issue>` in the PR body.
- **Pushed history is append-only.** A head owner never rewrites a branch
  that someone may have built on. It syncs main with a merge commit, and
  it does not force-push. A rewrite that cannot be avoided needs a
  `handoff` or `decision` comment first, on every PR that depends on it.
  This rule is what makes stacking safe.
- **Early start stacks on the producer.** When an issue allows early start
  and the consumer needs the producer's unmerged code to compile, the
  consumer branches from the producer's PR head, and its PR's base is the
  producer's branch. The consumer's CI then stays green, and its diff
  shows only its own work. Without that need, base the PR on main.
- **Producer merges.** The coordinator posts `unblocked` on the consumer
  PR. Its head owner retargets the PR to main (`gh pr edit <n> --base
  main`), merges main into its branch (no force push), runs the affected
  checks and posts `integration status`. A squash merge of the producer
  leaves its commits in the consumer branch; the merge of main resolves
  them as already applied.
- **Producer rewrote anyway.** Replay only your own commits onto the new
  producer head (`git rebase --onto <new-head> <old-head>`), push with
  `--force-with-lease` on your own branch only, and post `integration
  status` with old and new heads. Tell the coordinator, because the
  producer broke the append-only rule.
- **Contract change after start.** When a producer must change a contract
  that a consumer already uses, the producer posts a `boundary question` on
  its own issue. The coordinator decides and posts a `scope change` on
  every affected issue.
- **Queue integration.** Send each ready PR to
  `repo-harness publication merge` in the plan block's merge order. A
  parent without a plan (two children or fewer) uses blocked-by order.
  The Order column of the parent table is only a view. With
  `publication.merge_queue` `on`, the executor enqueues each PR. The queue
  tests it on the current main, so a head behind main needs no sync.

## Comment protocol

Every protocol comment starts with a header line `repo-harness <kind>`, so
that a search finds it and an agent can parse it. Then come `Field: value`
lines, then at most a short free-text body. The exact shapes are in
`templates.md`.

| Kind | Where | Posted by | Purpose |
|---|---|---|---|
| `issue claim` | Issue | Coordinator | Take a claim role for a dispatched agent: the required fields, with an optional `Slot` |
| `issue claim status` | Issue | Claim holder | ready for review, blocked, released, handed off, done |
| `boundary question` | Issue | Writer | The issue boundary blocks the work. Stop and ask |
| `scope change` | Issue | Coordinator | The issue body changed: what, why, who is affected |
| `decision` | Issue (parent for cross-issue ones) | Coordinator | A decision that the body does not hold yet, with its reason |
| `plan` | Parent issue | Coordinator | The plan block of a large parent: merge order, holds, batches, seat limit. A revision supersedes the previous plan |
| `handoff` | Issue and PR | Current holder, or coordinator on the owner's instruction | Move a claim role. Names prior claim, next holder, exact state |
| `acceptance claim` | PR | Acceptor, or the coordinator for a gatekeeper round | Take one review in a round: role, round, subject SHA, tier (`acceptor.md`) |
| `acceptance record` | PR | Acceptor or coordinator | One row per review: round, role, subject SHA, verdict; then the model relation and the findings. The same shape for every review (`templates.md`) |
| `unblocked` | PR or issue | Coordinator | A dependency merged. Sync and continue |
| `integration status` | PR | Head owner or integrator | Main sync result, delta, new head, CI; a merge result with the executor exit code |

`plan`, `decision`, `scope change`, `unblocked` and `issue claim`
are seat-only (see above). Every other kind may come from any claim holder
it names.

Board rules:

1. **Append, do not rewrite.** Post a new comment for each state change. The
   thread is the log. Edit your own comment only to fix a typo. Never edit
   another agent's comment. The only edited snapshot is the issue body,
   and only its claim holder edits it (the parent body by the coordinator,
   a child body by the coordinator through a `scope change`).
2. **Address and answer.** A comment that needs an answer has a `To:` line
   that names a claim role (`To: writer #1147`). The answer has a `Re: <comment
   URL>` line. A shared GitHub login is not an agent identity, so @mentions
   do not route. Every claim holder uses the identity from its claim
   (`Agent: <kind>, session <id>`) in every later comment. Roles route.
3. **Read before you act, read back after you post.** Read the full thread
   (`gh issue view <n> --comments`, `gh pr view <n> --comments`; paginate
   with `gh api` for long threads) before you act. After you post, read the
   comment back and keep its URL. Confirm that the published body contains
   every required field. Never post the same claim twice.
4. **Evidence by reference.** Link CI runs, commits and files. Paste at most
   about 20 lines of log. Never paste secrets, tokens, private host paths
   or environment files.
5. **Line findings go in review threads.** A finding about specific lines
   is a PR review comment on those lines. Its first word is the severity
   (`P0`, `P1`, `P2`). NIT findings go in the review body only
   (`acceptor.md` §3). The head owner replies with the fix SHA and does
   not resolve the thread. Only the acceptor of that round resolves it
   after the next round confirms the fix. The coordinator may resolve a
   thread with a written rejection reason, or with the rule-4 follow-up
   issue link (`acceptor.md` §2.2). See `acceptor.md`.
6. **Nudge with a link.** To wake an agent, send it the comment URL
   through the host channel (a Herdr prompt, a session message). The
   comment is the instruction. A message that differs from the board loses.
   A message from a worker to the coordinator starts with
   `[rh-notice] <kind> #<issue>`, so that the coordinator can tell it from
   an owner message. A simple fact or question goes in the message only. A
   state change or a decision request goes in a comment first, and the
   message carries its URL. Messages carry pointers, not content: a message
   that restates what GitHub holds names the issue, the PR, the comment URL
   or the sha instead. Evidence goes in an `issue claim status` or the PR
   body (`worker.md` §7, `orchestrator.md` §8.1). An owner decision reaches
   the board the same way: the receiving seat posts it on the issue or PR.
   A message still wakes a seat; it never replaces the board record. The
   advisor sends the orchestrator only a mismatch between a seat report and
   the GitHub state, not a confirmation.
7. **Decisions live on the board.** A decision that changes scope goes into
   the issue body through a `scope change`. Any other one-time decision goes
   into a `decision` comment on the issue. Do not keep decision notes in local
   files. A durable decision, one that an agent could violate after the issue
   closes, goes into `docs/adr/` as an `archcontext.adr/v1` file that links
   the originating issue decision. Capability docs and the map link the ADR
   and do not restate it. `docs/plans/` is banned.
8. **Stop on an uncertain read or post.** When a board read fails, or you
   cannot confirm that a comment was delivered, stop and report the failure.
   Read back before you retry an uncertain post.

## Waking up

Agents do not watch the board continuously. A claim holder reads its threads
at these points: at the start of a turn, before a push, before posting a
status, after CI finishes, and after any nudge. For the coordinator, the
start-of-turn read is the thread that the queue item names when it takes
that item. The coordinator reads the parent and every open child at
session start. GitHub events catch board changes that come without a
worker notice. Without the event Worker, the coordinator also reads the
parent and every open child before each dispatch or merge decision
(`orchestrator.md` §8.1).
Use host PR event notifications when the host provides them. Do not poll
in a sleep loop.
