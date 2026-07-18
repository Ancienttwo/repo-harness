# Implementation Notes: lsc-08-adapter-parity-and-docs

> **Status**: Active
> **Plan**: plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md
> **Contract**: tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md
> **Review**: tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md
> **Last Updated**: 2026-07-19 03:10
> **Lifecycle**: notes

## Design Decisions

- MCP `CompactEffectiveState`/`StateSummaryResult` gain `readiness` and
  `guidance` as verbatim copies of `EffectiveStateV1['readiness']` /
  `['guidance']` in `projectCompactEffectiveState` — no recomputation, no
  tool/route/CLI rename, no removed field
  (`src/cli/mcp/state-tools.ts:18-35,104-131`).
- Falsifier-first: the allowed-to-stop/not-ready-to-ship cross-adapter
  assertion was written and confirmed failing (`mcp.readiness` /
  `mcp.guidance` both `undefined`) before touching `state-tools.ts`, then
  confirmed passing after (`tests/state/adapter-parity.test.ts`, 17/17
  pass). Fixture recipe (Strict profile, contract present, worktree owned,
  handoff/resume present but review/external/checks stale) was verified
  empirically via a standalone probe before being written into the test —
  it reproduces the frozen `strict.stop.not-ready-to-ship-still-allows`
  cell (`allowedToStop=allow`, `readyToShip=block` with
  `required_review_missing,required_external_acceptance_missing,
  required_checks_missing`) from the same characterization fixture set.
- `MCP_COMPACT_FIELDS` also gained the two fields, so the pre-existing
  generic per-scenario loop (all 9 ESA golden scenarios) now additionally
  proves MCP-vs-authority and CLI-vs-authority parity for readiness/
  guidance for free, without a second assertion shape.
