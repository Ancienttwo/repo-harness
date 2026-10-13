# Check Reference: PR Verification

Use before the merge of a PR that the current task did not author, such as an
external contributor PR or a PR that another agent opened. The result is a
ready-for-GO bundle. This pass does not merge, push or post.

## Protocol

1. Hazard scan first. Read the full diff before you install or run PR code.
   Stop when the diff:
   - changes `.github/`;
   - changes release or publish scripts, or package scripts that run at install or release;
   - adds or changes a dependency or a lockfile entry;
   - adds a network endpoint;
   - reads credentials, such as tokens, keys, `~/.ssh`, `~/.npmrc` or credential environment variables;
   - adds an encoded or opaque blob, such as base64, long hex, minified or binary content.

   On a stop, report each triggering `file:line`. Do not run the PR on a
   machine with real credentials. Escalate to the repository owner.
2. Check out the PR head in an isolated worktree:

   ```bash
   git fetch origin "pull/<pr>/head"
   head_sha="$(git rev-parse FETCH_HEAD)"
   git worktree add --detach "/tmp/<repo>-pr-<pr>" "$head_sha"
   ```

   Confirm that `head_sha` equals `gh pr view <pr> --json headRefOid`.
3. Run the full test suite and typecheck from the target repo's agent
   instructions. Use a disposable HOME and no credential environment
   variables. Record each command, exit code, output excerpt and log path.
   A failure that also occurs on `origin/main` is still a failure. Do not use
   `origin/main` as an acceptable baseline.
4. Break it on purpose. In the worktree, revert only the non-test files that
   the PR changes: `git checkout <merge-base> -- <fix files>`. Run the
   regression test. It must fail for the expected reason. Restore
   the fix files from `head_sha`, confirm a clean `git status`, and run the test
   again. A test that stays green without the fix does not prove the fix.
5. For a bug fix, confirm two more items:
   - The regression fixture uses the reporter's original input from the issue.
   - The author searched for sibling sites with the same defect shape. The PR
     description lists each sibling and its handling: fixed, not affected with
     a reason, or deferred to a named issue.

   Report a missing item as a gap. Do not fix it unless the task assigns that work.
6. Remove the `/tmp` worktree after the report.

## Ready-for-GO Bundle

- PR number, reviewed head SHA and base SHA.
- Hazard-scan result: clean, or stop with each `file:line`.
- Commands, exit codes, output excerpts and log paths.
- Break-it result: red without the fix, green with the fix.
- Sibling sites, their handling, and open gaps.
- Draft replies for the PR and the linked issue. Mark each reply as a draft.

## Merge

Merge only after the repository owner gives an explicit GO for the reviewed
head SHA. Route the merge to `repo-harness-ship`. It runs
`gh pr merge <pr> --squash --match-head-commit <reviewed-sha>`. A new head SHA
makes the bundle stale; verify again. Do not merge without that GO in the
round that opened or reviewed the PR.

## Boundaries

- Does not run PR code before a clean hazard scan.
- Does not merge or push.
- Does not post replies. Draft replies stay drafts until the owner posts or approves them.
