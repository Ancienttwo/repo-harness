# Seats, topology and the comment board

Many agents work on one goal at the same time. This file defines who owns
what, and how they talk. The issue and PR comment threads are the message
board. Every agent and the owner can read them, they persist, and GitHub
orders them. Chat, Herdr and session messages carry only a link to a
comment. They never carry the content itself.

## Seats

A seat is a role on one GitHub object. An agent holds a seat by an active
claim comment. One seat has at most one active holder.

| Seat | Object | Holds it | Can write | Released by |
|---|---|---|---|---|
| Coordinator | Parent issue | Orchestrator | Parent body (child table), dispatch, scope changes, merge order | Closing comment, or handoff |
| Writer | Child issue, or one PR slot of it | Worker | Its branch, its PR body, status comments | PR merged, or released or handed-off status |
| Head owner | One PR | The writer of that PR | Pushes to the PR branch. Only this seat pushes | Merge, or a handoff that names the next head owner |
| Acceptor | One review round of one PR | Read-only reviewer | Review threads and the acceptance record row | The acceptance record row for its round |
| Integrator | Main branch publication | Coordinator by default | Merge, main sync of a PR (only with the head-owner seat) | Merge done, or handoff |

Rules that keep the topology safe:

- **One pusher per PR.** Only the head owner pushes to a PR branch. Another
  agent that needs a change in it (a reviewer's fix, a main sync, a repair)
  either asks the head owner on the board, or takes the head-owner seat
  through a handoff comment first. Two pushers on one branch lose work.
- **Acceptor ≠ writer.** The acceptor of a round did not write the subject
  SHA. For the High tier, the acceptor is also from a different model
  family.
- **A coordinator of a sub-tree does not write in it.** A child issue that
  turns out to be large becomes a parent. Its claimant becomes the
  coordinator of that sub-tree, opens grandchildren and dispatches them.
  It does not also implement them.
- **Earliest claim wins.** For two claims on one seat without an explicit
  handoff, the earliest comment wins. Break ties by comment ID. The later
  claimant posts a released status and stops.

## Topology

```text
Parent issue ── coordinator seat
 ├─ Child A (module X) ── writer seat ── PR-A ── head owner = writer A
 │                                        └─ acceptance round 1, 2 ... (acceptor seats)
 ├─ Child B (module Y) ── PR slots named in the issue:
 │    ├─ PR-B1 ── writer B1 (own slot claim)
 │    └─ PR-B2 ── writer B2, Depends on PR-B1
 └─ Child C (module Z) ── Depends on #A ── PR-C draft until PR-A merges
Integrator seat (coordinator) merges in the parent's order.
```

- **Issue dependencies** are lines `Depends on #N` in the child's
  dependency section. The coordinator checks the graph for cycles before
  publish.
- **PR slots.** One issue can name several PRs in advance (PR-1a, PR-1b),
  each with its own scope. Each slot is claimed separately: an issue claim
  comment with `Slot: PR-1b`. Without named slots, one issue is one writer.
- **PR dependencies** are lines `Depends on #<PR>` in the PR body.
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
- **Serial integration.** The integrator merges in the parent's order.
  After each merge, the next PR syncs with main. When the sync delta has no
  conflict and leaves the reviewed source unchanged, the acceptance stays
  valid with the delta recorded. A changed subject needs a new round.

## Comment protocol

Every protocol comment starts with a header line `repo-harness <kind>`, so
that a search finds it and an agent can parse it. Then come `Field: value`
lines, then at most a short free-text body. The exact shapes are in
`templates.md`.

| Kind | Where | Posted by | Purpose |
|---|---|---|---|
| `issue claim` | Issue | Coordinator, writer | Take a seat (with `Seat`, optional `Slot`) |
| `issue claim status` | Issue | Seat holder | ready for review, blocked, released, handed off, done |
| `boundary question` | Issue | Writer | The issue boundary blocks the work. Stop and ask |
| `scope change` | Issue | Coordinator | The issue body changed: what, why, who is affected |
| `decision` | Issue (parent for cross-issue ones) | Coordinator | A decision that the body does not hold yet, with its reason |
| `handoff` | Issue and PR | Current holder, or coordinator on the owner's instruction | Move a seat. Names prior claim, next holder, exact state |
| `acceptance claim` | PR | Acceptor | Take a review round: seat, round, subject SHA, tier |
| `acceptance record` | PR | Acceptor or coordinator | Round table: seat, subject SHA, verdict, findings |
| `unblocked` | PR or issue | Coordinator | A dependency merged. Sync and continue |
| `integration status` | PR | Head owner or integrator | Main sync result, delta, new head, CI |

Board rules:

1. **Append, do not rewrite.** Post a new comment for each state change. The
   thread is the log. Edit your own comment only to fix a typo. Never edit
   another agent's comment. The only edited snapshot is the issue body,
   and only its seat holder edits it (the parent body by the coordinator,
   a child body by the coordinator through a `scope change`).
2. **Address and answer.** A comment that needs an answer has a `To:` line
   that names a seat (`To: writer #1147`). The answer has a `Re: <comment
   URL>` line. The agents can share one GitHub login, so @mentions do not
   route. Seats route.
3. **Read before you act, read back after you post.** Read the full thread
   (`gh issue view <n> --comments`, `gh pr view <n> --comments`; paginate
   with `gh api` for long threads) before you act. After you post, read the
   comment back and keep its URL. If delivery is uncertain, read before you
   retry. Never post the same claim twice.
4. **Evidence by reference.** Link CI runs, commits and files. Paste at most
   about 20 lines of log. Never paste secrets, tokens, private host paths
   or environment files.
5. **Line findings go in review threads.** A finding about specific lines
   is a PR review comment on those lines. Its first word is the severity
   (`P1`, `P2`, `P3`). The head owner replies with the fix SHA. The
   reviewer who opened the thread resolves it after checking the fix.
   Do not resolve another reviewer's thread.
6. **Nudge with a link.** To wake an agent, send it the comment URL
   through the host channel (a Herdr prompt, a session message). The
   comment is the instruction. A message that differs from the board loses.
7. **Decisions live on the board.** A decision that changes scope goes into
   the issue body through a `scope change`. Any other decision goes into a
   `decision` comment on the issue. Do not keep decision notes in local
   files. A decision that must outlive the issues (an architecture rule)
   goes into the architecture model or the `docs/architecture/` prose, and
   the map shows it.

## Waking up

Agents do not watch the board continuously. A seat holder reads its threads
at these points: at the start of a turn, before a push, before posting a
status, after CI finishes, and after any nudge. The coordinator also reads
the parent and every open child after each worker report. Use host PR
event notifications when the host provides them. Do not poll in a sleep
loop.
