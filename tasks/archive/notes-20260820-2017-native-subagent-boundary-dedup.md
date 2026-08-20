> **Archived**: 2026-08-20 20:17
> **Related Plan**: plans/archive/plan-20260820-1713-native-subagent-boundary-dedup.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-2017

# Implementation Notes: native-subagent-boundary-dedup

> **Status**: Complete
> **Plan**: `plans/plan-20260820-1713-native-subagent-boundary-dedup.md`
> **Contract**: `tasks/contracts/20260820-1713-native-subagent-boundary-dedup.contract.md`
> **Review**: `tasks/reviews/20260820-1713-native-subagent-boundary-dedup.review.md`
> **Last Updated**: 2026-08-20
> **Lifecycle**: slice notes

## Decisions and deviations

- **Read-only children still get the contract path.** The plan's row A says
  "boundary once + contract path" and row C says drop the unconditional
  "Read the active repo-harness contract before working." line because there is
  no contract to read. Read as a pair, the line's gate is contract existence,
  not writability, so rows A and B both render
  `Read the active repo-harness contract before working: <path>.` and differ only
  in boundary vs. read-only note. A gatekeeper that cannot be told to read the
  contract it is verifying would be the wrong reading of "no fabricated
  reference".
- **`sandbox_mode` is validated on the matched profile only, not on every TOML in
  the scanned directory.** This mirrors how `model` is already handled
  (`customAgentProfile` rejects only the selected profile for not pinning a
  model). Requiring it of every sibling file would fail-close a whole directory
  because of an unrelated user-authored agent.
- **The strict/high-risk predicate keeps its own contract read.**
  `activeContractRef()` now owns the `.ai/harness/active-plan` -> contract path
  derivation for both callers, but `runSubagentStart` still evaluates
  `Workflow Profile|Risk` against the raw file rather than going through
  `activeContractPath()`. Routing it through the Status predicate would silently
  loosen the spawn cap for a Draft high-risk contract
  (`tests/harness-circuit-breakers.test.ts:412` is exactly that fixture: contract
  present with `> **Risk**: high`, no plan file, no Status line, expects
  `"limit":3`).
- **`NativeRoleRouting.schema_version` stays at 1.** `sandbox_mode` is an
  additive field on persisted evidence and no consumer branches on the version;
  bumping it was not requested and would be an unrequested extra.
- **Carried a base repair for `tests/evidence-residue-scan.test.ts`.** main@07a5d63a's
  archive sweep moved `20260722-0001-evidence-projection-convergence.sprint.md` from
  `plans/sprints/` to `plans/archive/`, but the test still read the old path, so two
  cases failed with ENOENT on main@ddf53f8c and this branch inherited the red via
  rebase. Fixed here as a path-only change (`SPRINT_DOC_PATH` plus its label string);
  no assertion was weakened or rewritten. Without it the merge gate's full-suite
  criterion is unsatisfiable on this branch.

## Regeneration command

`.codex/agents/*.toml` are generated, never hand-edited. Regenerated with:

```bash
FAKE_HOME=$(mktemp -d)
env -u REPO_HARNESS_NODE_BIN HOME="$FAKE_HOME" bash scripts/install-agent-fleet.sh
cp "$FAKE_HOME"/.codex/agents/*.toml .codex/agents/
rm -rf "$FAKE_HOME"
```

The installer only ever writes to `$HOME/.claude/agents` and `$HOME/.codex/agents`
(`scripts/install-agent-fleet.sh:103-104`); the repo-tracked `.codex/agents/` copy
is the golden that `tests/install-agent-fleet.test.ts` byte-compares against. The
`repo-harness run install-agent-fleet` route (`src/cli/commands/run.ts:84` ->
`src/cli/commands/global-runtime.ts:632`) runs the same script against the real
`$HOME`, so it is not usable for regenerating the golden. `bun scripts/sync-helper-sources.ts --write`
projects `scripts/install-agent-fleet.sh` into
`assets/templates/helpers/install-agent-fleet.sh` (verified byte-identical with `cmp`).

## Before/after static size measurement

Measured on the real composed native-child stack — persona
`developer_instructions` + delegation-advisor `additionalContext` +
`SubagentStart.additionalContext` — rendered through `runSubagentHandler` against
a fixture repo carrying the actual generated persona. "before" = `35dc7742`
(clean clone), "after" = this branch. Tokens are the byte/4 estimate used by
`docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md`; they are not
provider-reported counts and no cache-hit claim is attached to them.

| Composed child | Surface | Before bytes / ~tokens | After bytes / ~tokens | Delta bytes |
|---|---|---|---|---|
| fast-worker, contract active (workspace-write) | persona | 2636 / 659 | 1793 / 448 | -843 |
| | advisor | 3203 / 801 | 2360 / 590 | -843 |
| | SubagentStart | 2146 / 537 | 2220 / 555 | +74 |
| | **composed total** | **7989 / 1997** | **6377 / 1594** | **-1612 (-20.2%)** |
| explorer, contract active (read-only) | persona | 3267 / 817 | 2424 / 606 | -843 |
| | advisor | 3203 / 801 | 2360 / 590 | -843 |
| | SubagentStart | 2143 / 536 | 1510 / 378 | -633 |
| | **composed total** | **8617 / 2154** | **6298 / 1575** | **-2319 (-26.9%)** |
| fast-worker, no active contract | persona | 2636 / 659 | 1793 / 448 | -843 |
| | advisor | 1957 / 489 | 1957 / 489 | 0 |
| | SubagentStart | 2146 / 537 | 1249 / 312 | -897 |
| | **composed total** | **6743 / 1686** | **5003 / 1251** | **-1740 (-25.8%)** |

Boundary occurrence count (canonical first sentence, counted across the whole
composed stack):

| Composed child | Before | After |
|---|---|---|
| fast-worker, contract active | 3 | 1 |
| explorer, contract active | 3 | 0 |
| fast-worker, no active contract | 2 | 0 |

The `+74` bytes on the contract-bound writable `SubagentStart` context is the
`[repo-harness:execution-boundary/v1]` marker plus the resolved contract path
appended to the read-the-contract line; it is paid once, on the only row that
still carries the clause.

## Baseline

Baseline was taken from a clean `git clone` of `35dc7742` with `node_modules`
symlinked in: `2714 pass / 1 skip / 2 fail`. Both failures are artifacts of that
setup, not of the repo — `prepareBenchmarkRuntimeArtifact`
(`scripts/run-harness-profile-benchmark.ts:620`) fail-closes on a dependency that
resolves outside the source root, which is exactly what a symlinked
`node_modules` produces. Those two tests pass in the real worktree: the branch
run is `2722 pass / 1 skip / 0 fail`. No pre-existing failures, no regressions.

## Out of scope / future work

- `docs/reference-configs/external-tooling.md:645-649` (and its
  `assets/reference-configs/` twin) still describes `developer_instructions` as
  "the packaged `.md` body plus the canonical EXECUTION_BOUNDARY anti-extras
  clause". That paragraph is now stale, but `docs/` and `assets/reference-configs/`
  are outside this contract's Allowed Paths and no test asserts the text. Needs a
  follow-up doc slice.
- `scripts/contract-run.ts:791` and `src/cli/mcp/tools.ts:784` still hold their own
  copies of the clause. They are separate standalone runner paths, each already the
  single owner on its own path, and are explicitly out of scope here; the
  `tests/workflow-contract.test.ts` parity test now pins exactly those three
  remaining owners.
