# Implementation Notes: harness-kernel-optimization-phase2

> **Status**: Active
> **Plan**: plans/plan-20260713-1202-harness-kernel-optimization-phase2.md
> **Contract**: tasks/contracts/20260713-1202-harness-kernel-optimization-phase2.contract.md
> **Review**: tasks/reviews/20260713-1202-harness-kernel-optimization-phase2.review.md
> **Last Updated**: 2026-07-13 13:45
> **Lifecycle**: notes

## Design Decisions

### Phase A1 — apply_patch full-batch scope

- Stop condition check (recursive payload losing the original patch command): confirmed **not triggered**. `expanded_payload` at `assets/hooks/pre-edit-guard.sh:28` (unchanged by this fix) already embeds `tool_input.command` alongside `tool_input.file_path` on every recursive expansion, so `resolve_edit_workflow_profile()` can always re-derive the full path set via `hook_get_apply_patch_paths` inside the same process (stdin is cached per-process by `hook_read_stdin_once`, so re-reading `.tool_input.command` there is free). Kept a defensive fallback to `$FILE_PATH` if re-extraction ever yields zero paths, so the code never crashes even though this branch is structurally unreachable today.
- `--profile` is added to the `args` array before the variadic `--target-path "${target_paths[@]}"` (which is now always last), per the dispatch's explicit ordering constraint, to avoid any risk of commander's variadic consumption swallowing a later flag.
- Non-patch (plain Edit/Write) calls are untouched: `target_paths` only gets the batch treatment when `REPO_HARNESS_APPLY_PATCH_PATH_EXPANDED=1` **and** `.tool_input.command` is non-empty; otherwise it falls back to the single `$FILE_PATH`, exactly as before.
- Test placement: the six batch-scope integration cases went into `tests/runtime-profile-enforcement.test.ts` as instructed. Test (e) (strict-category leak) had to order the plain implementation path *before* the strict-category path in the patch text — `is_private_ops_path`/profile-resolution ordering means the recursion checks paths in patch order and exits on the first failure, so to prove the *sibling* gets promoted (not just the strict file itself, which was already strict pre-fix), the sibling must be checked first. The assertion pins the exact `StrictContractGuard` message text (`Strict workflow edit to src/plain1.ts has no active contract.`), which only appears post-fix.
- **Found and fixed a real fallout in a pre-existing test** (not one of the six new cases): `Codex apply_patch expands every target path and blocks high-risk or private writes` (existing test, same file) patched `src/safe.ts` before `_ops/secret.txt`. Post-A1, the batch-wide strict-token scan sees `_ops/secret.txt`'s "secret" token and promotes `src/safe.ts` to strict too, so it now fails on `SpecGuard` (no `docs/spec.md` in the fixture) *before* the loop ever reaches `_ops/secret.txt`'s own dedicated `OpsPrivateGuard` check. This is the intended, plan-documented consequence of A1 (risk #2, "A1 over-promotion": raise-only, never lowers). Fixed by reordering that patch so `_ops/secret.txt` is checked first — `is_private_ops_path` is a pure path match evaluated before profile resolution, so it now fires independent of batch-scope ordering effects. The write is still blocked (exit 2) either way; only the guard name that fires first changed.
- TDD evidence: pre-fix run of the six new cases (`.ai/harness/runs/phase2-a1-prefix-failure.txt`, `PRE_FIX_EXIT=1`) shows b/c/d/e/f failing (5 fail, 6 pass) and (a) already passing — matches the plan's live-repro description exactly (3-file batches were never broken; 4-file / cross-capability / strict-leak batches were).

### Phase A2 — single-field `state resolve` output

- Confirmed `assets/hooks/post-edit-guard.sh` has **no** `state resolve` call and no `workflow_profile` parsing at all (`grep` for both terms returns zero matches) — so A2 only touches `pre-edit-guard.sh` and `src/cli/commands/state.ts`, not `post-edit-guard.sh`.
- Confirmed the only consumer of `resolve_edit_workflow_profile()`'s stdout is the single assignment `WORKFLOW_PROFILE="$(resolve_edit_workflow_profile || true)"` — no other field from the JSON is read by the guard — so `--field workflow_profile` alone is sufficient; no other fields needed projecting.
- `--field <name>` is a pure output projection on `state resolve --json` (resolver untouched): prints the raw string for string fields (matching the old `jq -r '.workflow_profile // empty'` behavior byte-for-byte, including printing nothing for `null`/`undefined`), or `JSON.stringify` for non-string fields (covered by a test using `blockers`, an array). An unknown field name prints nothing and still resolves + persists state underneath (also covered by a test) — it does not error, matching the fail-open-on-output/fail-closed-on-exit-code posture of the rest of this command (exit code is still `blockers.length > 0 ? 1 : 0` regardless of `--field`).
- With `--field workflow_profile` in place, the old `if command -v jq ... elif command -v bun -e ...` block in `pre-edit-guard.sh` is dead code and was deleted outright (not kept as a fallback) — the CLI now always returns exactly the projected value in one call, so there is nothing left to parse.
- Test placement: `tests/cli/state-snapshot.test.ts` actually tests the *separate* `state-snapshot` (singular) hook-entry command via `hook-entry.ts`, not `state resolve`. `tests/effective-state.test.ts` is the file that already exercises `state resolve --json` through the real CLI (`runCli` helper, previously unused/dead code — now exercised by the new tests), so the four new `--field` cases went there instead, per the dispatch's "or a nearby test file" allowance.
- Perf verification caveat: `jq` is installed on this dev host (`/usr/bin/jq`, jq-1.7.1), so the pre-fix fallback (`bun -e`) was never actually exercised here — the pre-fix second-parse step was already the fast `jq -r` path, not a second Bun cold start. A direct 5-run timing comparison of `pre-edit-guard.sh` on a single plain edit (stash-compared before/after) shows no measurable difference on this host (~628ms both ways — dominated by the first, unavoidable `bun state resolve` cold start in both versions). The A2 win is structural and host-independent: exactly one CLI invocation and zero fallback-parse subprocess in every case, verified by reading the diff (the `bun -e` call site is gone, not conditionally skipped) — the previous 1-or-2-process shape collapses to always-1. The full `bun scripts/hook-dispatch-diet-report.ts` p95 gate independently fails on its `state-snapshot` probe (a different command, `hook-entry.ts state-snapshot`, never touched by A1/A2); stash-verified this reproduces identically (615ms) — actually slightly worse — on unmodified code, so it is a pre-existing environmental condition on this worktree (fresh `node_modules`, cold Bun/OS cache), not a regression from this change. `script_invocation_count` (15) is unaffected either way — it counts hook script *files* wired into `route-registry.ts`, none of which A1/A2 added, removed, or renamed.
- `node_modules` did not exist in this fresh worktree at task start (`bun install` had never been run here); ran `bun install` to unblock `bun test` and the other required-check commands. Unrelated to A1/A2 but necessary to produce real verification evidence.

## Deviations From Plan Or Spec

- None. Both A1 and A2 landed exactly as scoped in the plan's Phase A section; the pre-existing test fix (see above) is an in-scope, foreseen consequence of A1, not a scope change.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep `jq`/`bun -e` fallback in `resolve_edit_workflow_profile()` for defense-in-depth | Rejected — deleted outright | `--field` moves the projection into the CLI itself; the shell-side parse has nothing left to do. Keeping dead branches contradicts the plan's minimal-change / no-steady-state-compatibility-code policy. |
| Broaden the reordered `_ops/secret.txt` test assertion to a regex instead of reordering the patch | Rejected — reordered the patch instead | Reordering preserves the original test's specific intent (OpsPrivateGuard still catches private-ops writes in a batch) and is order-independent of any future profile-resolution change, since `is_private_ops_path` never depends on `WORKFLOW_PROFILE`. |
| Put A2's `--field` tests in `tests/cli/state-snapshot.test.ts` (named in the dispatch) | Rejected — used `tests/effective-state.test.ts` instead | The named file tests the unrelated `state-snapshot` (singular) command; `effective-state.test.ts` already exercises `state resolve --json` through the CLI and is the dispatch's allowed "nearby test file" alternative. |

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
