# Implementation Notes: lsc-01-profile-operation-characterization

> **Status**: Active
> **Plan**: plans/plan-20260716-0150-lsc-01-profile-operation-characterization.md
> **Contract**: tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md
> **Review**: tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md
> **Last Updated**: 2026-07-17 16:40
> **Lifecycle**: notes

## Design Decisions

- Use one focused test and one JSON matrix fixture; there is no second current
  consumer that justifies a helper abstraction.
- Reuse ESA fixture helpers and four ESA golden scenarios as read-only lineage.
- Bind each referenced ESA golden to its full-file SHA-256 and verify that its
  declared scenario matches the reference before a cell is captured.
- Keep observed current behavior separate from inert approved target-delta data.
- Derive ordering and profile-source inventory from current production source
  markers, and derive ship guards/missing semantic fields from runtime output;
  no inferred gate chain is stored as a runtime observation.
- Snapshot the whole disposable repository, excluding only its `.git/` metadata
  and `.home/` transport cache, so additions, changes, and deletions outside
  `.ai/harness/` remain visible.
- Validate all nine semantic invariants before update mode may rewrite the JSON
  golden, so a failed invariant cannot silently promote a bad baseline.
- Treat raw nondeterministic transport fields as excluded input rather than
  normalized output; every captured semantic value remains byte-exact.
- Throw on subprocess spawn failures, parse Stop decision JSON across both
  whole-document and diagnostic-plus-line transports, and pin exact ship
  exit/reason values before update mode may write.

## Deviations From Plan Or Spec

- The third fail -> fix -> reverify round exposed fixture contamination rather
  than a production semantic mismatch. `isolatedEnv()` places `HOME` under the
  disposable repository as `.home/`; Bun then creates nine untracked cache
  files there. Effective State correctly merges those Git-visible paths with
  `src/feature.ts`, raises the deterministic floor to Standard via
  `risk-floor:standard:medium-scope`, and rejects the explicit Lite profile as
  `workflow_profile:profile_below_risk_floor`. A clean/committed fixture still
  reproduces this because the cache files are created by the hook subprocess.
  Per the contract's three-round cap, no fourth fixture correction was made
  until the user explicitly approved that bounded correction.
- After approval, the test adds `.home/` only to the disposable repository's
  local `.git/info/exclude`. This keeps runtime cache files outside the Git
  review subject without changing production code, the shared ESA helper, or
  any committed fixture semantics.
- Independent review found that the initial Standard scenario only represented
  an Executing plan. The final scenario now constructs an Approved Work Package
  with zero open tasks and a parsed/asserted minimum execution contract covering
  scope, target path/capability, acceptance, verification command, and rollback,
  then removes only the separate Contract. Current behavior still blocks with
  `missing_contract`; the approved target delta remains inert `allow` data.
- The first full-suite pass exposed that a new top-level JSON under the ESA
  fixture directory is automatically treated as an ESA adapter-parity scenario.
  The LSC golden moved into the dedicated nested path
  `tests/state/fixtures/loop-semantics/characterization.json`; the fixture bytes
  and production behavior did not change.
- Claude's first frozen-subject review reported nine P2 advisories and no P1.
  The accepted corrections made infrastructure failures fail closed, made Stop
  decision transport parsing lossless for current shapes, bound ESA references
  to full file bytes, corrected the Standard ship cell name, made the
  exclusion-not-normalization contract truthful, and pinned Stop branch
  evidence. Source-inventory observations remained because the contract
  explicitly distinguishes them from runtime gate output.
- The correction recheck reported two remaining P2 advisories: a Strict
  metadata rewrite could silently no-op, and ship update-mode invariants did not
  pin exit/reason. Both now fail closed. Claude's final correction recheck
  returned exactly `No P1/P2 findings.`
- Round-2 correction (post-freeze, ordered by the acceptance owner after a real
  Codex external-acceptance FAIL on the frozen subject): Codex found two P1s.
  (1) The three `ship` cells only inferred `ship-worktrees.sh` /
  `contract-worktree.sh finish` invocation from source-marker text position,
  so a control-flow bug leaving the marker string in place would still pass.
  (2) `lite.ship.no-profile-readiness` fed no real Lite signal; the "lite"
  label came only from the static `PROFILE_OPERATION` lookup, not from the
  fixture input, making it indistinguishable from any other profile's
  missing-contract setup. Both are now fixed: see Tradeoffs Considered below
  for the scoping decision on `ship-worktrees.sh` itself.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| One matrix fixture | Use | Smallest auditable nine-cell surface and one rollback boundary |
