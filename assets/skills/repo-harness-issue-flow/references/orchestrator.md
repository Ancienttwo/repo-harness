# Orchestrator SOP

You turn one goal into a parent issue and a set of child issues. You
dispatch workers, follow their PRs to merge and close the parent. You do
not implement child issues. Seats, dependencies and the comment board are
in `board.md`. Body and comment shapes are in `templates.md`.

You run in a long-lived top-level session on any host with network
access, in this skill's orchestrator mode. Start the seat with the argv
that `repo-harness seats argv orchestrator` prints. Any host and any
capable model may hold the seat.

Post your own `issue claim` with `Role: coordinator` on the parent before
you dispatch. Only you post `issue claim` comments: the claim for each
worker is yours, and it names the worker. Every later instruction to a
worker is a comment on its issue or PR.

Contents: §1 Preflight · §2 Split · §3 Write the boundaries · §4 Parent
issue (§4.1 Release set, §4.2 Intake) · §5 Gap review · §6 Publish ·
§7 Dispatch (§7.1 Quota check) · §8 Follow up (§8.1 Triage queue) ·
§9 Merge and integrate (§9.3 Board merge) · §10 Close out.

## 1. Preflight

1. Read the goal source: the user's request, a PRD, a design document or
   an existing parent issue. Note the requirement and scenario IDs. Issues
   cite them, so that acceptance can be traced.
2. Check the architecture authority. Run
   `repo-harness architecture-projection status --json`. Split only when
   `modelAuthority.source` is `archcontext` and `modelAuthority.ready` is
   `true`. Otherwise stop splitting and follow `next` until the
   repository is adopted: `repo-harness-architecture`, section
   "Adopt ArchContext in a repository". A split made against an unadopted
   model writes boundaries that the capability documents do not have.
   The result of `repo-harness architecture-projection check --json` does
   not carry `modelAuthority` or `next`. Do not use it as this gate.
3. Read the module map. Prefer `docs/architecture/archimap.html`. If the
   map is missing or older than the architecture model, refresh it first
   with the `repo-harness-archimap` skill. A split that is made against a
   stale map puts module boundaries in the wrong place.
4. Read the open issues and PRs in the area (`gh issue list`, `gh pr list`,
   then `gh issue view <n> --comments`). Record each active claim, linked
   PR and handoff. Reuse existing issues. Never open a duplicate for work
   that someone has already claimed.
5. Pin the base. Record `main@<short-sha>` for every "current state"
   section that you write.

## 2. Split

Make one child issue for each pair of module and observable outcome.

- **One write scope.** The files of one issue belong to one module of the
  map. Two issues that must touch the same file are one issue, or one of
  them goes first and the other depends on it.
- **Contract first.** For a cross-module change, the issue that owns the
  contract (wire format, API, schema, type, route) goes first. Producers
  and consumers depend on it. A consumer may start early only when its
  issue says so. It then stacks on the producer's PR branch and stays
  draft until the producer merges (see `board.md`). Early start is what
  lets three workers run at once on a chain of dependent modules.
- **Reviewable size.** One PR is one module + tier work package. Target
  150-500 product lines; 500 is a target, not a cap. The High-list split
  wins over size: do not mix a High-list path (hook, seat permissions,
  release, merge/push) with Medium or Low work. Split before acceptance,
  not after.
- **Seat fit.** Size an issue by its files too. A light seat (a small model
  with no sub-agents) converges on an issue that lists about 10 files or
  fewer; a wider issue on such a seat runs for hours and opens no PR. Give a
  wider change to a deep seat. A wide mechanical change (one helper, one
  rename, across many modules) conflicts with every open PR on its files:
  give it a plan position where no other open PR writes those files, first
  or last in the set, never beside them.
- **Order.** Contract and types → core logic → effects and adapters →
  CLI or server → UI → docs and map. Deletion of the old path goes with
  the change that replaces it, never as "cleanup later".
- **Deferred scope.** Fold a review follow-up in the same function and
  tier into the open PR. A follow-up in another module or tier, or one
  that must land before another open PR, gets its own issue even when
  small.

