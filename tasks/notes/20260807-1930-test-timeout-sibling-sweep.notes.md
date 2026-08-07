# Implementation Notes: test-timeout-sibling-sweep

> **Status**: Active
> **Plan**: plans/plan-20260807-1930-test-timeout-sibling-sweep.md
> **Contract**: tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md
> **Review**: tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md
> **Last Updated**: 2026-08-07 19:30
> **Lifecycle**: notes

## Design Decisions

- The class was closed by static analysis, not by eyeballing: a throwaway scanner
  (`/tmp/sweep/scan.ts`, not committed) parsed every file under `tests/`, computed
  per-file transitive "spawning helper" sets, matched each `test(...)`/`it(...)` call
  by paren balancing, and reported which spawning tests carry no positional timeout.
  Membership rule: a test is in-class if its body textually reaches `spawnSync`,
  `spawn(`, `execSync`, `execFileSync`, or `Bun.spawn` either directly or through a
  helper declared in the same file / imported from another `tests/**` or `scripts/**`
  module (fixture builders live in both).
- Value shape follows a2381159: positional `30_000` appended after the callback's
  closing brace. Chosen over a global `bunfig` default because the default 5000ms
  still guards the assertion-only majority, and an explicit per-test bound keeps
  hang detection at 30s rather than removing it.
- `tests/factor-factory.test.ts` already had an explicit bound expressed as a named
  constant `FACTOR_FACTORY_SMOKE_TIMEOUT_MS = 15000`; observed lifecycle cost was
  29.3s, so the constant moved to `45_000` rather than adding a second, conflicting
  literal on the test.
- Propagation was deliberately **not** extended into `src/`. A test calling a product
  function that internally spawns is arguably in the same class, but the name-based
  transitive closure over `src/` cascaded into obvious non-spawning helpers
  (`profileEnablesCodegraph`, `currentStateVersion`, `readLatestPackageVersion`,
  `jsonTool`), which would have widened 149 more tests on unsound evidence. Scope
  stops at test-side and `scripts/` fixture helpers, matching the contract wording.
- Existing explicit bounds were left alone even where they are tighter than 30s
  (`SCAFFOLD_PARITY_TIMEOUT_MS = 15000`, `DOCTOR_CHECK_TIMEOUT_MS = 15000`,
  `tests/state/state-concurrency.test.ts` 8s-20s, `closeout-runner-guardrails` 6s-10s).
  Only `factor-factory` was named as observed-insufficient; widening the others would
  be unrequested design space.

## Sweep Result

- Files under `tests/` scanned: 122 (all `.ts`).
- In-class (subprocess-spawning) tests found: 863.
- Already carrying an explicit timeout before the sweep: 114
  (93 numeric literals + 21 named-constant declarations such as
  `DOCTOR_CHECK_TIMEOUT_MS`, `SCAFFOLD_PARITY_TIMEOUT_MS`).
- Timeout declarations added this slice: **749** across **96** files, all `30_000`.
- Existing bound raised: **1** (`tests/factor-factory.test.ts:16`, `15000` -> `45_000`).
- Total diff: 97 test files, 750 changed lines.
- Assertion-only tests touched: 0. No test logic changed, no timeout removed, nothing
  outside `tests/**` edited.

### Minimum confirmed set (contract-named)

| Test | Spawns | Before | After |
|---|---|---|---|
| `tests/continuation-attempt.test.ts:310` `real material progress clears a tripped breaker` | `withLedgerRepo` -> `withRepo`/`commitFixture` -> `git`; `record`/`envelopeFrom` -> `runStateCli` -> `bun src/cli/index.ts` (multiple CLI invocations) | default 5000 | `30_000` |
| `tests/continuation-attempt.test.ts:327` `an explicit resumed receipt resets the count, which then restarts at one` | same fixture chain | default 5000 | `30_000` |
| `tests/continuation-attempt.test.ts` remaining breaker/authority-fence siblings (142, 175, 185, 200, 228, 292, 301, 344, 354, 369, 383, 398, 409, 425, 438) | same fixture chain | default 5000 | `30_000` |
| `tests/session-context-packet-panel.test.ts:43` `every authority state's fixture is git-initialized with the opt-in marker present` | `buildPanelFixture` from `scripts/session-context-packet-panel.ts`, 9 authority states x git init/commit | default 5000 (measured 5163ms) | `30_000` |
| `tests/factor-factory.test.ts:49` `factor lifecycle commands create, promote, reject, and check registry state` | `bootstrapRepo` -> `create-project-dirs.sh` plus repeated `bun src/cli/index.ts` factor commands | `15000` (measured 29323ms) | `45_000` |

### Largest per-file additions

`helper-scripts.test.ts` 99, `effective-state.test.ts` 30, `cli/chatgpt-browser.test.ts` 26,
`contract-run.test.ts` 24, `mutation-guard.test.ts` 22, `sprint-backlog.test.ts` 21,
`runtime-profile-enforcement.test.ts` 21, `install-agent-fleet.test.ts` 21,
`skill-routing-eval.test.ts` 18, `mutation-observed.test.ts` 17,
`continuation-attempt.test.ts` 17.

### Deliberately not patched

- `tests/state/loop-semantics-characterization.test.ts:808` — scanner false positive.
  The match is the substring `it (` inside a prose comment (`...stopped calling it (while
  leaving the marker string in place)...`), not a test declaration. Verified by reading
  the source; no edit made.

## Deviations From Plan Or Spec

- None. Scope stayed inside `tests/**`.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Global default timeout in `bunfig.toml` | Rejected | Would relax the 5000ms fence for the assertion-only majority, hiding real regressions there; the load sensitivity is specific to subprocess spawning |
| Patch only the three observed-failing tests | Rejected | That is exactly what a2381159 did, and it left the class open — three further acceptance rounds each blocked on a different sibling |
| Extend helper propagation into `src/` (149 more tests) | Rejected | Transitive closure over `src/` produced demonstrable false positives; unsound basis for widening assertion-only tests |
| Raise every existing sub-30s bound to 30s | Rejected | Only `factor-factory` was observed insufficient; the rest are deliberate tighter fences |

## Open Questions

- None.

## Evidence Links

- Falsifier (pre-sweep, standalone): `bun test tests/session-context-packet-panel.test.ts tests/factor-factory.test.ts tests/continuation-attempt.test.ts` -> 35 pass / 0 fail, 53.98s. Confirms load sensitivity rather than hangs, so widening the bound is the right direction.
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Candidate for `tasks/lessons.md`: when a fix is applied to named failing instances of a
  class, close the class in the same slice or file the sweep as a deferred goal. a2381159
  fixed five instances; the unswept remainder blocked three later acceptance rounds.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
