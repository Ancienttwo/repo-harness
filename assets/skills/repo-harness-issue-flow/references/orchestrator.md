# Orchestrator SOP

You turn one goal into a parent issue and a set of child issues. You
dispatch workers, follow their PRs to merge and close the parent. You do
not implement child issues. Seats, dependencies and the comment board are
in `board.md`. Body and comment shapes are in `templates.md`.

Post your own `issue claim` with `Seat: coordinator` on the parent before
you dispatch. Every later instruction to a worker is a comment on its
issue or PR.

## 1. Preflight

1. Read the goal source: the user's request, a PRD, a design document or
   an existing parent issue. Note the requirement and scenario IDs. Issues
   cite them, so that acceptance can be traced.
2. Read the module map. Prefer `docs/architecture/archimap.html`. If the
   map is missing or older than the architecture model, refresh it first
   with the `repo-harness-archimap` skill. A split that is made against a
   stale map puts module boundaries in the wrong place.
3. Read the open issues and PRs in the area (`gh issue list`, `gh pr list`,
   then `gh issue view <n> --comments`). Record each active claim, linked
   PR and handoff. Reuse existing issues. Never open a duplicate for work
   that someone has already claimed.
4. Pin the base. Record `main@<short-sha>` for every "current state"
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
- **Reviewable size.** One PR, about 10 implementation files or fewer. A
  larger issue becomes a parent issue with its own children, or one issue
  with numbered PRs (PR-1a, PR-1b) that the issue names in advance.
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

## 4. Parent issue

The parent issue holds the goal, the child table, the merge order and the
done criteria. Use the parent template. Keep the table current. Edit the
status column when a child changes state, so that the parent is one
screenful of truth.

Write each dependency as a line `Depends on #N` in the child's `依赖 /
Depends on` section, so that a search can find it. Add `(closed)` when the
dependency is merged. When the repository uses GitHub sub-issues, also link
each child to the parent. The body lines are still required, because
agents read the body text.

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
the host's cross-model channel (for example a Herdr pane with Codex).
Record the review in the parent issue as one comment that lists the
findings and the disposition of each.

## 6. Publish

1. Write each body to a file in your scratch directory and create it with
   `gh issue create --title <title> --body-file <file>`. Never build bodies
   with shell interpolation.
2. Create children in dependency order, then edit the parent table with the
   real numbers (`gh issue edit <parent> --body-file <file>`).
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
- Dispatch in parallel only when the write scopes are disjoint and each
  dependency is merged, or its contract is stable and the issue allows
  early start.
- Each parallel worker gets its own worktree from a clean base.
- Match the model to the issue. Give a weaker or over-defensive model the
  issues with the tightest boundaries and the clearest acceptance checks.
  Keep contract-design issues for a strong model.
- Use the host's dispatch mechanism (a Herdr pane, a Claude session, a
  Codex subagent). A dispatch does not grant publication, deletion or
  credential authority.

## 8. Follow up

Follow the PR and the issue comments. Do not poll CI with sleeps. Use the
host's PR events or check when the worker reports.

- **CI red.** The worker owns the fix. Send the failing job name and the
  log excerpt to that worker, because it has the context. Allow one rerun
  for a known flake.
- **Boundary question.** Decide fast. Either amend the issue (edit the body
  and post a `scope change` comment that says what changed and why), or
  open a new issue for the extra work and keep the PR narrow. Never let the
  worker widen the PR without an issue change.
- **Review.** Select the review depth by the diff's risk tier. Each
  reviewer posts an `acceptance claim` for its round and subject SHA before
  it reads, so that two reviewers do not take the same round. Classify
  findings:
  - P1 — wrong behavior or broken boundary: fix in this PR.
  - P2 — real defect, small: fix in this PR, or defer with an issue link.
  - P3 — improvement: becomes a follow-up issue, not a PR blocker.
  Send the findings to the worker that wrote the PR. Record the result in
  one acceptance record comment on the PR: round, reviewer, subject SHA,
  verdict.
- **Defensive code.** Reject compatibility branches, fallbacks and
  speculative guards that the issue did not ask for, even when the tests
  pass. Quote the boundary line. This is the most common reason to send a
  PR back.
- **Stalled worker.** Read its last status comment and branch before you
  reassign. A handoff needs a claim comment that cites the prior claim.

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

`--head` and `--base` are the SHAs you reviewed. The MCP tool
`merge_pull_request` (profile `orchestrator`) calls the same executor.
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

- Merge in the parent's order. After each merge, the next PR merges or
  rebases onto the current main. A PR that passed review on an old base
  needs its affected checks again on the new base. It does not need a new
  full review unless the merge changed its subject.
- Use `Closes #N` only in the PR that finishes the issue. Earlier PRs of a
  multi-PR issue use `Refs #N`. Before merge, check
  `gh pr view <n> --json closingIssuesReferences`. An edited body can keep
  an old closing link. The executor also checks the closing references and
  refuses with `closing_references_mismatch`, also for a closing keyword
  that targets a pull-request URL.

## 10. Close out

1. All children are closed or explicitly deferred to a linked issue.
2. When module boundaries, APIs or flows changed, the architecture model
   and `docs/architecture/archimap.html` are current (`repo-harness-archimap`).
3. Post a closing comment on the parent: merged PRs, deferred issues,
   remaining risk. Then close it, when the owner's instruction covers
   closing.
4. Add a lesson to `tasks/lessons.md` only for a mistake that repeated or
   that a rule would have prevented.