## 3. Write the boundaries

Write each child issue so that a literal and cautious worker produces the
same code as a careful senior engineer. Make every decision in the issue:

| Decision | Write it as |
|---|---|
| Which files change | `模块与位置 / Module and files`: module ID from the map, then the main files and the test files to extend |
| What must not change | `边界 / Boundaries`: forbidden files and modules, invariants that must hold |
| What gets deleted | `边界`: a delete list of old functions, flags, routes, files. Deleted in this PR |
| Compatibility | `边界`: "No compatibility path. <old thing> is removed, not aliased." When compatibility is really needed, name the exact migration, who runs it and when it is deleted |
| Error behavior | `要做的 / Do`: each failure case with its exact error code, status or message. "Fail closed with X", never "handle errors gracefully" |
| Out of scope | `不做 / Out of scope`: items that a worker would plausibly add. Name the issue that owns each, when one exists |
| Proof | `验收 / Acceptance`: observable checks with test file names and scenario IDs, and at least one negative check for what must NOT happen |
| Verification commands | `验收`: the exact commands, for example typecheck plus `test:files <files>` |

Words that leave a decision open: "robust", "graceful", "backward
compatible", "flexible", "handle edge cases", "as needed", "etc.". Replace
each one with the concrete case, or delete it.

Give the reason for a boundary when it is not obvious. A worker that knows
why a route stays server-only will not put it in the client "for
convenience".

Write the brief by responsibility, not by file list. Name the paths that
another worker owns, and the stop conditions: another owner's path, a
contract or wire format outside the issue, user data, credentials, a
release. Inside the boundary the worker edits every file the change needs.
Give the decision, not a menu: exact names, limits and the variables to
remove. Default to a clean refactor: change every caller, delete the old
path and update the tests in the same change. Keep compatibility only
where the issue names a concrete reason.

## 4. Parent issue

The parent issue holds the goal, the child table and the done criteria. Use the parent template. Keep the table current. Edit the
status column when a child changes state, so that the parent is one
screenful of truth.

The role/status column uses only `unclaimed`, `unclaimed · waits for
#n`, `writer <agent> · active`, `writer <agent> · PR #p` and `merged`.
The claim comment wins over the table.

A parent with more than two children gets a `plan` comment before
dispatch. Its plan block holds the merge order, the holds and
the seat limit (`templates.md`, plan). A plan change is a new `plan` with
`Supersedes:`; never edit the old comment. A parent with two children or
fewer needs no plan.

The merge order follows the dependencies, not the order of filing.
`board merge` stops at the first open entry of the merge order, so one held
entry blocks each ready PR behind it. Put a held issue, and an issue that
waits for an owner answer or an external release, at the tail. Move it
forward again when its blocker goes.

Put the rest of the plan in GitHub fields (`templates.md`, Plan data):
link each child as a sub-issue of the parent, add one blocked-by link for
each dependency, set the milestone of the release window, and add one
`tier:` label. Do not write `Depends on` lines. Nothing reads them. A
dependency is done when its blocker issue is closed.

A parent whose open children still hold old `Depends on` / `依赖` lines
moves them once, in two steps:

1. Run `repo-harness board migrate-dependencies --parent <n>`. It writes
   nothing. It lists every planned label and every planned link as
   `#X blocked by #Y (line N: <source line>)`, each existing item, each
   skipped line, the refused or unparsed lines that stop a write, and the
   plan digest.
2. A person checks every listed link against its source line. Then run
   `repo-harness board migrate-dependencies --parent <n> --write --plan
   <digest>`. It plans again and writes exactly the planned items. When the
   new plan differs from the checked one, it writes nothing
   (`dependency_plan_changed`); start again at step 1.

A refused or unparsed line stops every write. A body with a code or HTML
marker refuses all of its declarations, and only the template forms parse.
Delete the refused line from the body (add the link by hand if it is
needed), then run again.

### 4.1 Release set

A release costs the owner an approval and each user an update. Plan its
content before the work, not after the merges.

