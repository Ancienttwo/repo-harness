> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260818-0019-setup-plugins-empty-args.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: setup-plugins-empty-args

> **Status**: Active
> **Plan**: plans/plan-20260818-0019-setup-plugins-empty-args.md
> **Contract**: tasks/contracts/20260818-0019-setup-plugins-empty-args.contract.md
> **Review**: tasks/reviews/20260818-0019-setup-plugins-empty-args.review.md
> **Last Updated**: 2026-08-18 00:19
> **Lifecycle**: notes

## Design Decisions

- Both forwarding sites (`scripts/setup-plugins.sh:35` repo-harness exec, `:39` bun
  fallback exec) now expand `${args[@]+"${args[@]}"}`, the idiom already used at
  `scripts/ship-worktrees.sh:806`, `:1085`, `:1105`. No fourth pattern invented, the
  arg loop is untouched, and `set -euo pipefail` stays.
- `tests/setup-plugins-structure.test.ts` previously ran only `bash -n` plus three
  file-content string assertions, so nothing executed the script. That is why an
  expansion error reachable only with an empty array survived: syntax checking cannot
  see it. The new `setup-plugins argument forwarding` describe block executes the
  script for real.
- Execution tests resolve a stub `repo-harness` from a `mkdtemp` directory prepended
  to `PATH`. The stub prints `STUB_ARG:<arg>` per argument and exits 0, so
  `command -v repo-harness` short-circuits at line 35 and neither the real
  `repo-harness install` nor the real bun entrypoint is ever invoked — the contract
  Stop Condition forbidding host installs holds.
- The bun fallback at `:39` is not exercised at runtime (reaching it requires
  `repo-harness` absent from PATH, which would then risk the real bun entrypoint).
  It carries the identical guard and stays covered by the existing static assertion.

## Deviations From Plan Or Spec

- None.

## Falsifier Result

Contract falsifier: the guard must not change non-empty forwarding, and an argument
containing a space must stay one argument. Verified against the stub on bash
3.2.57(1)-release (arm64-apple-darwin25):

```
$ bash scripts/setup-plugins.sh --repo "/tmp/a b"
STUB_ARG:install
STUB_ARG:--repo
STUB_ARG:/tmp/a b
exit=0
```

Three `STUB_ARG` lines total, i.e. exactly two arguments after `install`, not three.
Locked as the test `keeps an argument containing a space as a single argument`.

Pre-fix evidence: `tasks/notes/20260818-setup-plugins-empty-args.pre-fix.log`
(`PRE_FIX_EXIT=1`, 2 fail / 6 pass — the two failures are exactly the no-args and
retired-options-only shapes; the non-empty control and the space-argument falsifier
already passed pre-fix, confirming the fix changes only the empty case).

Post-fix runtime repro of both crash paths:

```
$ bash scripts/setup-plugins.sh
STUB_ARG:install
exit=0
$ bash scripts/setup-plugins.sh --lsp ts
[setup-plugins] retired option ignored: --lsp ts
STUB_ARG:install
exit=0
```

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `${args[@]+"${args[@]}"}` guard | Chosen | Already the repo idiom in three places; smallest change; preserves quoting |
| Seed `args=("")` or drop `set -u` | Rejected | Would forward a bogus empty argument or relax a project-wide invariant |
| Restructure the retired-option loop so it always appends | Rejected | Out of scope per contract; changes retired-option behavior |

## Out Of Scope / Future Work

Found during this slice, deliberately not fixed (contract Scope forbids touching the
retired-option loop; this is a separate defect class needing its own contract).

**`shift 2` overruns `$#` at three sites.** When a two-token retired option is the
last argument, `shift 2` has fewer than 2 positional parameters left. Bash 3.2 returns
non-zero from `shift` in that case, and under `set -euo pipefail` the script exits 1
silently — after logging the retired-option message but before reaching either exec.
The three sites are:

- `scripts/setup-plugins.sh:21` — `--hooks`
- `scripts/setup-plugins.sh:25` — `--lsp` and `--project-type` (shared branch)

Reproduced against the stub on bash 3.2.57(1):

```
$ bash scripts/setup-plugins.sh --hooks
[setup-plugins] retired hook profile ignored: <missing>
exit=1
$ bash scripts/setup-plugins.sh --repo . --lsp
[setup-plugins] retired option ignored: --lsp
exit=1
$ bash scripts/setup-plugins.sh --repo . --project-type
[setup-plugins] retired option ignored: --project-type
exit=1
$ bash scripts/setup-plugins.sh --hooks none        # control
RH_ARG:[install]
RH_ARG:[--no-hooks]
exit=0
```

The `--repo . --lsp` case is the damaging one: a real argument was parsed and would
have been forwarded, but the script dies before exec, so the caller sees a retired-option
warning and a silent failure rather than an install.

**Bun fallback (`:39`) has no execution test.** Reaching it requires `repo-harness`
absent from PATH, which risks invoking the real bun entrypoint. It carries the identical
guard and was verified manually. An automated test is cheap — put a `bun` stub in the
temp dir alongside the `repo-harness` stub and build a PATH that excludes both the real
`repo-harness` and `~/.bun/bin`. Left to the `shift 2` slice.

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
