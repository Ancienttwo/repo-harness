> **Archived**: 2026-08-21 04:26
> **Related Plan**: plans/archive/plan-20260821-0303-bun-14-upgrade-take2.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260821-0426

# Implementation Notes: bun-14-upgrade-take2

> **Status**: Active
> **Plan**: plans/plan-20260821-0303-bun-14-upgrade-take2.md
> **Contract**: tasks/contracts/20260821-0303-bun-14-upgrade-take2.contract.md
> **Review**: tasks/reviews/20260821-0303-bun-14-upgrade-take2.review.md
> **Last Updated**: 2026-08-21 03:03
> **Lifecycle**: notes

## Design Decisions

- The hook executor under test is `scripts/run-skill-hook.ts` (`executeHookScript`, the child-stdin write/end at the former lines 130-131). The EPIPE filter is attached as `child.stdin.on("error", rethrowNonEpipeStdinError)` immediately before the write; the spawn, the `close` handler, and the exit-code semantics are untouched.
- Regression test payload is 128 KiB (`"x".repeat(128 * 1024)`). A small context can be absorbed whole by the kernel pipe buffer (64 KiB on Linux) and never touches the closed pipe, which would make the guard pass for the wrong reason. Oversizing the payload forces the write to reach the closed fd.
- Slice 2 was re-applied by replaying `git show b6dee923 -- <paths> | git apply --3way` for `.github/workflows/ci.yml`, `package.json`, `tests/harness-benchmark-matrix.test.ts`, and `bun.lock`. All four applied cleanly, and `bun install --frozen-lockfile` afterwards produced no lockfile churn, so the replayed lock matches what Bun 1.4.0 resolves for the bumped ranges.
- Linux verification mounts a fresh `git clone` of this branch into the container instead of the live worktree. The container's `bun install --frozen-lockfile` would otherwise overwrite the host `node_modules` with linux-x64 binaries and corrupt the macOS side of the same gate.

## Deviations From Plan Or Spec

- Frozen decision 1 describes an inline stdin error listener. The filter is instead a named, exported one-line function `rethrowNonEpipeStdinError` in the same module (`scripts/run-skill-hook.ts`). Reason: exit criterion 5 requires the tolerance to be *provably* scoped by a named test, and a non-EPIPE stdin stream error cannot be injected through `executeHookScript`'s public surface without monkeypatching the child process. Exporting the predicate makes both lanes directly assertable (`rethrowNonEpipeStdinError absorbs EPIPE and propagates every other code`) while keeping production behavior identical to the inline form: EPIPE returns, anything else throws at the emit site exactly as an unhandled `error` event did before.
- Slice 5 (land on main) is deliberately not executed here. The branch stops at Linux-green + pushed; the merge runs through the gatekeeper acceptance chain.
- Frozen decision 2 expected the close-stdin-immediately test to be the regression guard. On Linux it is not the discriminating one: `executeHookScript succeeds when the script closes stdin without reading` passes even against the pre-fix executor, because `exec 0<&-` inside bash still leaves the write end alive long enough for the buffered write to be accepted. The test that actually reproduces CI run 32404506563 is the pre-existing `executeHookScript runs a successful script` (script exits before reading, teardown hits the closed pipe). Both lanes are kept: the pre-existing test is the repro, the new one covers the explicit-close case, and `rethrowNonEpipeStdinError absorbs EPIPE and propagates every other code` is the scoping guard for exit criterion 5.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Inline anonymous stdin error listener | Rejected | Non-EPIPE lane becomes untestable, leaving exit criterion 5 unsatisfiable by anything but code inspection |
| Resolve the hook as `success: false` on non-EPIPE stdin errors | Rejected | Changes hook outcome semantics beyond frozen decision 1, which requires other errors to propagate as before |
| `bun update` to regenerate `bun.lock` from scratch | Rejected | Replaying the reverted lock and confirming it with `--frozen-lockfile` proves the same resolution while keeping the diff byte-identical to the approved-and-reverted intent |
| Mount the live worktree into the Linux container | Rejected | Container `bun install` replaces host `node_modules` with linux binaries mid-gate |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Linux verification (slice 4), all against a throwaway clone of `6fb4eefa` mounted at `/repo`:
  - `node:24-trixie` + `bun@1.4.0`, linux/arm64 — `bun test tests/skill-hooks.test.ts tests/harness-benchmark-matrix.test.ts --timeout 60000` -> **54 pass, 0 fail**, exit 0.
  - `oven/bun:1.4`, `--platform linux/amd64` (CI arch) — `bun test tests/skill-hooks.test.ts` -> **23 pass, 0 fail**, exit 0.
  - Load-bearing proof on the same linux/amd64 image with `scripts/run-skill-hook.ts` reverted to its pre-fix state: `executeHookScript runs a successful script` fails with `EPIPE: broken pipe, send / syscall: "send" / errno: -32` thrown from `internal:streams/writable:601` -> `_destroy` -> `end`, i.e. the exact CI run 32404506563 signature. 21 pass, 1 fail, exit 1.
  - A first arm64 pass on the bare `oven/bun:1.4` image showed 4 benchmark failures that are container-environment gaps, not product: `npm` absent from the bun image (`packs exactly one external immutable runtime artifact`, `reuses one packed artifact`), no git identity so `git commit` returns 128 (`workspace overlays share no mutable Git objects`), and process-group teardown without PID-1 reaping (`provider deadline terminates a detached process group`). Supplying node 24 + npm, a git identity, and `docker run --init` clears all four.
- macOS full suite: `bun test --timeout 60000` -> 2760 pass, 1 skip, 0 fail, exit 0 (`/tmp/bun14-redo-fulltest.log`, 842.91s).

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