- **Train.** A train is a blocked-by chain of issues that delivers one
  result, for example one contract issue and its consumers. Read the trains
  from the blocked-by links and the file overlaps of the open issues, across
  every batch parent.
- **Set.** The release set is the list of trains that the next release
  ships. Each issue of the set carries the milestone of that release; an
  issue without the milestone is not in the set. A train with an external
  blocker or an owner hold is in no set until the blocker goes, so that it
  cannot hold the release.
- **Critical path.** Name the longest serial chain of the set. Dispatch its
  head first and give it the scarce seats: the release date is its end.
- **Record.** The advisor proposes the set (`advisor.md` §4). After the
  joint decision, post one `decision` comment on each batch parent with the
  train table: train, result, order, state. Update it when a train changes.
- **Release run.** Propose the release when every issue of the set is closed
  and the daily full run is green. A fix that users need before that is the
  one reason for an earlier patch release. A change that the seats
  themselves need ships with the set: the seats run the installed release,
  so a merged change does not change the host before a release, and an
  unreleased build is not installed as the host CLI.

### 4.2 Intake

Each new issue costs a dispatch, a review and a merge slot, and it moves
the end of the batch. Before you file one during a batch:

1. Search the open issues and PRs for the same design. Fold a duplicate:
   keep the older issue, copy the missing text into it, and close the newer
   one with a link.
2. Check that the issue is needed: it blocks an issue of the release set,
   it records a defect that a user meets, or the owner asked for it. Other
   findings wait in the advisor's proposal for the next set.
3. Give it its parent, its `tier:` and `route:` labels, its blocked-by links
   and its milestone at once. An issue without a parent is in no plan and no
   seat takes it.
4. Read an owner instruction at the scope of its words before it becomes an
   issue. A one-time authorization is an operation for now, not a product
   change; ask for the standing rule when the product needs one.

## 5. Gap review

Before you publish a set of three or more issues, or any set that crosses
more than one module boundary, send the drafts to a reviewer from a
different model family. Ask it to find holes only:

- a file that no issue owns, or that two parallel issues own;
- a dependency that is missing or circular;
- a decision that is still open (see the word list in step 3);
- an acceptance check that cannot be observed or run;
- a requirement ID from the source that no issue covers.

You decide what to fold in. The reviewer does not rewrite the split. Use
the host's cross-model channel (for example a Codex terminal in a Herdr.app pane).
Record the review in the parent issue as one comment that lists the
findings and the disposition of each.

## 6. Publish

1. Write each body to a file in your scratch directory and create it with
   `gh issue create --title <title> --body-file <file>`. Never build bodies
   with shell interpolation.
2. Create children in dependency order, then edit the parent table with the
   real numbers (`gh issue edit <parent> --body-file <file>`). Add the
   sub-issue links, the blocked-by links, the milestone and the `tier:`
   labels.
3. Read every issue back (`gh issue view <n>`) and check the links and the
   rendering.

Title shape: `<area> <phase>.<n>｜<module>：<outcome>（<requirement IDs>）`
when the repository uses phases, otherwise `<module>: <outcome>`. The
module is in the title so that a list view shows the write scopes.

## 7. Dispatch

- The issue is the brief. The dispatch packet holds only the issue URL,
  the role (`worker`), the worktree path and branch name, the model and the
  report channel. Do not restate the requirement in chat. A second copy
  becomes a second authority.
- Post the claim, then the packet. Post one `issue claim` on the child
  issue for the worker with the required fields in `templates.md` § issue
  claim. The claim is the worker's identity on the board, and the worker
  never posts one. Dispatch only after the claim is on the issue.
- Dispatch in parallel only when the write scopes are disjoint and each
  dependency is merged, or its contract is stable and the issue allows
  early start.
- Each parallel worker gets its own worktree from a clean base.
- Keep at most 8 active writer seats under one coordinator. A seat is
  active until its PR is merged or its claim status is `done` or
  `released` (`board.md` Claim roles). Hold further
  dispatches until a seat ends. Each active worker adds notices to your
  queue (§8.1), and more than 8 makes the owner wait.
