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
- **Reviewable size.** One PR, about 10 implementation files or fewer,
  with one concern and one module when possible. A larger issue becomes a
  parent issue with its own children, or one issue with numbered PRs
  (PR-1a, PR-1b) that the issue names in advance. Split before
  acceptance, not after.
- **Order.** Contract and types → core logic → effects and adapters →
  CLI or server → UI → docs and map. Deletion of the old path goes with
  the change that replaces it, never as "cleanup later".
- **Deferred scope gets its own issue.** Put it in a follow-up issue, not
  in a "later" note.

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
dispatch. Its plan block holds the merge order, the holds, the batches and
the seat limit (`templates.md`, plan). A plan change is a new `plan` with
`Supersedes:`; never edit the old comment. A parent with two children or
fewer needs no plan.

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
  issue for the worker: `Role: writer`, `Agent:` the worker identity,
  `Branch:` the branch that the packet names, `Scope` and `Not in scope`
  from the issue, and `Coordinator:` the URL of your own parent claim. The
  claim is the worker's identity on the board, and the worker never posts
  one. Dispatch only after the claim is on the issue.
- Dispatch in parallel only when the write scopes are disjoint and each
  dependency is merged, or its contract is stable and the issue allows
  early start.
- Each parallel worker gets its own worktree from a clean base.
- Keep at most 8 active writer seats under one coordinator. A seat is
  active until its PR is merged or its claim status is `done` or
  `released` (`board.md` Claim roles). Hold further
  dispatches until a seat ends. Each active worker adds notices to your
  queue (§8.1), and more than 8 makes the owner wait.
- Default model preference (D3): no role is bound to one vendor. The old
  fixed split, Claude for frontend and Codex for backend, is retired. At
  dispatch, prefer the deepest available model for architecture and
  contract issues, and the execution model for bounded single-module
  issues. With one model available, it takes both. The preference never
  becomes a requirement (D7).
- Match the model to the issue. Give a weaker or over-defensive model the
  issues with the tightest boundaries and the clearest acceptance checks.
  Keep contract-design issues for a strong model.
- Review rounds converge by the round rules in `acceptor.md` §2.2.
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
  [Herdr Dispatch](https://github.com/Ancienttwo/repo-harness/blob/main/docs/reference-configs/herdr-notify.md#herdr-dispatch).

### 7.1 Quota check

Quota belongs to the provider account, not to the host. A seat draws from
the account of its provider route: Claude Code and pi with an Anthropic
login share the Claude account; Codex and pi with a ChatGPT login share
the ChatGPT account.

Before each dispatch wave, run `repo-harness quota`. It prints the account
states and one route line per task class. Launch each task on the seat its
route line names with `repo-harness seats argv <seat>`; state the boundary
in the task. A `none` route waits. The frontend class waits for Claude when
its account is tight or exhausted; it has no non-Claude fallback.
Apply the table below to each account. Put the reading in the
`Dispatch reading:` line of each claim of the wave: for each account the
state, used %, pace, reset time and reading time.

For each window (5 h and weekly), elapsed% = 100 × (1 − (resets_at −
now) / window) and pace = used% − elapsed%. The account takes the worst
window state, in the order `exhausted` > `tight` > `unknown` > `normal` >
`surplus`. A window with no reading (absent, stale or malformed) makes the
account `unknown`, unless another window is `exhausted` or `tight`.

| State | Condition | Coordinator action |
|---|---|---|
| exhausted | used ≥ 95%, or `rate_limit_reached_type` set | No new dispatch to that account, review seats included: start no new turn on it. Spend credits only when the owner allows it; otherwise a merge that needs that account's review seat waits for the reset. |
| tight | headroom < 15%, or pace > +15 | Must-ship work only. Halve the writer cap. No stretch work. |
| normal | other | The plan's cap. |
| surplus | pace < −25 and the reset is less than 24 h away | Pull stretch work forward, up to the full cap. |
| unknown | no reading, or a reading older than 30 min | Read by hand before the dispatch. No expansion. |

For an `unknown` Claude account, read it by hand with
`claude -p "/usage" --model haiku --output-format text` from a temporary
directory. It is a local command, and it shows the model rows (for
example Opus or Fable) that the status line capture does not have. Use it
for the manual reading only; no code parses its text. Record the manual
reading and its source in the `Dispatch reading:` line.

Seat model routing follows the repository's or the user's own routing
rule. When an account is `tight` or `exhausted`, defer Medium and High
implementation; do not move it to another provider by default.

## 8. Follow up

Follow the PR and the issue comments. Do not poll CI with sleeps. Use the
host's PR events or check when the worker reports.

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
  failure, and a stale base gets a sync with main. Do not rerun the job
  again.
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
  risk). Send each reviewer the review packet of `acceptor.md` §2.1. Each
  reviewer posts an `acceptance claim` before it reads. Who reviews each
  round, and how many claims a round has, follow `acceptor.md` §2.2.
  Findings take the severities of `acceptor.md` §3. A P3 becomes a
  follow-up issue, not a PR blocker. Send the findings to the worker that
  wrote the PR. You make the second-finding choice of the class rule
  (`worker.md` §7). Record the result in one acceptance record comment on
  the PR, in the row shape of `templates.md`: round, role, subject,
  verdict and model relation.
