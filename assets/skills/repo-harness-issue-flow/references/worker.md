# Worker SOP

You deliver one claimed issue, or one named PR slot of it, as one PR. The
issue is your whole brief. The coordinator made the design decisions in
it. Your job is to execute them exactly, prove them and report on the
board. Comment shapes are in `templates.md`. Seat and board rules are in
`board.md`.

## 1. Read and check

1. Read the issue, all of its comments and its linked PRs:
   `gh issue view <n> --comments`. Use `gh api` with pagination for a long
   thread. The latest `scope change` comments amend the body.
2. Check the claims. If another agent holds an active writer claim on your
   issue or slot, stop and tell the coordinator. Do not start duplicate
   work. Silence or an old timestamp does not release a claim.
3. Check the dependencies. Each `Depends on #N` must be merged, unless the
   issue allows early start. With early start, branch from the producer's
   PR head when your code needs its unmerged changes to compile, set your
   PR's base to the producer's branch, and keep the PR draft until the
   producer merges (`board.md`, Topology).
4. Read the files that the issue names, and the module entry in the
   architecture map when the issue cites one. Confirm that they exist at
   the current main. If the issue's "current state" no longer matches main,
   post a `boundary question` before you code.

## 2. Claim

Post an `issue claim` comment with `Seat: writer` (and `Slot:` for a PR
slot), then read it back. Use one stable identity (agent kind plus session
or task ID) in all later comments. Then create the worktree:

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
typecheck and the affected test files, and say so.

## 6. Open the PR

- Title: `<type>(<scope>): <outcome> (#<issue>)`.
- Body: use the PR template. `Closes #<issue>` only when this PR finishes
  the issue. Otherwise use `Refs #<issue>`. List `Depends on #<PR>` for
  each PR that must merge first.
- Open as draft while a dependency is unmerged, otherwise ready.
- Post `issue claim status` with `Status: ready for review; claim remains
  active`, the PR URL, the head SHA and the CI state.

## 7. CI and review loop

You are the head owner. Only you push to this branch.

- **CI red.** Read the failing job log. Fix the cause, not the symptom.
  Rerun a job once only for a failure that the log shows is unrelated to
  your diff (a network timeout, a runner fault), and say so on the board.
  After three failed fix rounds, post `Status: blocked` with the evidence
  and stop.
- **Review threads.** Fix each P1 and P2 in this branch. Reply in the
  thread with the fix SHA. Do not resolve another reviewer's thread. For a
  P3 or a finding that you dispute, reply with your reason and leave the
  disposition to the coordinator.
- **Main moved.** When the coordinator posts `unblocked` or asks for a
  sync, retarget a stacked PR to main, merge the current main into your
  branch (no force push), run the affected checks and post `integration
  status` with the new head, the delta and CI.
- **Never rewrite pushed history.** Other PRs may be stacked on yours.
  Fix review findings with new commits.
- **Someone else must push.** When a repair or integration must come from
  another agent, post a `handoff` that names the next head owner and the
  exact head SHA. Then stop pushing.

## 8. Finish

The coordinator merges. You do not merge unless the issue's claim names
you as integrator under the owner's authorization. After merge:

1. Post `issue claim status` with `Status: done` (or `released`), the PR
   and the merge SHA.
2. Remove your worktree: `git worktree remove /tmp/<repo>-wt-<issue>-<slug>`.
   Then `git worktree prune`.
3. If you lose access before you finish (quota, crash, session end), the
   last thing you do is post a status with the exact state: branch, head
   SHA, what is done, what is left, and the next command. The next writer
   continues from that comment.