- Default model preference: no role is bound to one vendor. At dispatch,
  prefer the deepest available model for architecture and contract issues,
  and the execution model for bounded single-module issues. With one model
  available, it takes both. The preference never becomes a requirement.
- Keep a ready queue. While a writer seat is free, the plan holds at least
  two ready issues that wait for no owner answer. When every open item
  waits for the owner or for a held PR, ask the advisor for the next issues
  in the same turn and dispatch them by joint decision. Seats that idle
  through a night because every item waited for one answer are the most
  expensive failure of this flow.
- Match the model to the issue. Give a weaker or over-defensive model the
  issues with the tightest boundaries and the clearest acceptance checks.
  Keep contract-design issues for a strong model.
- Review rounds converge by the round rules in `acceptor.md` §2.2.
  Include this rule in the worker brief: before asking for round N >= 2,
  check the fix delta against the open findings for sibling cases, missing
  test branches and CHANGELOG text against behavior. A Claude writer runs
  one read-only sub-agent for this check. A Pi writer has no sub-agents and
  does a self-check. The pre-check writes no record and does not replace
  the review.
- Never wait for the review bot. Answer every bot comment by `acceptor.md` §2.3, and triage a bot finding after merge once.
- Use the host's dispatch mechanism (an hc terminal in a Herdr.app pane,
  or a top-level host session). A dispatched agent has its own process. A
  sub-agent runs inside a seat process and is not a dispatch target. You
  may call only the read-only sub-agents `gatekeeper`, `explorer` and
  `deep-reasoner`. A writer (`fast-worker`, `deep-worker`,
  `root-cause-prover`) and the Codex cross-review always run in a seat, for
  worktree isolation and one writer per file. You do not review a PR
  yourself. An independent `gatekeeper` sub-agent may review a PR that you
  dispatched; route every other review of it to another seat. A dispatch
  does not grant publication, deletion or credential authority.
  For the Herdr pane topology, follow
  [Herdr Dispatch](https://github.com/aimpact-inc/repo-harness/blob/main/docs/reference-configs/herdr-notify.md#herdr-dispatch).

### 7.1 Quota check

Before each dispatch wave, run `repo-harness quota`. It prints the account
states, one mode line per account and one route line per task class. For
example: `claude mode: saving (5% left < 20%)` and
`codex mode: hyper (68% left >= 50%)`. Launch each task on the seat its
route line names with `repo-harness seats argv <seat>`; state the boundary
in the task. A `none` route waits, or it changes through the seats
configuration: the owner sets the seat order and each fallback there, and
the route line then names the first eligible seat. When a review route is
`none` and the plan cannot wait for the reset, a joint decision may change
the review seat's model in the configuration, through the Seats page or its
range-checked write, to a family that differs from the writer's; record the
revert time in the decision. Never start a seat with an argv that
`repo-harness seats argv` did not print.
`repo-harness board dispatch --parent <n> --space <id>` applies this step to every ready issue of the plan: it reads the `route:<class>` label of each issue (and `touches:credentials`), starts the worktree, posts the claim and opens the worker tab. `--dry-run` prints the decisions only. An issue without one `route:<class>` label is reported and not dispatched.
`repo-harness board review --parent <n> --space <id>` starts the gatekeeper seat for each ready, green High pull request that has no gatekeeper start marker for its head. When the board shows `claude_review: pending` (an open High or unknown-tier head that does not meet the High acceptance rule and has no Claude reviewer row), it also starts the reviewer seat; each seat has its own marker, so a seat that was not sent retries alone. A Medium head gets one seat of the other family than the board's `writer_family` (the `modelFamily` of the `Model:` line of the writer claim of the head branch): a non-Claude gatekeeper for a Claude writer, the Claude reviewer for any other known family. An unknown writer family (no such claim, no `Model:` line, an unmatched model, or linked issues that disagree) starts no seat and is skipped as `writer_family_unknown`; the orchestrator then starts by hand one reviewer seat of a model family known to differ from the writer's, and that review records its own `Model relation:`. `--pr <n>` reviews that pull request only. A pull request that links a plan-held issue is skipped as `plan_hold`. `--dry-run` prints the decisions only. A High head is not accepted until it has `PASS` rows from two distinct claims, one of them different-family to the writer; a Medium head needs one claimed `PASS` row recorded different-family (`acceptor.md` §2.2).
Apply the explorer line through the Claude Agent tool's `model` parameter when you call the explorer.

Claude saving mode applies when weekly remaining quota is below
`routing.claude_saving_below_remaining` (default 20). Codex hyper mode applies
when weekly remaining quota is at or above
`routing.codex_hyper_at_or_above_remaining` (default 50). Modes are derived,
never stored. Codex hyper seats use `gpt-6-astra` high. A Pi seat on `magpie/codex/`
takes the same hyper model as `magpie/codex/gpt-6-astra` with that effort.

Claude in saving mode or exhausted is reserved for the advisor and
orchestrator; both use `opus` high. Important non-frontend work then uses a
configured Pi `worker-light`; a null or non-Pi seat gives a `none` route.
Frontend waits for Claude; it has no non-Claude fallback.
An exhausted account takes no new dispatch, review seats included.
Only while an owner authorization for credits is recorded on the batch
parent, pass `--spend-credits` to both commands and name the flag in the
dispatch note.
`tight` is a display state only; it does not reserve Claude or change routing.

Claude seats use the Claude account, Codex seats and Pi seats on `magpie/codex/` use ChatGPT, and the DeepSeek Pi seat
has no account reading. Put the reading in the `Dispatch reading:` line of each claim:
account state, used %, pace, reset time and reading time.

| Account state | Route rule | Coordinator action |
|---|---|---|
| normal or surplus | First pass, in configured seat order | Dispatch to the named seat. |
| unknown | Second pass; the line names the state | Dispatch to the named seat and record the unknown state. |
| tight | Display only; the seat stays eligible unless Claude is reserved | Follow the named route. |
| exhausted | The account is excluded | Start no new turn on that account. |

## 8. Follow up

Find the repository's live seats with `repo-harness board seats --json`.
It includes seats without a parent issue. Wait for a seat with `hc wait <t>`
or follow `hc events`. Never use `sleep` loops to wait for seats.

Follow the PR and the issue comments. Do not poll CI with sleeps. Use the
host's PR events or check when the worker reports.

- **Worker PR.** A worker pushes its branch and opens its PR as soon as its
  checks pass. Do not send a push or PR go. You keep dispatch, joint
  decisions, the merge, and the review start with `repo-harness board
  review`. A worker reports to you only on PASS, a boundary question or a
  fix-loop stop.
- **Draft PR.** A writer keeps its PR draft until its verification
  evidence exists. Do not follow CI on a draft push by push. Act on the
  worker's `ready for review` notice (§8.1).
- **Frontier.** Work on the lowest unmerged PR in the plan block's merge
  order first. Do not spend fix or review rounds on a PR above a red PR in the
  same chain.
- **Low and docs-only PR.** Read the status and report it. Do not push fix
  rounds of your own. The Low accept-seat skip
  (`docs/reference-configs/agentic-development-flow.md`, Review by risk)
  sets its review.
- **CI red.** The worker owns the fix. Send the failing job name and the
  log excerpt to that worker, because it has the context. Allow one rerun
  for a known flake. A second identical failure is not a flake. Classify
  it once, as the diff, the infrastructure or a stale base, and act on
  that class: the worker fixes the diff, the owner gets the infrastructure
  failure, and for a stale base the worker merges main into the head,
  which makes a new head (`acceptor.md` §2.2). Do not rerun the job
  again. A job that was cancelled or timed out with no failed assertion is
  infrastructure: it starts no fix round. Rerun the failed job once on the
  same head. A second identical cancel goes to the owner.
- **Uncovered path.** A CI selection failure `Affected coverage is unknown
  for: <paths>` is a map bug. The worker fixes the consumer edge
  (`scripts/ci-path-consumers.ts`) or the test import. Never widen to the
  full suite unless a real full-suite input changed.
- **Boundary question.** Decide fast. Either amend the issue (edit the body
  and post a `scope change` comment that says what changed and why), or
  open a new issue for the extra work and keep the PR narrow. Never let the
  worker widen the PR without an issue change.
- **Review.** Select the review depth by the diff's risk tier. A Low PR
  that meets the Low accept-seat skip gets no Codex, Herdr or OAR accept
  seat (`docs/reference-configs/agentic-development-flow.md`, Review by
  risk). Give each ready PR that needs review its own review seat at once.
  A High PR keeps two reviewer seats in parallel. Send
  each reviewer the review packet of `acceptor.md` §2.1. Each reviewer
  posts an `acceptance claim` before it reads. Who reviews each
  round, and how many claims a round has, follow `acceptor.md` §2.2.
  Findings take the severities of `acceptor.md` §3. A P3 does not block
  the PR; apply the deferred-scope rule (§2) to its follow-up. Send the
  findings to the worker that
  wrote the PR only when the worker cannot read them: the worker reads the
  acceptance records and review threads on its PR and runs its own fix
  rounds (`worker.md` §7). A Codex worker is the exception: you push its
  fix rounds (`board.md`). You make the second-finding choice of the class rule
  (`worker.md` §7). For the design change, post a `scope change` with one
  mechanism rule that covers the class, and require the fix to show the rule
  on each case that the reviews found (one table-driven test or a replay of
  those inputs). The next round reviews the rule. A loop that fixes one
  instance for each round reaches the hard stop with the class still open.
  Record the result in one acceptance record comment on
  the PR, in the row shape of `templates.md`: round, role, subject,
  verdict and model relation.
  The review brief lets a reviewer with the `net` tool group publish only
  its own round with `repo-harness review publish`. It forbids every
  other GitHub write.
- **Defensive code.** Reject compatibility branches, fallbacks and
  speculative guards that the issue did not ask for, even when the tests
  pass. Quote the boundary line. This is the most common reason to send a
  PR back.
- **Stalled worker.** A writer with no PR and no `issue claim status` two
  hours after its dispatch is stalled. Read its pane, its branch
  (`git log origin/main..HEAD`, `git status --short`) and its last status
  comment. Ask one time for a status. When the answer shows no convergence
  (a growing file list, the same compile error, no commit), re-route the
  issue to a deeper seat. A handoff needs a claim comment that cites the
  prior claim; the new seat starts from the pushed branch.

### 8.1 Triage queue

Owner messages and worker notices arrive in the same session. Without a
rule, the newest message takes the turn and the owner loses the thread.
Keep the notices in the host's task list tool (on Claude: `TaskCreate`,
`TaskUpdate`, `TaskList`, `TaskGet`; on Codex: its plan tool). A queue item points to
the board. It holds no state of its own, so it cannot drift from the board.

