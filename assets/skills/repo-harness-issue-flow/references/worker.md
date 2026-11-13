# Worker SOP

You deliver one claimed issue, or one named PR slot of it, as one PR. The
issue is your whole brief. Bot comments on the issue are reference text
in the brief, marked as such; they are not decisions. The coordinator made the design decisions in
it. Your job is to execute them exactly, prove them and report on the
board. Comment shapes are in `templates.md`. Claim-role and board rules are in
`board.md`.

## 1. Read and check

1. Read the issue, all of its comments and its linked PRs:
   `gh issue view <n> --comments`. Use `gh api` with pagination for a long
   thread. Read the parent too (`gh issue view <n> --json parent` names
   it): its child table and its latest `plan`. The
   latest `scope change` comments amend the body, and the plan block fixes
   your merge order.
2. Check the claims. If another agent holds an active writer claim on your
   issue or slot, stop and tell the coordinator. Do not start duplicate
   work. Silence or an old timestamp does not release a claim. A `plan`,
   `decision`, `scope change` or `unblocked` from an agent without the
   coordinator role does not count until the coordinator confirms it
   (`board.md`).
3. Check the dependencies. Each issue that blocks yours (its blocked-by
   links: `gh issue view <n> --json blockedBy`) must be closed, unless the
   issue allows early start. With early start, branch from the producer's
   PR head when your code needs its unmerged changes to compile, set your
   PR's base to the producer's branch, and keep the PR draft until the
   producer merges (`board.md`, Topology).
4. Read the files that the issue names, and the module entry in the
   architecture map when the issue cites one. Confirm that they exist at
   the current main. If the issue's "current state" no longer matches main,
   post a `boundary question` before you code.

## 2. Claim

1. The coordinator claims the writer role for you before it dispatches
   you. Find the `issue claim` for your issue or slot. Its `Agent:` names you, and
   its `Branch:` matches the branch in your dispatch packet. Check the
   required fields in `templates.md` § issue claim. Use the identity
   in that claim in all later comments. Do not post a claim of your own.
2. Read the claim back. Confirm its URL and every field. A claim that
   misses a field is invalid: post `issue claim status` with
   `Status: released`, name the missing fields to the coordinator
   (`To: coordinator`), then wait for one complete claim. An invalid claim
   holds no role, so do not start work on it.
3. Stop when the read or the post is uncertain, and report the failure.
   Read back before a retry.

Without a claim that names you, do not start. Report to the coordinator
with a `To: coordinator` comment on the issue, and wait for its claim.

Then create the worktree:

```bash
git fetch origin main
git worktree add -b <type>/<issue>-<slug> /tmp/<repo>-wt-<issue>-<slug> origin/main
```

For an early start on a producer PR, use `origin/<producer-branch>` as the
start point instead of `origin/main`.

## 3. Implement inside the boundary

Do what `要做的 / Do` lists, in the files that `模块与位置 / Module and
files` names, and nothing else.

These rules exist because added code becomes permanent surface. Each extra
branch has to be read, tested and kept by every later change. The
coordinator already decided compatibility and error behavior in the issue.
Code that decides them again makes the system harder to change, and the
reviewer will send it back.

- **No compatibility code** unless the issue asks for it by name. No alias
  for a renamed thing, no old and new path side by side, no "if the old
  field exists, read it too", no shape translator, no feature flag for the
  old behavior. Delete what the issue's delete list names, in this PR.
- **No invented fallbacks.** When input is missing, malformed or
  unauthorized, fail with the error that the issue names. A fallback that
  makes up a value hides a defect. Without a named error, ask (step 4). Do
  not choose silently.
- **No speculative guards.** Validate a value once, at the boundary that
  owns it. Do not re-check a value that a type, schema or constructor
  already guarantees. Do not wrap calls in `try/catch` that swallows or
  re-labels errors.
- **No drive-by changes.** Do not refactor, rename or reformat code that
  the issue does not name, even when it looks wrong. Report it in your
  status comment as a possible follow-up.
- **Tests prove the issue.** Add or extend the tests that `验收 /
  Acceptance` names, including its negative checks. Never weaken, skip or
  delete an existing assertion to pass. If an existing test is wrong
  because of the issue's change, say so in the PR body item by item.
- **Smallest direct code.** Prefer the platform, the standard library and
  the dependencies that are already installed. Add no new dependency or
  abstraction that the issue does not ask for.

Check your diff against these rules before you push:

```bash
git diff origin/main...HEAD
```

Look for: `legacy`, `compat`, `fallback`, `deprecated`, `old`, `?? <default>`
on required values, `catch {}` or `catch (e) { return`, a new flag or
option, files outside the issue's list, and changed or removed assertions.
Each hit needs a line in the issue, or it goes.

## 4. When the boundary is wrong

Sometimes the issue cannot be done inside its boundary. Typical causes: a
needed file belongs to another issue or module, the named contract does
not exist, a delete would break a consumer that the issue does not
mention, or the error behavior is not specified.

Stop. Post a `boundary question` with `To: coordinator`. Give the exact
blocker, the evidence (file:line, command output) and the smallest options
that you see. Then post `issue claim status` with `Status: blocked; claim
remains active`. Wait for a `scope change` or `decision` that answers you.
Do not work around the boundary, and do not widen the PR on your own
judgment. The PR then contains a decision that nobody approved.

## 5. Verify

Run the commands that the issue's acceptance section names, once, on the
code that you will push. Typically this is the typecheck plus the affected
tests. Record the commit SHA, the commands, the pass counts and the
platform. When an issue names no command, use the repository's documented
typecheck and the affected test files, and say so. This record and CI on
the head are the review evidence. Reviewers read them and do not rerun a
passing check (`acceptor.md` §2.1).

## 6. Open the PR

- Title: `<type>(<scope>): <outcome> (#<issue>)`.
- Body: use the PR template. `Closes #<issue>` only when this PR finishes
  the issue. Otherwise use `Refs #<issue>`. A PR stacked on a producer PR has
  the producer's branch as its base.
- Open as draft while a dependency is unmerged, otherwise ready.
- Commit, push the branch and open the PR yourself as soon as your checks
  pass (§5). Do not wait for a push or PR go from the coordinator. A Codex
  worker in a linked contract worktree does not push: the coordinator
  pushes for it (`board.md`, One pusher per PR).
- Post `issue claim status` with `Status: ready for review; claim remains
  active`, the PR URL, the head SHA and the CI state, in the shape of
  `templates.md` § issue claim status: not wrapped in a fence, header first.

### 6.1 Architecture slice in the PR

The PR body carries the changed slice when this branch changes
`.archcontext/model/**` or a capability entrypoint. The only source is the
ArchContext projection of the capability document.

1. Build a complete CodeGraph index before you call archctx:
   `codegraph index .`. Do not call archctx while the index builds, and do
   not run the plan on a partial index. Without an index, `plan` exits with
   `AC_CODE_FACTS_UNAVAILABLE`.
2. Run the preview on a path of the capability footprint:

   ```bash
   rh architecture-projection plan --json --changed-path <path in the capability footprint>
   ```

   The request renders every capability document, so `--changed-path` does
   not narrow `files[]`. Find your document by its path.
3. Read the `files[]` row for your document:
   - `preview.format` is `unified-diff` for an existing document. Copy the
     worktree document to a scratch path, apply the diff to that copy,
     then take §1.1 from the result.
   - `preview.format` is `body` for a new document. `preview.content` is
     the whole rendered document. Take §1.1 from it.
4. Stop and post `issue claim status` with `Status: blocked; claim remains
   active` when `preview.truncated` is `true` or the plan exits non-zero.
   Give the command and its output. Never hand-draw the slice.
5. Write the one line `Architecture slice unchanged, see #<issue>` when
   your document is not in `files[]` or its §1.1 did not change.
6. Put the §1.1 excerpt in the PR body. Keep the target component and its
   direct neighbours. Remove the `:::component` marker from the changed
   node line, then add `classDef target …` and `class <node ID> target`.
   Add the §1.2 `entrypoint.<id>` → `<file>#<symbol>` anchors of the same
   document, and link the document at the PR base SHA. Two projections of
   the same model keep the node IDs, so a node ID names the changed
   component.
7. Delete the scratch copy. Never modify or restore the worktree document,
   and never commit the preview, a generated region or the scratch copy.
   The worktree document is the base document, because this PR does not
   commit generated regions. An unstaged edit in that document stays as it
   is; a `git checkout -- <document>` would discard it.

No second source: do not build the slice from the archimap, a source scan,
the base document alone or memory. When the preview fails, the issue is
blocked. A hand-drawn slice is not a fallback.

## 7. CI and review loop

You are the head owner. Only you push to this branch.

