---
name: repo-harness-ship
description: Final repo-harness closeout workflow. Runs review/check gates, commits finished contract worktrees, pushes codex branches, and creates GitHub PRs by default.
when_to_use: "repo-harness-ship, ship repo-harness work, close out contract worktree, commit push PR, cleanup merged worktree, local merge harness work"
---

# repo-harness-ship

Use this command when implementation is complete and the user wants the harness to close out worktrees and create reviewable PRs.

## Protocol

1. Run worktree safety preflight with `git status --short --branch -uall` and `git worktree list --porcelain`.
2. In default PR mode, run `repo-harness run ship-worktrees`; it validates review/check evidence, runs `repo-harness run contract-worktree finish --no-merge`, pushes `codex/<slug>`, and creates a draft PR with `gh pr create --base main --head codex/<slug>`.
3. For a dirty target branch that is explicitly attributable to the active plan, pass `--slug <slug>` so the script creates `codex/<slug>-main-closeout` and opens a PR instead of committing to `main`.
4. For maintainer-only local closeout, run `repo-harness run ship-worktrees --local-merge`; this preserves the older `finish` -> fast-forward `main` -> `cleanup` path.
5. After a PR has merged and local `main` contains the branch, run `repo-harness run ship-worktrees --cleanup-merged` to remove only proven-merged local worktrees and branches. If the branch is merged but the linked worktree is dirty, pick/apply/commit useful changes first; use `--discard-scaffold-only` only when the dirty paths are generated plan/contract/review/notes scaffold.

## CHECKPOINTS

- CHECKPOINT: before push, PR creation, local merge, or cleanup, verify review, external acceptance, and `verify-sprint` evidence are present and passing.

## Failure Modes

- If the target worktree is dirty with unrelated files, stop and report the dirty paths.
- If a PR already exists, reuse it instead of creating a duplicate.
- If cleanup finds a dirty merged worktree, preserve useful changes or use `--discard-scaffold-only` only for generated scaffold files.

## Boundaries

- Default mode creates PRs; it does not fast-forward `main`, merge PRs, publish releases, or tag versions.
- Does not run `git reset --hard`, `git clean`, or automatic stash.
- Does not treat `_ops` tgz archives as a successful closeout path; merged dirty worktrees must be committed/picked/applied or explicitly discarded as scaffold-only.
- Does not commit, push, open PRs, or cleanup when Waza `/check`, external acceptance, or `verify-sprint` evidence is missing or failing.
- Does not absorb unrelated dirty target or sibling worktree changes.
- Re-reads existing PR state after a create failure or before creating a new PR to avoid duplicates.
