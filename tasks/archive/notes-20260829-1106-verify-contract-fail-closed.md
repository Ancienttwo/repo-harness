> **Archived**: 2026-08-29 11:06
> **Related Plan**: plans/archive/plan-20260829-0208-verify-contract-fail-closed.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260829-1106

# Implementation Notes: verify-contract-fail-closed

> **Contract**: `tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md`
> **Plan**: `plans/plan-20260829-0208-verify-contract-fail-closed.md`

## The failure was worse than "shell-fatal"

The plan predicted that a non-numeric `now_ms` stdout kills the enclosing script under
`set -u`. In `verify-contract.sh` it does not: `trap cleanup_verify_contract EXIT` runs
after the unbound-variable abort, and its last command (`rm -rf "$tmp_dir"`) succeeds, so
bash 3.2 reports the script's exit status as **0**. Reproduced standalone:

```
$ bash -c 'set -euo pipefail; trap "rm -rf /tmp/d" EXIT; mkdir -p /tmp/d
  { printf "%s\n" "$(( $(printf not-a-timestamp) - 1 ))"; } > /tmp/o.json'
line 2: not: unbound variable
$ echo $?
0
```

So the pre-fix behaviour at `write_report` is a green exit code plus a truncated,
unparseable report — the machine channel a completed round is judged by. The regression
test asserts exactly that shape (status 0 with a `JSON.parse` failure before the fix,
status 0 with `total_duration_ms: null` after it).

## Rejection is per-line, not a bail-out

Both rules append to a `parse_errors` array and `continue`; the rejection block runs after
the first parse loop, so a contract with several malformed lines reports all of them in one
round. Each error becomes one `exit_criteria_parse` result in the report and one stderr
line, so `--quiet` runs without `--report-file` still surface the reason. The block reuses
the existing `missing_artifact` class and the existing "no YAML block" exit shape
(`Pending` status, `exit 1` only under `--strict`); no new `failure_class` value.

## Rule A1 placement

A1 is checked immediately after the nine-key `case`, because every recognized key
`continue`s out of that `case`. Anything header-shaped that reaches the check is by
construction unrecognized, so the accepted-key list and the dispatch cannot drift apart.
Item-level keys (`path:`, `pattern:`, `dimension:`, `min:`) carry a value and never match
`^[A-Za-z_][A-Za-z0-9_]*:$`.

A2 is checked before the `in_exit_criteria` gate so it covers the whole YAML block, and
after the comment skip so the commented-out `# criterion_reuse:` example in
`assets/templates/contract.template.md` stays legal.

## One pre-existing A1 collision, deliberately untouched

`plans/archive/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md` carries a
`numeric_assertions:` key inside its embedded `exit_criteria` block. It is an archived plan,
not a contract, template, or fixture; `verify-contract` only ever parses
`tasks/contracts/*.contract.md`, and the key was already being silently ignored — it is an
instance of the bug being closed, not a valid shape. Left as-is: the file is outside
`allowed_paths` and rewriting history in an archived artifact is not this slice's business.
Repo-wide scan found no other collision in any Markdown file.

## `now_ms` sites left unguarded on purpose

`scripts/verify-contract.sh:1017-1018` captures `verification_started_ms` and derives
`verification_deadline_ms` from it. That arithmetic is also unguarded, and it fires before
`write_report` can ever be reached with a broken clock. It is **not** guarded here because:

- the contract scopes the verify-contract guard to `write_report`;
- there is no non-synthesizing answer for the deadline — `run-bounded-verifier-command.ts`
  requires a finite absolute `--deadline-ms`, and inventing one would violate the
  no-fallback-timestamp rule;
- unlike the `contract-worktree.sh` `merged` emission, the site is pre-side-effect: a crash
  there loses a round, not a published merge.

The guard that did land covers the realistic case the incident describes — a clock that is
fine at entry and polluted later — which is exactly what the regression test simulates with
a marker-driven `node` shim.