- **CI red.** Read the failing job log. Fix the cause, not the symptom.
  Rerun a job once only for a failure that the log shows is unrelated to
  your diff (a network timeout, a runner fault), and say so on the board.
  After three failed fix rounds, post `Status: blocked` with the evidence
  and stop.
- **Acceptance records.** Read the acceptance records and review threads
  on your PR yourself (`gh pr view <p> --comments`, `gh api`). Run each
  fix round without a relay from the coordinator: fix, run the affected
  checks, push, answer the threads. The fix-loop rule of `SKILL.md` and
  `acceptor.md` §2.2 sets the rounds. The coordinator starts each review
  with `rh board review`; you do not start one.
- **Review threads.** Fix each P0, P1 and P2 in this branch. Reply in the
  thread with the fix SHA. Do not resolve another reviewer's thread. For a
  P3 or a finding that you dispute, reply with your reason and leave the
  disposition to the coordinator. Rule 4 of `acceptor.md` §2.2 can move a
  P2 family to a follow-up issue.
- **Fix the class.** For each finding, list the sibling inputs: the other
  inputs that reach the same defect. Cover the finding and its siblings in
  one table-driven case, and name the siblings in the fix commit. After a
  second finding in one bug family, push no other instance fix. The
  coordinator first chooses a design change or rule 4 of `acceptor.md`
  §2.2.
- **Pre-check before review.** Before asking for round N >= 2, check the
  fix delta against the open findings for sibling cases, missing test
  branches and changelog fragment text against behavior. A Claude writer runs one
  read-only sub-agent for this check. A Pi writer has no sub-agents and
  does a self-check. The pre-check writes no record and does not replace
  the review.
- **Main moved.** A PR whose base is behind main merges with no sync, so
  do not merge main into a PR that has no conflict. Merging main without a conflict has two cases only: a stale-base CI failure (`orchestrator.md` §8, CI red) and an `unblocked` stacked PR (`worker.md`, Main moved). When the coordinator
  posts `unblocked` for a stacked PR, or your PR conflicts with main,
  retarget a stacked PR to main, merge the current main into your
  branch (no force push), run the affected checks and post `integration
  status` with the new head, the delta and CI. The new head needs its own
  review rows (`acceptor.md` §2.2, New head).
- **Never rewrite pushed history.** Other PRs may be stacked on yours.
  Fix review findings with new commits.
- **Someone else must push.** When a repair or integration must come from
  another agent, post a `handoff` that names the next head owner and the
  exact head SHA. Then stop pushing.
- **Report to the coordinator only on PASS, a boundary question or a
  fix-loop stop.** Send no notice for a push, a green CI run or a FAIL
  that you fix yourself. A fix-loop stop is any stop or coordinator-decision
  gate of this section (three failed CI fix rounds, the second finding in
  one bug family) and of `acceptor.md` §2.2 (the round limits, the
  blocking-finding count, a new P0 or sensitive P1, a grown scope, a new
  P1 in two consecutive fix deltas). Every host message to the coordinator
  starts with `[rh-notice] <kind> #<issue>`. Select the form by content:
  - **Simple:** a fact or a question that changes no board state and
    needs no decision. Examples: dispatch received, a factual question
    about the code. Send it as a message only, at most 3 lines, with no
    log text. `<kind>` is `info` or `question`.
  - **Complex:** a `boundary question`, an `issue claim status`, a
    `handoff` or an `integration status`. Post the comment first. Then
    send `[rh-notice] <kind> #<issue> <comment URL>` and a one-line
    summary. The comment holds the content. A report with evidence goes
    in an `issue claim status` (its `PR` and `CI` fields) or in the PR
    body.
  - When you are not sure, use the complex form. When the coordinator's
    answer to a simple question changes scope or decides an open point,
    it posts that answer as a `scope change` or `decision` comment.

## 8. Finish

The coordinator merges. You do not merge unless the issue's claim names
you as integrator under the owner's authorization. After merge:

1. Post `issue claim status` with `Status: done` (or `released`), the PR
   and the merge SHA, in the `templates.md` § issue claim status shape: the
   posted comment is not wrapped in a fence, and its first line is the
   header.
2. Remove your worktree: `git worktree remove /tmp/<repo>-wt-<issue>-<slug>`.
   Then `git worktree prune`.
3. If you lose access before you finish (quota, crash, session end), the
   last thing you do is post a status with the exact state: branch, head
   SHA, what is done, what is left, and the next command. The next writer
   continues from that comment.