- **Classify the source.** A message whose first line starts with
  `[rh-notice]` or `[rh-attention]`, or a `repo-harness.bot-event/v1`
  event, is a notice. Any other message is from the owner.
- **Queue each notice.** A notice does not take over an open owner
  request. When no owner request is open, work the queue in the same
  turn (Work the queue). Keep one item for each issue or PR. The subject is
  `[P<n>] #<number> <kind>`. The description is the comment or event URL,
  or the message text of a simple notice (`worker.md` §7). When the issue
  or PR has an open item, update that item and keep the higher priority.
  An `[rh-attention]` notice comes from the attention watcher, not from
  the owner. It holds one entry for each finding, in the form
  `<priority> <rule>: <message>`. Queue one item for each entry. The
  priority of the item is the one in its entry: the entry is the
  authority, so read no row of the table below for a finding. The subject
  is `[P<n>] #<number> <rule>`. `<number>` is the first issue or pull
  request that the entry names, else the parent issue.
- **Priority.**

  | Priority | Notice |
  |---|---|
  | P0 | `merge_outcome_unknown`, `agent.blocked`, a failed board read or post |
  | P1 | `boundary question`, `question`, an `issue claim status` with `Status: blocked`, a stalled worker |
  | P2 | CI red, review findings, an `integration status` with a conflict |
  | P3 | ready for review, `agent.done`, `done`, `info`, other status |

