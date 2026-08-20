> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260818-0444-setup-plugins-shift-overrun.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: setup-plugins-shift-overrun

> **Status**: Active
> **Plan**: plans/plan-20260818-0444-setup-plugins-shift-overrun.md
> **Contract**: tasks/contracts/20260818-0444-setup-plugins-shift-overrun.contract.md
> **Review**: tasks/reviews/20260818-0444-setup-plugins-shift-overrun.review.md
> **Last Updated**: 2026-08-18 04:44
> **Lifecycle**: notes

## Design Decisions

- Both overrun sites now read `shift $(( $# >= 2 ? 2 : 1 ))`:
  `scripts/setup-plugins.sh:21` (`--hooks`) and `:25` (`--lsp|--project-type`).
  The arithmetic guard is evaluated before `shift` runs, so the requested count
  never exceeds `$#` and bash 3.2 never returns non-zero into `set -e`. The case
  statement, the branch messages, and `set -euo pipefail` are unchanged.
- The frozen semantic from the contract is implemented as written: a retired
  two-token option in final position logs and continues, exactly as the valued
  form does. No error path was added. `:15`'s `profile="${2:-}"` and `:19`'s
  `<missing>` render already handled the absent value; only the `shift` was
  unguarded.
- The `:38` bun fallback now has execution coverage, closing the gap the previous
  slice recorded in `tasks/notes/20260818-0019-setup-plugins-empty-args.notes.md`.
  The new `setup-plugins bun fallback path` describe block stubs `bun` in its own
  `mkdtemp` dir and rebuilds `PATH` as `${bunStubDir}:/usr/bin:/bin`. Both the
  real `repo-harness` and the real `bun` live in `~/.bun/bin`, which that PATH
  excludes, so `command -v repo-harness` fails at `:34` and the stub `bun` is what
  `:39` execs. `spawnSync` is given `/bin/bash` absolutely because the trimmed
  PATH must not be relied on to resolve the shell; `/usr/bin:/bin` stays on it
  because the script's `dirname` at `:4` is an external binary.
  The contract Stop Condition holds: no test reaches the real installer or the
  real bun entrypoint.
- Three bun-fallback tests passed pre-fix (see the log below). That is the proof
  the block actually reaches `:39` rather than silently re-testing `:35` — under
  the previous shift-2 defect only the `--hooks`-final case in that block failed,
  which is the branch-specific signature, not a stub-resolution artifact.

## Deviations From Plan Or Spec

- None.

## Falsifier Result

Contract falsifier (`## Falsifier`): the guard must not change consumption when
the value is present. `setup-plugins.sh --lsp ts --repo .` must forward `--repo`
and `.` and nothing else — a shift-1 where 2 is correct leaks the stray `ts`, and
because the exit code is 0 in both the correct and the broken version, the
forwarded argument list is the only signal. Verified against the stub on bash
3.2.57(1)-release (arm64-apple-darwin25):

```
$ bash scripts/setup-plugins.sh --lsp ts --repo .
[setup-plugins] retired option ignored: --lsp ts
STUB_ARG:install
STUB_ARG:--repo
STUB_ARG:.
exit=0
```

Three `STUB_ARG` lines, no `ts`. Locked as the test
`still consumes both tokens of the valued --lsp form`, which asserts the full
forwarded array and additionally `expect(res.forwarded).not.toContain("ts")` —
an exit-code-only assertion would have passed a broken fix.

The three reported crash shapes, same run, all now exit 0 and forward correctly:

```
$ bash scripts/setup-plugins.sh --hooks
[setup-plugins] retired hook profile ignored: <missing>
STUB_ARG:install
exit=0
$ bash scripts/setup-plugins.sh --repo . --lsp
[setup-plugins] retired option ignored: --lsp
STUB_ARG:install
STUB_ARG:--repo
STUB_ARG:.
exit=0
$ bash scripts/setup-plugins.sh --repo . --project-type
[setup-plugins] retired option ignored: --project-type
STUB_ARG:install
STUB_ARG:--repo
STUB_ARG:.
exit=0
$ bash scripts/setup-plugins.sh --hooks none        # control
STUB_ARG:install
STUB_ARG:--no-hooks
exit=0
```

Pre-fix evidence: `tasks/notes/20260818-setup-plugins-shift-overrun.pre-fix.log`
(`PRE_FIX_EXIT=1`, 4 fail / 12 pass). The four failures are exactly the three
final-position shapes plus the bun-fallback `--hooks`-final shape; every
two-token control and both bun-fallback base cases already passed pre-fix,
confirming the guard changes only the overrun case.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `shift $(( $# >= 2 ? 2 : 1 ))` at both sites | Chosen | Smallest change; guard is local to the shift, leaves the case statement, messages, and `set -euo pipefail` untouched |
| `shift; shift \|\| true` or `shift 2 \|\| true` | Rejected | Swallows every shift failure including future real ones, and `\|\| true` masks intent rather than expressing the bound |
| Reject the valueless form with a non-zero exit and a usage message | Rejected | Contract `## Semantic decision (frozen)` forbids it: retired options' values are never consumed, so `--lsp ts` and `--lsp` have identical outcomes and a rejection draws a distinction the program does not act on |
| Restructure the parse loop to a `getopts`-style parser | Rejected | Contract taste constraint: keep the loop's shape |

## Out Of Scope / Future Work

Observed during this slice, deliberately not changed.

- **`--hooks` accepts and discards any non-`none` profile silently-ish.**
  `scripts/setup-plugins.sh:14-20` maps only the literal `none` to `--no-hooks`;
  every other value, including a typo like `nome`, takes the retired-profile
  branch and is dropped with a stderr line. A user who typos the profile gets an
  install with hooks enabled and a message that reads like an intentional no-op.
  Whether that should warn more loudly or fail is a product decision about the
  retired surface, which the contract Scope explicitly excludes ("which options
  are retired and what they log"). Needs its own contract if it is worth acting on.
- **The retired `--lsp`/`--project-type` message prints a trailing space when the
  value is absent** (`retired option ignored: --lsp ` — see the repro above,
  from `"$1 ${2:-}"` at `:24`). Cosmetic only; the contract freezes the messages
  verbatim, so it was left alone.

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
