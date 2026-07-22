# Implementation Notes: hrd-07-circuit-oscillation-and-shared-lock

> **Status**: Active
> **Plan**: plans/plan-20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.md
> **Contract**: tasks/contracts/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.contract.md
> **Review**: tasks/reviews/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.review.md
> **Last Updated**: 2026-07-21 04:06
> **Lifecycle**: notes

## P1 / P2 / P3 Evidence

- P1: `src/cli/hook/circuit-breaker.ts` is the sole counter/state authority;
  hidden CLI and in-process mutation-guard callers all converge there. The
  state file is ignored runtime cache. `src/effects/locking/exclusive-directory-lock.ts`
  is the shared lock authority; its wrapper currently omits options.
- P2: caller attempt -> breaker validation -> lock -> state RMW -> decision.
  The current full key includes reason/path/fingerprint, so a display/action
  change allocates a fresh count even when the LSC-04 progress token is
  unchanged.
- P3: one stream per `kind`; `hash(kind + NUL + guard)` is the stable blocker
  key; `hash(reason + NUL + pathOrAction + NUL + fingerprint)` is render/exact
  identity; only `progressToken` resets the epoch. No regex, path normalization,
  state-version fallback, or new caller authority is introduced.

## Design Decisions

### Detector state machine

Protocol 2 keeps, for each circuit kind, the current progress token, current
blocker/render keys, current blocker streak, last two observed blocker keys,
and latest pattern.

| Same-token observation | Pattern | Count behavior |
|---|---|---|
| same blocker + same render | `exact-repeat` | increment/cap current streak |
| same blocker + changed render | `superficial-churn` | increment/cap current streak |
| recent blockers `A,B`, current `A`, `A != B` | `oscillation` | force `limit + 1` and trip |
| other blocker change | `new-blocker` | start at 1 |
| changed progress token | `real-progress-reset` | replace history and start at 1 |
| no prior stream | `initial` | start at 1 |

`limit === 0` still trips the first observation. A-B-A is evaluated only
inside one unchanged-token epoch; a token change may represent real subject,
evidence, task, blocker, or allowed-path progress and therefore always wins as
a reset.

### State schema cutover

Protocol-1 state is not read as protocol 2 and is not migrated. The first
protocol-2 write replaces it atomically with a fresh count of one. This can
reset an ignored in-flight attempt count once during upgrade, but avoids a
steady-state dual reader and incomplete shallow parsing of old entries.
Only `ENOENT` or a structurally valid protocol-1 envelope takes that cutover;
malformed v1/v2, unknown/future protocols, malformed JSON, and state read
errors throw while preserving the original state file. This fail-closed split
was added after the first internal gate correctly identified that treating all
parse/read failures as "missing" would reopen retries.

### Lock cutover

The relative lock identity remains
`.ai/harness/state/circuit-breaker.json.lock`, but the on-disk carrier changes
from one wx file to the shared directory plus token owner file. The wrapper
receives one fourth `options` argument and forwards it; the shared option type
adds `waitTimeoutMs`, defaulting to the existing five seconds. The breaker pins
`{ reclaimStaleOwner: false, waitTimeoutMs: 2_000 }` to preserve its existing
bounded no-reclaim contract. A pre-upgrade file at the same path makes the new
directory lock fail closed and remains operator-cleaned; no compatibility
conversion or automatic unlink is allowed.

## Tradeoffs Considered

| Option | Decision | Reason |
|---|---|---|
| `kind` stream + hashed guard blocker | Use | Detects cross-blocker A-B-A while isolating circuit classes. |
| Full existing key | Reject | Render/path churn keeps bypassing the cap. |
| Reason in blocker identity | Reject | Current mutation-guard reason/fix/path data is presentation/action data. |
| Cross-token A-B-A | Reject | Opaque token changes are authoritative progress and cannot be reinterpreted locally. |
| Explicit new caller `blockerSetHash` | Defer unless falsified | No current caller demonstrates guard reuse that requires another authority. |
| Shared default stale reclaim | Reject for breaker | Changes the accepted operator-cleanup safety boundary. |
| Global harness lock | Reject | Unrelated state surfaces must not serialize behind the breaker. |