- **Owner first.** Answer the owner message before you take a queue item.
  End the answer with one line: `Queue: P0 <n> · P1 <n> · P2 <n> · P3 <n>`.
  A P0 notice is the only interrupt: tell the owner in one line when it
  arrives, then continue the owner's request unless the owner stops it.
- **Work the queue.** When no owner message waits, take the item with the
  highest priority, oldest first. Read its URL and its thread again, act,
  then mark the item completed. Take one item at a time. Answer a simple
  `question` in a host message. When the answer changes scope or decides
  an open point, post it as a `scope change` or `decision` comment and
  send the URL.
- **Rebuild.** At session start, and when the queue is empty after a
  context compaction, rebuild the queue from the board: `To: coordinator`
  comments without a `Re:` answer, open PRs with a red required check,
  claims with `Status: blocked` or `Status: ready for review`, acceptance
  records with open findings, and `integration status` comments with a
  conflict.
- **Changes without a notice.** A claim release, an owner comment, an
  acceptance record or a CI result can change the board without a
  worker notice. The `repo-harness.bot-event/v1` GitHub events
  (`events.md`) catch these changes and enter the queue as notices.
  Without the event Worker, read the parent and every open child before
  each dispatch or merge decision.

## 9. Merge and integrate

You are the integrator. Do the risk-tier review (§8) before you call the
executor. The workers produce the check results and CI. The acceptor reviews
those results. The executor does not read the acceptance record. It checks
CI, review threads, change requests, closing references and branch
protection itself.

