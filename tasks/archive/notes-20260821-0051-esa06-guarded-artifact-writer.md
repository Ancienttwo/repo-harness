> **Archived**: 2026-08-21 00:51
> **Related Plan**: plans/archive/plan-20260820-2307-esa06-guarded-artifact-writer.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260821-0051

# Implementation Notes: esa06-guarded-artifact-writer

> **Plan**: `plans/plan-20260820-2307-esa06-guarded-artifact-writer.md`
> **Contract**: `tasks/contracts/20260820-2307-esa06-guarded-artifact-writer.contract.md`

Non-obvious decisions, deviations, and open questions only. Frozen decisions
1-9 in the plan are authoritative and are not restated here.

## Falsifier probe outcome

Both falsifier conditions were tested before any production edit.

**Condition 1 — does the low-level SDK path already reject undeclared params?**
No. A throwaway probe called `write_prd` through the same dispatch the tests
use, passing `overwrite: true` plus two invented keys:

```
PROBE_PAYLOAD={"status":"written","repoRoot":"…","path":"plans/prds/20260820-1511-probe-one.prd.md"}
```

No error, file written, undeclared keys silently dropped. Frozen decision 2's
premise holds and the `UNKNOWN_PARAMETER` / `RETIRED_PARAMETER` guards are not
dead code. The probe file was deleted after the result was recorded.

**Condition 2 — does any in-repo caller depend on `overwrite` programmatically?**
Yes, one, and it is outside `allowed_paths`. See the blocker below.

## Blocker: `src/cli/commands/mcp.ts` is an in-repo `overwrite` caller

`prepareCodexGoalFromSprint` (`src/cli/commands/mcp.ts:96-107`) calls
`callMcpTool(ctx, 'prepare_codex_goal_from_sprint', { …, overwrite: rawOpts.overwrite === true })`.
It passes the key unconditionally — `false` when the `--overwrite` flag is
absent — so after this cutover every `repo-harness mcp prepare-goal` invocation
is rejected with `RETIRED_PARAMETER` before it reaches the writer.

Observed, not inferred:

```
tests/cli/mcp.test.ts:76  expect(result.status).toBe(0)
Expected: 0   Received: 2
(fail) mcp command > prepare-goal writes Codex handoff and prints host-native /goal prompt
```

The contract's `allowed_paths` covers `src/cli/mcp/` but not
`src/cli/commands/`, and the plan's Out-of-scope list does not mention this
caller, so the fix was not applied here. The correct fix is a deletion, not a
shim: drop `overwrite` from `McpPrepareGoalOptions`, from the
`callMcpTool` argument object, and from the `--overwrite` CLI option
(`src/cli/commands/mcp.ts:296-309`). Weakening the guard to tolerate an
internal caller would reintroduce exactly the dual authority this release
removes, and is refused.

**Resolved.** The 2026-08-20 contract scope widening brought
`src/cli/commands/` into `allowed_paths`, and `overwrite` was deleted from
`McpPrepareGoalOptions`, the `callMcpTool` argument object, and the CLI option
in `2055f5c6`, against the retired-parameter guard landed in `72a9e774`.

## Blocker: the 0.16.1 bump has a release surface outside `allowed_paths`

The contract makes `grep -q '"version": "0.16.1"' package.json` an exit
criterion, but `package.json` is not the only file that pins the release line.
Bumping it alone leaves three tests failing:

```
(fail) Skill Version Consistency > package, skill, and template versions share the release line
(fail) Skill Version Consistency > checkConsistency returns consistent=true for current repo
(fail) README DX contract > localized READMEs track the current English release surface
```

`assets/skill-version.json` (`version`, `templateVersion`, and a
`breakingChanges` entry) and the release stamp in all five READMEs
(`README.md`, `README.zh-CN.md`, `README.ja.md`, `README.fr.md`,
`README.es.md`, each carrying `repo-harness@0.16.0` and
`repo-harness@0.16.0+template@0.16.0`) are the rest of that surface, and none
of them is in `allowed_paths`. `deploy/release-checklists/` carries a
per-release file as well.

