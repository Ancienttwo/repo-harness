# Implementation Notes: hrd-02-state-input-collector

> **Status**: Active
> **Plan**: plans/plan-20260720-0020-hrd-02-state-input-collector.md
> **Contract**: tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md
> **Review**: tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md
> **Last Updated**: 2026-07-20 00:20
> **Lifecycle**: notes

## Design Decisions

### Getters implemented vs. left out

Implemented (each a thin delegation to an existing, already-exported
authority, zero new parsing):

- `getRepoRoot()` -- not a collection at all. `runHook()` already resolves
  `repoRoot` via the existing authority (`resolveExplicitRepoRoot` /
  `resolveRepoRoot`) before a collector can exist; the getter just returns
  the value the caller already holds.
- `getWorktreeOwnership()` -- `safeRealpath` + `readTrimmed` from
  `src/effects/state/collect-state-inputs.ts` (both already exported,
  same-layer). Mirrors the exact comparison `resolveEffectiveStateUnlocked`
  performs (`resolve-effective-state.ts:321-336,533-534`).
- `getActivePlanMarker()` -- `readTrimmed(repoRoot, '.ai/harness/active-plan')`.
  Raw marker text only, not the derived/validated plan.
- `getSessionEffectiveState()` -- memoizing facade over an injected thunk
  the caller wires to `effectiveStateSessionSection` (runtime.ts:127-189).
  This is the one production-wired getter (SessionStart).