Merge only with:

```bash
repo-harness publication merge --repository <owner/name> --repository-id <id> --pr <n> --head <sha> --base <sha> --json
```

`--head` and `--base` are the SHAs you reviewed.
`publication.acceptance_merge` in `.ai/harness/policy.json` on the PR base
decides whether the executor merges. The default branch needs required
checks and enforce_admins. There is one lane: a direct squash. The checks
need not be strict, and a base that requires a GitHub merge queue is not
supported (the provider rejects the squash, exit 6).

`Required / CI` runs one time for each PR head. A PR whose base is behind
main needs no sync: the squash lands on the current main. The executor
proves that the one parent of the merge commit is the `--base` you
reviewed or a descendant of it. For a descendant it also proves that the
tree of the merge commit is a clean `git merge-tree` of that parent and
`--head`; it fetches the commits from the checkout's `origin` with your
own git setup, so run it in a checkout of the repository. No run tests
the merge result before the merge. The daily full run finds two PRs that
pass alone and fail together.

Act on the exit code. Post every result as `integration status` on the PR.

| Exit | Meaning | Action |
|---|---|---|
| 0 | Merged | Post the merge SHA, the parent SHA and the revert command. Post `unblocked` on each dependent PR |
| 3 | Switch is off (`acceptance_merge_off`) | Post `To: owner`: the PR is ready, the owner merges. Do not merge another way |
| 4 | Refused before any merge request | For `base_protection_insufficient`, `publication_policy_invalid` (base policy) and `provider_unavailable`, hand it to the owner. For any other blocker, hand the PR to its head owner with the `blockers` |
| 5 | `merge_outcome_unknown` | Stop. Report to the owner. Never retry |
| 6 | `provider_rejected` | Post the GitHub error as it is. Hand it to the owner |

- Use `Closes #N` only in the PR that finishes the issue. Earlier PRs of a
  multi-PR issue use `Refs #N`. Before merge, check
  `gh pr view <n> --json closingIssuesReferences`. An edited body can keep
  an old closing link. The executor also checks the closing references and
  refuses with `closing_references_mismatch`, also for a closing keyword
  that targets a pull-request URL.

### 9.1 Eligible PRs

Merge each eligible PR on its own, in the order of §9.2. Do not sync a
PR with main for publication. A sync makes a new head, and each new head
needs its own CI run and its own review rows (`acceptor.md` §2.2). Only a
conflict with main needs a merge of main; the head owner makes it.