Two readings are possible and the choice is not this contract's to make:
either `allowed_paths` should cover the release surface, or the version bump
belongs in a separate release work-package and this one should stop at the
code, tests, changelog entry, and docs. The code change itself is complete
either way — the version pin is the only thing coupling it to the release
ritual.

**Resolved.** The same 2026-08-20 scope widening put the release surface in
`allowed_paths`, and `2055f5c6` aligned `assets/skill-version.json`, the five
README release stamps, and the release checklist with the 0.16.1 line.

## Follow-up: the CLI regained regeneration

Deleting `overwrite` left `prepare-goal` with no way to rewrite the fixed
`.ai/harness/handoff/codex-goal.md` path: the second run always failed
`WOULD_OVERWRITE` pointing at an `expected_sha256` the CLI did not expose.
`--expected-sha256 <hex>` now mirrors the tool parameter one-to-one and the key
is sent only when the flag is present, so an omitted flag still means
create-only rather than an empty precondition. Covered by the second
`prepare-goal` test in `tests/cli/mcp.test.ts`.

## Deviations and tradeoffs

- **`mkdirSync` moved into `guardedWriteFile`.** The old
  `writeMarkdownArtifact` created the parent directory itself. The durable
  commit writes its temp file into the target directory, so the directory must
  exist before the commit sequence starts; keeping the `mkdirSync` in the
  caller would have split one invariant across two modules.

- **File mode is preserved across a replace.** `renameSync` replaces the
  inode, so a temp file created with the default mode would silently reset the
  permissions of every file it replaces. `guardedWriteFile` reads the target's
  mode before the write and `chmodSync`s the temp file to match before the
  rename, following `coding-tools.ts:507-509`. Creates keep the previous
  `writeFileSync` default (`0o666` under the process umask), so no artifact
  changes permissions as a result of this release.

- **The commit-failure test injects through a read-only parent directory, not
  a fault seam.** `general-repo-access.ts` has an env-var fault seam
  (`injectMutationFault`), but adding one to `guarded-write.ts` was not
  requested and would be a production surface that exists only for tests.
  `chmod 0o500` on the parent directory fails the temp-file creation the
  durable commit depends on, which exercises the same guarantees the exit
  criterion names — original intact, no `.tmp` residue, `WRITE_FAILED`
  returned. It does not exercise a failure at the `rename` step specifically;
  no synchronous injection could, since the rename's only realistic failure is
  a TOCTOU that a test cannot open.

- **A malformed `expected_sha256` is not a distinct error.** Anything that is
  not a string is treated as absent (create-only, worst case
  `WOULD_OVERWRITE`); a string that is not the current hash is a
  `REVISION_CONFLICT`. Both are fail-closed, and neither needed an eighth
  error code outside the frozen taxonomy.

- **`UNKNOWN_PARAMETER` reports `unknown` as an array.** The frozen decision
  names `details: {unknown, allowed}` without fixing the shape. An array
  reports every undeclared key in one round trip instead of making a caller
  fix them one at a time.

- **The parameter guard derives its allowed set from
  `buildMcpToolDefinitions`.** A second hand-maintained key list per tool would
  be a duplicate authority that drifts the first time a schema gains a field.

- **`docs/repo-harness-chatgpt-mcp-setup.md` was regenerated, not hand-edited.**
  It is a projection of `src/cli/mcp/setup.ts`; the guidance was written into
  the generator and the doc reproduced with
  `bun src/cli/index.ts mcp print-chatgpt-guide --repo . --write`.

## Out of scope / future work

- `coding-tools.ts:421` still echoes `actual_sha256` in its own
  `REVISION_CONFLICT`. Different threat model (sandboxed workspace), flagged in
  the plan for separate review, untouched here.
- Cross-process locking is now a `tasks/todos.md` row with an evidence-bearing
  revisit trigger.
