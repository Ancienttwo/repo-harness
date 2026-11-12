# Seat handoff, 2026-11-12 (machine move)

Draft PR, not for merge. It carries the advisor seat state of repo-harness from the host "Max" to another machine (owner, 2026-11-12T15:44Z). Close the PR and delete the branch after the new machine has read it.

## Files

| File | Purpose |
|---|---|
| `advisor-handoff.md` | The advisor seat handoff: role, hard rules, state at 15:46Z, work in progress, owner items, next actions. |
| `orchestrator-handoff.md` | The orchestrator seat handoff (added by the orchestrator). |
| `REVIEW-PROCEDURE.md` | The 2-hour periodic review procedure of the advisor. |
| `plans/20261112-2343.md` | The last advisor plan. |
| `changelog-fragments.md` | The design of #2660 (PR #2668 is in its fix rounds). |
| `tools/*.sh` | Read-only probe tools of the advisor. They read the checkout from `REPO_HARNESS_CHECKOUT` (default `$HOME/Projects/repo-harness`). |

## Restore on the new machine

Run from the checkout of this branch, in `tasks/handoff-2026-11-12/`:

```sh
mkdir -p /tmp/repo-harness-advisor/plans /tmp/repo-harness-advisor/probe /tmp/repo-harness-advisor/drafts /tmp/repo-harness-advisor/backup
mkdir -p /tmp/repo-harness-seats/1186405141/advisor /tmp/repo-harness-seats/1186405141/orchestrator
cp REVIEW-PROCEDURE.md plans/*.md /tmp/repo-harness-advisor/plans/
cp tools/*.sh /tmp/repo-harness-advisor/probe/
cp changelog-fragments.md /tmp/repo-harness-advisor/drafts/
cp advisor-handoff.md /tmp/repo-harness-seats/1186405141/advisor/handoff.md
cp orchestrator-handoff.md /tmp/repo-harness-seats/1186405141/orchestrator/handoff.md
```

Then start each seat with `repo-harness seats argv <seat> --repository-id 1186405141` and give it the resume prompt: "Read /tmp/repo-harness-seats/1186405141/<seat>/handoff.md, then check the current state with git/gh and continue."

## Not in this PR

- Credentials and `~/.repo-harness/config.json` (the seats configuration; the owner sets it on the Seats page of the new machine).
- The Claude memory directory of Max. The standing owner rules from it are in `advisor-handoff.md`, section "Hard rules".
- The backups under `/tmp/repo-harness-advisor/backup/` on Max, including the JSON of ruleset 27014440 (the rollback input of the #2462 cutover).
- Worker worktrees. Each writer pushes its branch before the move; a branch that exists only on Max is lost at a `/tmp` cleanup.

## Checks on the new machine before the first dispatch

`repo-harness --version`, `hc --help`, `gh auth status`, `repo-harness quota`, `git fetch origin && git log --oneline -5 origin/main`.