## Cross-review fixture: host `CLAUDE_PLUGIN_DATA` leak

`tests/cli/cross-review.test.ts`'s `withOfficialPluginFixture` built its env by spreading
`process.env` over a temporary `HOME`. A Claude Code host injects
`CLAUDE_PLUGIN_DATA=<host>/.claude/plugins/data/codex-inline` into the parent environment,
and `discoverOfficialCodexPlugin` (`src/effects/review/codex-plugin-provider.ts:283`) reads
`env.CLAUDE_PLUGIN_DATA ?? join(home, ".claude", "plugins", "data", "codex-openai-codex")`,
so the host path outranked the fixture HOME and the assertion at line 506 failed only inside
a Claude Code session — the same class as the recorded `REPO_HARNESS_NODE_BIN` spread leak.
The fix belongs in the fixture, not in the provider: the host variable is real product input
that a genuine plugin install legitimately sets, so making the provider ignore it would be a
semantic fallback; only the test's own env-construction site is wrong to inherit it. The
fixture now passes `CLAUDE_PLUGIN_DATA: undefined` explicitly rather than `delete`-ing the
key, because the provider re-merges `{ ...process.env, ...opts.env }` at line 267 and only an
explicit own-property `undefined` survives that merge to let the HOME-based default apply.
`tests/cli/cross-review.test.ts` was added to this contract's `allowed_paths` before the
edit, per the Scope gate; the widening was authorized as a ship-gate blocker fix.

## Round-2: trailing comments bypassed every key matcher

Rules A1 and A2 both matched key text exactly — A2 by literal string equality against
`criterion_reuse:`, A1 by a regex anchored at `$` — so a YAML-legal trailing comment
(`criterion_reuse: # note`, `comands_succeed: # typo`) was invisible to both. The bypass is
not per-rule: the same commented line also missed the 9-key section dispatch, so `$section`
stayed on the previous section and the nested sub-headers re-triggered the top-level
dispatch, promoting reuse-only commands back into the executed set. That is the original
ME-1C failure mode reachable through a shape neither round-1 rule inspects.

The fix normalizes once — right-trim, drop a trailing `#` comment when the `#` is at line
start or preceded by whitespace and outside a quoted scalar, right-trim again — and feeds the
normalized key to every key matcher, not only to A1/A2. Patching only the two rules would
have been worse than the bug: a *valid* `commands_succeed: # note` would then pass A1 (its
normalized key is a recognized section key) while still missing the literal dispatch, so its
items would be swallowed silently with no rejection anywhere. `exit_criteria:` itself is
matched on the normalized key for the same reason — the block extractor already accepts a
commented `exit_criteria:` line, and an unnormalized match there would parse zero criteria and
report a vacuous pass. Item lines keep the raw text: normalization is for key matching only,
and a `#` inside a quoted scalar stays content.

## Round-2: opening `now_ms` sample is now a fail-closed gate

This supersedes "`now_ms` sites left unguarded on purpose" above. That section's reasoning
held that no non-synthesizing answer exists for the deadline, which is correct, and then drew
the wrong conclusion: the absence of an answer is precisely why the run must stop. Leaving the
bare arithmetic meant a polluted opening sample aborted the script under `set -u` with the EXIT
trap masking the status — no report, no signal. The sample is now taken with `|| true`,
validated as `^[0-9]+$`, and a non-numeric value fails closed through the script's existing
failure path with a written report (`failure_class: verification_budget`, `next_status:
Pending`) and a stderr line naming the polluted output. An unenforceable verification budget is
a failure, not a degraded mode; nothing is executed without a deadline and no fallback
timestamp is synthesized.

The two telemetry sites differ because their samples are measurement-only. In
`acquire_backlog_lock` and `finish_worktree` the opening sample is captured non-fatally and
cleared when non-numeric, so the existing numeric guards in `emit_backlog_lock_wait` and
`emit_finish_attempt` drop the record rather than the host command — a lock acquisition or a
durable publication must not be lost to a broken clock.
