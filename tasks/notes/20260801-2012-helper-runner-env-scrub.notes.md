# Notes: helper-runner-env-scrub

## Where the fix landed, and why not at the injection site

The leak originates in `src/cli/runtime/helper-runner.ts:375-391`, but that
injection is the helper dispatch mechanism's own contract: a package-dispatched
helper needs its source path, target repo root, and trusted tool binaries. The
boundary that was actually missing is one level down — the point where the
harness stops running its own machinery and starts running *the project's*
command to produce evidence about it. That point is
`scripts/run-bounded-verifier-command.ts`'s `spawn`, so the scrub lives there.

## Whole prefix, not a curated list

Stripping only the six variables observed in the repro would leave the next
added `REPO_HARNESS_*` variable to re-open the same hole silently. The invariant
is categorical — harness-internal wiring does not reach the command under
verification — so the filter is the prefix. The runner reads no
`REPO_HARNESS_*` variable itself, so nothing had to be retained for its own use.

## Pre-fix artifact

`tasks/notes/20260801-env-scrub.pre-fix.log` is the captured failing run
(12 pass / 1 fail at `tests/evidence-recovery-materializer.test.ts:220`) taken
on this branch before the change; the same command after the fix returns
13 pass / 0 fail.

## Open, out of scope

`tests/evidence-projection-drift.test.ts:265` fails against this worktree's
gitignored `.ai/harness/checks/latest.json` (written 19:44, before this branch
existed). That is the separately ledgered `verify-sprint.sh:547` provenance
overlay defect in `tasks/todos.md`, untouched here.