- **Defensive code.** Reject compatibility branches, fallbacks and
  speculative guards that the issue did not ask for, even when the tests
  pass. Quote the boundary line. This is the most common reason to send a
  PR back.
- **Stalled worker.** Read its last status comment and branch before you
  reassign. A handoff needs a claim comment that cites the prior claim.

### 8.1 Triage queue

Owner messages and worker notices arrive in the same session. Without a
rule, the newest message takes the turn and the owner loses the thread.
Keep the notices in the host's task list tool (on Claude: `TaskCreate`,
`TaskUpdate`, `TaskList`, `TaskGet`; on Codex: its plan tool). A queue item points to
the board. It holds no state of its own, so it cannot drift from the board.

- **Classify the source.** A message whose first line starts with
  `[rh-notice]`, or a `repo-harness.bot-event/v1` event, is a notice. Any
  other message is from the owner.
- **Queue each notice.** A notice does not take over an open owner
  request. When no owner request is open, work the queue in the same
  turn (Work the queue). Keep one item for each issue or PR. The subject is
  `[P<n>] #<number> <kind>`. The description is the comment or event URL,
  or the message text of a simple notice (`worker.md` §7). When the issue
  or PR has an open item, update that item and keep the higher priority.
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
decides whether the executor merges. The default branch needs strict
required checks and enforce_admins, and no merge queue (classic protection
or rulesets). If it does not, the executor refuses with
`base_protection_insufficient`.

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

### 9.1 Choose the mode

Use serial integration (§9.2) when one PR is eligible. When two or more
PRs are eligible at the same time, you may use batch integration (§9.3).
You decide whether to batch, which PRs go in and their order: the plan
block's merge order first. A batch has at most 6 members.

A PR is eligible when all of these are true:

- It is open and not draft.
- Its required checks are SUCCESS on its own head.
- Its tier review passed on a subject SHA, or rule 4 of `acceptor.md`
  §2.2 applies. A Low PR needs no review, but
  its PR body must hold the author verification evidence
  (`docs/reference-configs/agentic-development-flow.md`, Review by risk).
- Its head equals the reviewed subject, or adds only conflict-free merges
  of main since it. `git rev-list --no-merges <subject>..<head> ^origin/main`
  prints nothing.
- It has no unresolved review thread that a person started. A review bot
  thread is advisory input and does not block. For a rule-4 merge, you
  resolve the remaining P2 threads first (`acceptor.md` §6).
- Its closing references are correct.

```bash
gh pr view <p> --json state,isDraft,headRefOid,statusCheckRollup,closingIssuesReferences,reviewDecision
```

### 9.2 Serial integration

Merge in the plan block's merge order. A parent without a plan (two
children or fewer) merges in blocked-by order: a blocker merges before the
issue it blocks. The Order column of the parent table is only a view.
After each merge, the next PR merges or rebases onto the current main. A
PR that passed review on an old base needs its affected checks again on
the new base. It does not need a new full review unless the merge changed
its subject.