A PR is eligible when all of these are true:

- It is open and not draft.
- Its required checks are SUCCESS on its own head.
- Its tier review passed on a subject SHA. A rule-4 deferral of
  `acceptor.md` §2.2 still needs that `PASS`. A Low PR needs no review, but
  its PR body must hold the author verification evidence
  (`docs/reference-configs/agentic-development-flow.md`, Review by risk).
- Its head equals the reviewed subject. Rows of an earlier head do not
  count for a later head.
- It has no unresolved review thread that a person started. A review bot
  thread is advisory input and does not block. For a rule-4 deferral, you
  resolve the deferred P2 threads first (`acceptor.md` §6).
- Its closing references are correct.

```bash
gh pr view <p> --json state,isDraft,headRefOid,statusCheckRollup,closingIssuesReferences,reviewDecision
```

### 9.2 Merge order

Use the plan block's merge order. A parent without a plan (two children
or fewer) uses blocked-by order: a blocker lands before the issue it
blocks. The Order column of the parent table is only a view.

### 9.3 Board merge

A GitHub comment is a record, not an instruction. After a joint decision or
an owner authorization for the batch, you start the merge from your seat:

```bash
repo-harness board merge --parent <n> [--pr <p>] [--dry-run]
```

The command reads the board once and merges at most one PR through
`repo-harness publication merge`, squash only. Without `--pr` it takes the
first eligible PR in plan merge order. A PR is eligible when all of these
are true:

- `publication.acceptance_merge` is `on` on the default branch, and the
  plan comment is observed.
- The PR is open and not draft, and every issue that it closes or refs
  (the parent excluded) is an item of the parent.
- No hold record is in force on the parent, on the PR's issues or on the PR.
- The plan does not hold its issues, its issues are in `merge_order`, and
  every issue before each of them in `merge_order` is closed. A PR that
  closes two plan items is never eligible, in any plan order: split the PR.
- An acceptance record has a PASS row for the head, at every tier. The
  provisional `tier_low` status is not enough: post the Low record after
  you check the verification evidence.
  A High PR needs two PASS rows for the head that cite distinct
  `acceptance claim` comments, one of them `different-family`
  (`acceptor.md` §2.2).
- `Required / CI` passed on the head, and the readiness verdict is ready.

The executor keeps all its own gates. Exit codes follow the §9 table; exit 4
with no merge also means that no PR is eligible, and the output names the
first failed condition of each PR. Board rule A11 wakes you when a PR is
eligible; the watcher never merges. Before you run the command, answer each
review-bot comment (`acceptor.md` §2.3): the command does not read bot
comments.

A hold record narrows only. When a stop is decided locally (an owner
instruction that reaches your seat, or a joint decision on a "stop" or "no"
comment), post `merge hold` (`templates.md`) in the same turn, before any
other action. A hold on the parent holds the whole batch, or only the issues of
its `Issues:` line. A hold on an issue or a PR holds that issue or PR. Each
hold stays in force until a `merge hold released` on the same thread that
is strictly newer than the hold; a release with the same time does not end
it. When the newest 50 comments of a thread hold no release and older
comments exist, the command refuses with `hold_unknown`. Before you post a
release to clear it, read the full thread: a release ends every older hold
on that thread.

## 10. Close out

1. All children are closed or explicitly deferred to a linked issue.
2. When module boundaries, APIs or flows changed, the architecture model
   and `docs/architecture/archimap.html` are current (`repo-harness-archimap`).
3. Post a closing comment on the parent: merged PRs, deferred issues,
   remaining risk. Then close it, when the owner's instruction covers
   closing.
4. Close each finished worker pane after its PR merges, with
   `repo-harness board closeout --pr <n>`. It confirms that the checkout is
   clean and pushed, closes each seat terminal of the PR, then removes the
   merged worktree; a checkout with an unpushed commit is kept and the
   command exits 1.
5. Add a lesson to `tasks/lessons.md` only for a mistake that repeated or
   that a rule would have prevented.