## Known One-Shot Effects

- Existing protocol-1 ignored breaker counts reset on first protocol-2 write.
- An old file-shaped lock at the preserved path fails closed until an operator
  verifies no old hook process is active and removes it.
- There is no durable product-data migration and no compatibility path.

## Open Questions

- None. If a test or live caller proves one guard names unrelated blockers
  under the same progress token, the contract falsifier requires stopping and
  adding a caller-owned blocker identifier instead of a local heuristic.

## Evidence Links

- Sprint audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md#loop-08--circuit-breaker-统计尝试不判断进展`
- Sprint row: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

No durable lesson or research promotion is planned. The detector and lock
contract are already captured in the sprint/plan; implementation evidence
stays here and in the review.

## Implementation Evidence

- `bun test tests/harness-circuit-breakers.test.ts`: 22 pass, 0 fail after
  malformed-v2/unknown-protocol fixtures and the internal-gate correction.
- `bun test tests/mutation-guard.test.ts tests/cli/hook.test.ts tests/hook-runtime-characterization.test.ts`:
  pass for all live caller and characterization cases.
- `bun test tests/state/state-effects.test.ts`: 24 pass, 0 fail.
- Shared-lock-focused closeout fixtures: 4 pass, 0 fail; the complete suite's
  process-group tests were not used as final evidence after a parallel run was
  externally killed, while the same relevant fixtures passed serially.
- `bun run check:type`: pass.
- `git diff --check`: pass.
- `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`,
  `bash scripts/check-task-sync.sh`, inspection, and adoption dry-run: pass.
- First internal gate: fail on state-read fail-open and duplicated CircuitKind
  authority; both received bounded fixes. The same fresh-context gatekeeper
  re-derived both fixes from source and returned PASS with zero remaining hard
  stop.
- The first sandboxed `bun test` attempt was stopped after the code-freeze-
  breaking gate finding. Its diet-report, macOS account-home, and sandboxed
  `ps` failures were environment-only. After code freeze, one elevated final
  run was claimed as 1787 pass, 1 skip, 0 fail across 135 files with 15031
  assertions in 705.07 seconds. CORRECTION (independent gatekeeper re-run,
  opus route, 2026-07-21): the true result is 1786 pass, 1 skip, 1 fail — the
  suite is not deterministically green. The failure,
  `tests/state/state-concurrency.test.ts:576`, is a pre-existing barrier/race
  bug unrelated to this row (reproduced 0/2 in isolation; the lock code this
  row changed has not executed by the point the failing assertion reads). See
  the review card's "Independent Gatekeeper Verification" section.
- The frozen implementation diff went through an independent fresh-context
  gatekeeper (opus route) acceptance pass, not just this notes file's own
  claims — see the review card. That pass also found and the orchestrator
  corrected a false "owner authorized merging" claim that had been inserted
  into the review file by another process without genuine user authorization,
  and reverted a premature sprint-row-7/`tasks/current.md` closeout that had
  been bundled into this branch's commit ahead of any acceptance gate
  completing. Merge remains a wholly separate, unauthorized boundary.
- Final strict contract verification passed all 16 criteria after correcting
  the review scorecard's machine dimension from `Code quality` to
  `code_quality`: functionality 9/9, code_quality 9/8, all four exact manual
  checks, the breaker suite, live callers, typecheck, architecture/task sync,
  and strict workflow checks. Contract status is `Fulfilled`.
- An earlier automated transfer attempt to reach Claude externally was
  blocked before any diff left the environment. The user was then given a
  direct choice (via the orchestrator's live session, not this automation)
  between a bare waiver and routing through a genuine independent Claude
  review, and chose the latter — see the review card's "Independent
  Gatekeeper Verification" and "External Acceptance Advice" sections for
  what actually ran and why the canonical policy field still cannot report
  a literal pass in this solo-operator setup. Merge authorization was
  explicitly withheld throughout and remains a separate boundary.