- Hook-level parity for the allow-to-stop/not-ready-to-ship fixture drives
  the real `.ai/hooks/stop-orchestrator.sh` read-only (via `bash`, stdin
  JSON, `REPO_HARNESS_CLI` pinned) and asserts on its emitted stdout/stderr
  (no block JSON, `[ReadinessGate] readyToShip=false (missing: ...)` on
  stderr with the authority's own `reasons.join(',')`) — proves the hook's
  consumed decision/reason without parsing internal hook state.
- Scalar-readiness guard in `stop_resolve_state()`'s jq branch: added a
  `.readiness | type` check before the five `.readiness.*` jq reads: only
  `object`/`null` proceed to extract fields, anything else logs
  `[StopReadiness] readiness field is not an object (...)` to stderr and
  leaves the fields at their skip-readiness default. The bun branch was
  already safe (`(s.readiness && typeof s.readiness === "object") ?
  s.readiness : {}` degrades non-object-and-non-null to `{}` without
  throwing). Empirically: under this script's actual call convention
  (`stop_resolve_state || true` at every call site), a scalar `.readiness`
  did NOT abort the whole hook even pre-fix -- the `|| true` list
  exemption suppresses `set -e` for the entire function body, so each of
  the five failing jq assignments degraded silently and independently
  (stderr swallowed by each call's own `2>/dev/null`). The guard's real
  value is replacing that opaque multi-failure silence with one explicit,
  intentional, diagnosable skip path -- not fixing a literal crash. Mirror
  to `assets/hooks/stop-orchestrator.sh` is cmp-identical;
  `.ai/hooks/.projection.json` refreshed via `bun
  scripts/sync-hook-sources.ts --write` (assets/hooks is that script's own
  canonical root, so both copies were made byte-identical by hand first --
  otherwise `--write` would have overwritten the `.ai/hooks` fix back from
  assets/hooks).
- Characterization probe: added `readinessSurface(state)` (returns
  `state.readiness` when it is a non-null, non-array object, else `{}`) and
  merged it into `captureEdit`/`captureStop`'s existing `semanticSurface`
  (between `state` and the stdout-parsed decision objects, which keep
  precedence) and into a new `captureShip` `shipSemanticSurface` (merged
  with `checks`). Regenerated via `UPDATE_LOOP_SEMANTICS_GOLDEN=1`; diff
  against the pre-change golden touched exactly six lines: all three edit
  cells and all three stop cells shrank `missing_semantic_fields` to `[]`;
  all three ship cells are byte-identical (unchanged) because
  `captureShip`'s fixture never has the ship envelope call `state
  resolve` -- its `.ai/harness/state/effective.json` stays the
  hand-seeded `{workflow_profile, state_version}` stub with no `readiness`
  key, so `readinessSurface()` genuinely contributes nothing there. No
  other `current` field, no `approved_target_delta` byte, no
  `TARGET_DELTAS` byte, and no flat ESA golden
  (`tests/state/fixtures/*.json`) changed. Confirmed via two consecutive
  non-regenerating runs (deterministic).

## Deviations From Plan Or Spec

- The dispatch named "the five `tests/cli/hook.test.ts` Delegation Fallback
  fixtures" by inference from test-name pattern matching ("fallback" in the
  name). Empirically, membership was different: pinning `REPO_HARNESS_CLI`
  alone caused 5 tests to newly FAIL (not the same 5 initially assumed) --
  `Codex Stop matches the advisor delegation scope for a whitespace-padded
  transcript_path identifier (firstString trim parity)` is one of the real
  five (its assertions depend on Stop reaching
  `delegation_should_block()`), while `Unscoped delegation state collapses
  statePath onto latest.json; SubagentStart and Stop both skip the shared
  write...` is NOT (its assertion is "the file did not change", which
  holds vacuously regardless of whether Stop's delegation gate ever runs).
  Trusted the actual failing-test list over the a priori name-matched
  guess.
- Pinning only `REPO_HARNESS_CLI` was not sufficient to make the five pass
  with ambient PATH: it makes `stop_resolve_state()` succeed for the first
  time against these bare disposable fixtures (no plan/contract), which
  resolves `workflow_profile=lite` -- triggering LSC-07's lite-profile
  Stop early exit (`stop_maybe_block_on_readiness || true; exit 0`)
  *before* the script ever reaches `delegation_should_block`. Fix: also
  set `REPO_HARNESS_WORKFLOW_PROFILE=standard` alongside
  `REPO_HARNESS_CLI` in the same five fixtures (plus the shared
  `spawnStopHookProcess` helper, used only by three of them) -- an
  existing, already-sanctioned env override `stop_resolve_state()` reads
  itself (`--profile "$REPO_HARNESS_WORKFLOW_PROFILE"`), not a hook
  decision-logic change. This stays "test-env hygiene only, no product
  change": it steers an existing knob, it does not edit hook branching.
  One assertion (`expect(first.stderr).toBe('')` in "Codex Stop fallback
  marks once...") was investigated as a possible casualty of the new
  Standard-profile `[ReadinessGate] readyToShip=false` stderr note, but
  `codexStopSuppressSuccessOutput` in `src/cli/hook/runtime.ts:494-500`
  swallows all child stdout/stderr for a successful (exit 0) Stop under
  `HOOK_HOST=codex`, replaying either stream only on a non-zero exit --
  so the original empty-stderr assertion was already correct and needed no
  change (a documented near-miss, not a real deviation).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Compare MCP/CLI/Hook pairwise (adapter-to-adapter chain) vs. each adapter to the resolved-state/readiness authority | Each adapter to the one authority | Contract taste constraint; a chain can pass while every adapter drifts from the real authority in the same direction |
| Add a 10th `SCENARIOS` entry (with a new golden fixture) for the allow-to-stop/not-ready-to-ship case vs. a standalone test with its own fixture | Standalone test | Extending `SCENARIOS` requires a new flat ESA golden file, which is explicitly out of scope (any drift there is a regression); a self-contained test proves the same cross-adapter claim without touching that surface |
| Merge `readinessSurface(state)` generically in all three capture functions vs. special-casing ship | Generic, symmetric merge | Produces the contractually-required "no shrink" result for ship *by construction* (the ship envelope's cache genuinely has no `readiness` key), rather than by an ad hoc exception; forward-compatible if ship ever starts consuming real state resolve output |
| Guard only the jq branch vs. also touching the bun branch's already-safe ternary | jq branch only | The bun branch's `(x && typeof x === "object") ? x : {}` already degrades any non-object (including non-null scalars) to `{}` without throwing; touching it would be an unrequested, inert change |

## Open Questions

- None.

## Migration Note

- MCP `summarize_repo_harness_state` output gains two additive top-level
  fields (`readiness`, `guidance`); no field removed, no tool/route/CLI
  renamed. Existing MCP consumers that read the compact state by exact key
  set (rather than ignoring unknown keys) should tolerate two new keys.
- `.ai/hooks/stop-orchestrator.sh` (and its `assets/hooks/` mirror) now
  degrade to skip-readiness with a `[StopReadiness]` stderr note instead of
  relying on jq's per-field `2>/dev/null` swallowing when
  `state resolve`'s `readiness` field is present but not an object or
  null; `workflow_profile` resolution and every other Stop gate are
  unaffected. No consumer-visible behavior change under the documented
  `readiness: object | null` contract.
- `tests/cli/hook.test.ts`'s five affected Delegation Fallback fixtures now
  pin `REPO_HARNESS_CLI` (repo-source CLI) and
  `REPO_HARNESS_WORKFLOW_PROFILE=standard`; this is test-environment
  hygiene, not a product change, but is recorded here because it changes
  what those fixtures actually exercise (previously accidental
  never-resolves-readiness paths, now the real Standard-profile Stop
  readiness path with `durable_recovery_state` satisfied and ship evidence
  genuinely absent).

## Non-Goals (Explicit Record For The Ledger)

Row 8 proves adapter parity against the *current* behavior of
`pre-edit-guard.sh` and the ship scripts
(`verify-sprint.sh`/`ship-worktrees.sh`/`contract-worktree.sh`); it does
NOT cut either surface over to consume the shared readiness authority as
its own decision kernel. Concretely, out of scope for this sprint row and
left as recorded future work:

- `pre-edit-guard.sh` continues to resolve its own `WorkflowProfileGuard`
  decision independently of `EffectiveStateV1.readiness.allowedToEdit`; the
  characterization probe now merely *observes* that both surfaces agree
  where they overlap, it does not make PreEdit call `evaluateReadiness`.
- `verify-sprint.sh` / `ship-worktrees.sh` / `contract-worktree.sh` remain
  profile-blind at the ship-script level (`shipProfileObservation()` still
  finds no `workflow_profile`/`workflowProfile` reference in their
  source); `.ai/harness/checks/latest.json` still has no `readyToShip`,
  `workflowProfile`, `requirementsResult`, or `nextAction` fields, and the
  characterization golden's three ship cells correctly stay unshrunk for
  that reason (see Design Decisions above -- not faked closed).
- Single-kernel cutover for those two surfaces (PreEdit and the ship
  script chain consuming `evaluateReadiness` directly, the way Stop does
  since LSC-07) is future work beyond this sprint's acceptance line, which
  only requires proving parity against current behavior.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