| Nine fixture files plus helper | Reject | Adds an abstraction and file fan-out for one current consumer |
| Future evaluator in tests | Reject | Would create a shadow semantic authority before LSC-02/06 |
| Dynamically invoke `contract-worktree.sh finish` directly on the disposable fixture | Use | Empirically verified deterministic, zero-side-effect, zero-setup failure: every profile hits `is_linked_worktree`'s real guard (`"finish must run from the linked contract worktree"`, exit 1) before any archive/commit/merge-gate/network step, because the ESA fixture is a plain repo, never a linked worktree. Proves real execution, addressing the P1 directly. |
| Dynamically invoke `ship-worktrees.sh`'s real linked-worktree dispatch (`ship_linked_pr` / `require_finish_ready`) | Reject | That path is reachable only when `is_linked_worktree()` is true; making the disposable fixture an actual linked worktree (fake `origin` remote, real `git worktree add`, careful sequencing) is disproportionate setup for an eval-only characterization package. The alternative reachable path (`ship_primary_pr` / `ship_primary_dirty_pr`) tests different, less-relevant code and risks reaching real branch-creation/merge-gate-invocation logic — probing it would be misleading, not clarifying. `envelope_ordering` remains explicit static source inventory (labeled `envelope_ordering_source: static_source_inventory_ship_worktrees_sh`), matching the plan's own P2 design ("ordering is derived from current source markers"); the new dynamic `contract_worktree_finish_probe` field is the added strengthening. |
| Feed `workflow_profile` into every ship cell (env var + Effective State write), not only `lite` | Use | `captureShip()` is one shared function across all three profiles; special-casing only `lite` would be less consistent than mirroring `captureEdit`/`captureStop`, which already feed a real profile signal for every profile. `shipProfileObservation()` still confirms the ship scripts are genuinely profile-blind (`profile_aware: false` unchanged), so this only strengthens the *input*, not a behavior claim. |

## Open Questions

- None. The user approved the bounded fixture-only correction on 2026-07-16.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Contract preflight: `preflight_pass` with no issues on 2026-07-16.
- Strict workflow: `[workflow] OK` after adding the complete Promotion Gate.
- Effective State readback: `task_profile=eval-only`, exact nine-entry
  allowlist, `blockers=[]`, execution base
  `be3e93ce72c812a33045a15c4d97452c59fa3fbb`.
- Ancestry: ESA `3b33cea2422b1aa1e5be9080be54f731c4f2015d`
  is an ancestor of the exact LSC-01 base.
- Three-round stop evidence: the Lite edit probe exits 2 through
  `WorkflowProfileGuard`; a diagnostic Git readback shows nine untracked
  `.home/Library/Caches/bun/@t@/*.pile` files, which are the extra
  medium-scope paths. That failed observation was not promoted, and no
  production path was edited. After explicit approval, the bounded fixture-only
  correction passed.
- Focused characterization: intentional update-mode generation and the final
  read-only golden comparison passed (`1 pass`, `21 expect()`); the final
  golden contains exactly nine cells and four full-file ESA hashes.
- Targeted regressions after code freeze: four ESA golden scenarios, four
  profile/PreEdit scenarios, three Stop scenarios, and six verify/finish/ship
  helper-order scenarios all passed (`17 pass`, `0 fail`).
- Compile/scope: `bun run check:type`, contract preflight, strict workflow,
  execution-base ancestry, and `git diff --check` passed.
- Independent read-only acceptance: test semantics review PASS and contract /
  workflow self-containment review PASS; no P1/P2 findings remain before final
  root evidence and external acceptance.
- First full-suite pass: `1591 pass`, `1 skip`, `1 fail`; the sole failure was
  ESA adapter parity enumerating the top-level LSC JSON as an ESA scenario.
  After the nested-path correction, the complete adapter-parity file passed
  (`16 pass`, `0 fail`) and the focused LSC test passed again.
- The pre-external-review full-suite pass after that fixture-only correction:
  `1592 pass`, `1 skip`, `0 fail`, `14066 expect()` calls across 124 files in
  579.79 seconds. The skipped Windows junction case is the repository's
  pre-existing platform-specific skip.
- Final full-suite evidence after the external-review corrections and final
  code freeze: `1592 pass`, `1 skip`, `0 fail`, `14069 expect()` calls across
  124 files in 612.83 seconds. The same pre-existing Windows junction case is
  the only skip.
- Required root gates after that final suite:
  `check-deploy-sql-order.sh` (`OK`), `check-architecture-sync.sh`
  (`blocking=0`), `check-task-sync.sh` (`synchronized tasks/ updates`), strict
  workflow (`OK`), project-state inspection (no drift or required decisions),
  adopt dry-run (zero operations), and `git diff --check` all exited zero.

## Round 3 Closeout Decision (2026-07-18)

Local Codex CLI access broke between round 2 and round 3 (account/model-routing
auth error, confirmed non-transient via two independent invocation attempts).
User explicitly authorized substituting an independent Claude-run adversarial
review (`gatekeeper`) for the blocked Codex round 3, and separately authorized
bypassing `scripts/ship-worktrees.sh`'s canonical `--ready` path entirely for
this closeout, given the mechanical `workflow_external_acceptance_pass` check
derives its required-reviewer identity from live process signals
(`HOOK_HOST`/`CODEX_*`) and has no accommodation for a human-authorized
exception — spoofing that signal was explicitly declined as falsifying the
audit trail, not attempted.

`bun scripts/merge-gate.ts verify --base main --format sha` was attempted
manually as a substitute for the piece `ship-worktrees.sh` normally runs, but
refuses by design: `helperFingerprint()` requires the invoked script to live
outside the candidate repo it's verifying (anti-tampering property), so it
cannot be run standalone from inside this worktree without copying the script
to a separately-trusted location — which would be defeating the same guard by
a different route, and was not attempted. This repo's `.github/workflows/ci.yml`
runs on `pull_request`/`push` and independently re-runs the full test suite on
GitHub-hosted infrastructure once a PR is opened, which is the closest
available substitute for local merge-gate verification in this bypass path.

Ship proceeds as: fresh required checks (already re-verified by gatekeeper
this round) -> honest review.md update recording the Claude-substitution and
why the mechanical gate still fails closed -> manual `git push` + `gh pr
create` (no auto-merge) -> stop for human/CI confirmation before merge.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