### 9.3 Batch integration

The batch branch holds the member merge commits and nothing else. Never
resolve a conflict, push a fix or add a commit of your own in it. Never
merge it by any path other than `repo-harness publication merge`.

1. **Build.** Record each member's eligible head SHA. Create the branch
   from the current main and merge each member in order:

   ```bash
   git fetch origin main
   git worktree add -b integration/<parent>-batch-<n> /tmp/<repo>-wt-batch-<parent>-<n> origin/main
   cd /tmp/<repo>-wt-batch-<parent>-<n>
   git fetch origin refs/pull/<p>/head          # once per member
   git merge --no-ff --no-edit <member head sha>
   ```

   Merge the recorded SHA, not the branch name, so that a later push to a
   member does not enter the batch.
2. **Conflict.** Run `git merge --abort` and drop that member. Post the
   batch-drop `integration status` on its PR to its head owner: sync with
   main, then it joins a later batch. Continue with the next member.
3. **Local check.** Run the repository's typecheck and the test files that
   two or more members change. In repo-harness:

   ```bash
   for p in <member PRs>; do gh pr diff "$p" --name-only; done | grep '^tests/' | sort | uniq -d
   bun run check:type
   bun run test:files <shared test files> --timeout 60000 --max-concurrency 1
   ```

   CI on the batch head is the authority.
4. **Open the batch PR.** Push the branch and open the PR with the batch
   PR body (`templates.md`):

   ```bash
   git push -u origin integration/<parent>-batch-<n>
   gh pr create --base main --head integration/<parent>-batch-<n> --title "chore(integration): merge accepted PRs #<a> #<b> as one batch (#<parent>)" --body-file <file>
   gh pr view <batch> --json closingIssuesReferences
   ```

   The closing references must name each issue that a member closes, and
   nothing else.
5. **Review.** Every member merged without conflict, and the batch adds no
   commit of its own. The batch reuses the member acceptance records and
   needs no new review round. A Low member has no acceptance record to
   reuse (`docs/reference-configs/agentic-development-flow.md`, Review by
   risk).
6. **Red CI.** Do not fix it in the batch branch. Classify the failure
   first; a known flake gets one rerun (§8). Drop the member that changes
   the failing test or the source it covers, and post the batch-drop
   `integration status` on its PR. When you cannot attribute the failure,
   split the members into two halves. Close the red batch PR with
   `gh pr close <batch>`, then rebuild from the current main with the next
   `<n>`: the remaining members, or each half in turn.
7. **Main moved.** When main moves after the build, rebuild from the
   current main with the next `<n>`. Do not merge main into the batch
   branch.
8. **Merge.** Call `repo-harness publication merge --batch` on the batch
   PR with the batch head and the main SHA you built on. The executor
   refuses a head ref outside `integration/<parent>-batch-<n>`
   (`batch_ref_invalid`) and a batch with a commit of its own
   (`batch_has_own_commit`), both with exit 4 and no merge request. It
   merges with a merge commit whose parents are the main SHA and the batch
   head, so each member's commits land on main. Act on the exit code as
   the table above says.
9. **Close out.** After exit 0, on each member PR post the batch-closeout
   `integration status` with the batch merge SHA. Do not close the member
   PRs: GitHub marks each one Merged. The member branch stays. Post
   `unblocked` on each dependent PR.
10. **Rollback.** `git revert -m 1 <batch merge commit>` reverts the whole
    batch. To revert one member, revert its member merge commit on main:
    `git revert -m 1 <member merge commit on main>`.

## 10. Close out

1. All children are closed or explicitly deferred to a linked issue.
2. When module boundaries, APIs or flows changed, the architecture model
   and `docs/architecture/archimap.html` are current (`repo-harness-archimap`).
3. Post a closing comment on the parent: merged PRs, deferred issues,
   remaining risk. Then close it, when the owner's instruction covers
   closing.
4. Add a lesson to `tasks/lessons.md` only for a mistake that repeated or
   that a rule would have prevented.