Left out, with reasons (per contract: "if a fact would need new parsing,
that getter is out of scope"):

- **policy** (raw `.ai/harness/policy.json` object). The only existing
  reader with real validation (`readWorkflowPolicy` /
  `validateWorkflowPolicy` / `policyString` / `policyPath`) is private to
  `src/effects/state/resolve-effective-state.ts`, which is outside this
  package's Allowed Paths and off-limits to refactor. Reimplementing a
  second JSON-parse-plus-validate path for policy would be exactly the
  "second representation of an authority" the contract forbids (its
  fail-closed validation rules, e.g. unsafe-path checks, would silently
  diverge from the real one over time). No getter added.
- **contract marker** (derived contract path for the active plan).
  `artifactStemFromPlan` / `planSlugFromPath` are exported core functions,
  but the actual selection rule between a stem-based and a legacy
  slug-based contract path (`deriveContractPath` / `preferredOrLegacyPath`)
  is private logic in `resolve-effective-state.ts`. Copying that 3-line
  selection rule would drift silently if the real rule ever changes. Only
  the raw active-plan marker is exposed; the resolved `contract` object
  stays available via `getSessionEffectiveState()`'s result.
- **candidate/diff summary**. `buildReviewSubject` (`src/effects/review/
  diff-fingerprint.ts`) is a clean, exported, same-layer authority, but it
  needs a `targetRef` that in production is resolved from a policy cascade
  (`.worktree_strategy.review_base` / `merge_back.target` / `base_branch`)
  that lives unexported in `resolve-effective-state.ts` -- the same policy
  problem as above. Hardcoding a default target (e.g. `'main'`) would be a
  silently-divergent second representation of that cascade in any repo with
  a non-default policy. Left out.
- **capability mapping**. `parseCapabilityRegistry` / `resolveCapabilityPaths`
  (`src/core/capabilities/registry.ts`) are exported core functions, but
  correct use needs (a) the policy-derived `declared` signal
  (`policyDeclaresCapabilityRegistry`, private, same policy problem) and
  (b) a target-path/diff set (blocked on the same `targetRef` problem as
  candidate/diff above). Left out.
- **latest evidence heads**. Not a separate collection: once
  `getSessionEffectiveState()` resolves, `EffectiveState.review` /
  `.checks` / `.external_acceptance` / `.active_sprint` already carry each
  source's freshness/detail/recorded fingerprints from that same
  resolution. Adding a standalone getter would mean a second resolution
  path for data the required getter already produces. No getter added;
  future consumers read these fields off the effective-state result.
- **runtime event / host-session identity** (audit's fuller 10-item Sense
  list; the contract's own restated Scope list already narrows to 8 and
  drops these two). The event is already the factory's own `event` input,
  not something to collect; host/session identity is three inlined
  `process.env` reads at the one call site that needs them
  (`runtime.ts:539-542`), not a fact worth a memoized seam.

### Memoization mechanics

`once()` caches with a private `Symbol` sentinel (`UNCOMPUTED`), not
`??=`/`||=`. `getSessionEffectiveState()`'s real-world result is commonly
`null` (`effectiveStateSessionSection` returns `null` whenever the
resolved state isn't "actionable") -- a falsy-value memo would recompute
(re-spawn the subprocess) on every `null` result, silently defeating the
one-resolution-per-event guarantee the whole package exists for. Verified
with a dedicated test (`a resolver that legitimately returns null is still
cached`).

### Layering: why the Effective State getter is dependency-injected

`state-input-collector.ts` lives under `src/effects/loop/`.
`effectiveStateSessionSection` lives in `src/cli/hook/runtime.ts` -- a CLI
adapter. `scripts/check-state-boundaries.ts`'s `checkEffectDependencies`
forbids any import (including `import type`) from `src/effects/*` into
`src/cli/*` (`EFFECTS_REVERSE_IMPORT`). Editing `resolve-effective-state.ts`
to export a lower-level reader was also not an option (outside Allowed
Paths, and out of scope as a refactor of an existing effects module). So
`resolveSessionEffectiveState` is a constructor-injected thunk: `runtime.ts`
wires `() => effectiveStateSessionSection(repoRoot)` in, and the collector
only adds the memoizing shell around it. The same reasoning is why
`StateInputCollector`/`StateInputCollectorDeps` are generic over
`TEvent`/`TSessionEffectiveState` instead of importing `HookEvent` (from
`./route-registry`, also `src/cli/*`) or `SessionContextSection` (from
`./session-context-budget`, also `src/cli/*`) -- both types flow in by
inference from `runtime.ts`'s call site, so the effects module never needs
to name them.

### `ownedByCurrent` semantics (caught while writing, not obvious from naming)

The natural-looking `owner === null || safeRealpath(owner) === current`
is wrong: it reports "owned by current" when there is *no* owner marker at
all, which disagrees with the real authority's field,
`worktreeOwnerIsCurrent: Boolean(owner && safeRealpath(owner) === currentWorktree)`
(`resolve-effective-state.ts:534`) -- false, not true, when unset. Fixed to
`Boolean(owner && safeRealpath(owner) === current)` to match exactly, and
covered by the determinism test's exact-shape assertion.

### Wiring point in `runHook()`

The collector is constructed right after the opt-in check succeeds (i.e.,
once `repoRoot` is known and the repo has opted in), before route
resolution -- the earliest point at which per-event processing genuinely
begins. It is not threaded into any other current call site: PreEdit,
PostEdit, and Stop still self-resolve via their own shell scripts today
(HRD-03..06), and adding a second resolution anywhere for those events was
explicitly out of scope (would itself falsify the contract).

### Hidden side effects check

`effectiveStateSessionSection` itself is untouched (same file, same lines,
same body) -- only its call site changed, from a direct call to
`collector.getSessionEffectiveState()`. `tests/hook-runtime-
characterization.test.ts` (byte-identical against the HRD-01 golden,
including per-route subprocess counts and the full write-set) is the
empirical proof that routing it through the memoizing collector introduced
no extra subprocess spawn, no extra durable write, and no output change.

## Deviations From Plan Or Spec

- Narrowed interface: 4 of the audit's 8 restated Sense facts were
  deliberately left off the collector's interface under the contract's
  taste constraint ("if a getter needs new parsing logic, the getter is
  wrong; move on or hand back") -- their only authority is module-private
  to resolve-effective-state.ts, outside Allowed Paths. Recorded here as
  the authorized move-on branch; see Design Decisions above for the
  per-fact reasoning.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Export `effectiveStateSessionSection` from runtime.ts and import it into the collector vs. inject it as a constructor thunk | Inject | Effects modules cannot import `src/cli/*` (`check:state-boundaries` EFFECTS_REVERSE_IMPORT); injection also keeps `runtime.ts`'s function untouched, minimizing risk to the byte-identical golden |
| Checked-in golden fixture (`state-input-collector.json`) vs. comparing two live-generated normalized snapshots | Two-instance comparison | The contract marks the golden optional; two fresh fixture repos compared to each other proves determinism without needing update-golden plumbing |
| `mock.module('fs', ...)` vs. a NUL-byte-poisoned repo root | NUL-byte poison | Proves laziness with a single plain assertion (construction must not throw; every getter afterward must) without globally replacing `fs` for the test file |
| Reproduce `deriveContractPath`'s stem/legacy selection rule locally vs. omit the contract-marker getter | Omit | The selection rule is private, non-exported logic; copying it risks silent drift from the real rule |

## Open Questions

- If a future package needs `policy`, `candidate/diff summary`, or
  `capability mapping` as collector getters, the blocking dependency is the
  same each time: a policy reader (currently private to
  `resolve-effective-state.ts`) has to become an exported, same-layer
  authority first. That is a deliberate export decision for whoever picks
  it up, not something this package should force through the back door.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
