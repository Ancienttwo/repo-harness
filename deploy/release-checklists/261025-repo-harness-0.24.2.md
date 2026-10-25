# repo-harness 0.24.2 — draft release checklist, HOLD

## Authority and source

This file prepares a release. It does not record a release or grant publication
permission. Source observed on 2026-10-25:
`e9acac851ce539a1c62a2f84cd80852c0b4034ae`.
No candidate SHA is frozen. The package is still 0.24.1; paired archctx and
archctx-contracts pins are 0.9.3. No version file changes in this branch.

- [ ] Freeze the exact source commit after open work and acceptance decisions settle.
- [ ] Review the merged range since 0.24.1 and prepare the changelog.
- [ ] Set package.json and assets/skill-version.json consistently to 0.24.2.
- [ ] Verify CLI/status version derivation and lock metadata.

The [closeout plan](../../plans/261025-repo-harness-0.24.2-hold.md) records exact
merge SHAs, remaining owners and evidence limits. Merged source is not a release.

## Completed source prerequisites

- [x] #952 initial bounded CI support, merged `2b212057380c28983e6138b7c561bc2b05bc3e8f`.
- [x] #953 isolated AXR5 cleanup, merged `468c88ce3c6fa9415be6beafa5cc086d62eaef51`.
- [x] #954 initial HOLD documents, merged `846c6d1a45782ec2e18fac815ef2ba026f290869`.
- [x] #955 final exact receipt-bearing CI binding, merged `536a1d9831e03fd6e0ab46e58e49de9b4f949901`.
- [x] #951 paired 0.9.3 integration, merged `cb900a7fe5ebd04830fdfa62e1b18e25ec969148`.
  Real isolated acceptance and exact-head CI40212319529 passed. The receipt's
  projection was human-action-required / CodeGraph unavailable; it is not full projection acceptance.
- [x] #957 sink repair, merged `b4c8b53b43c376a4da1e17a10c1fe40fc98e7d72`; #956 closed.
  Ready-CodeGraph flow proof was 108/108 and CI40214204040 passed at the repair head.
- [x] #950 handwritten architecture scope, merged `e9acac851ce539a1c62a2f84cd80852c0b4034ae`; #948 closed.
  This does not accept unrelated generated output, anchors or practices gaps.

## Open work and acceptance holds

- [ ] #895 / #898: obtain existing writer's current-head verification and acceptance.
  Observed writer head `829dae036a60466e32176fffb007e2f28d139a26`, declared base
  `b4c8b53b43c376a4da1e17a10c1fe40fc98e7d72`; this is before the observed main.
  #898 has no separate claim comment. Do not infer freshness from mergeability
  or start a replacement writer. Do not hand-edit generated files.
- [ ] #903: coordinate active Claude session `issue-903-review-key-d49bb5` on
  branch `claude/issue-903-review-key-d49bb5` for remaining review-key identity
  and six contract-supplied receipt inputs. Stop #927 is done; #926/#906 are merged.
  No replacement design or owner takeover is approved by this checklist.
- [ ] #917: reconcile closed issue state with its last blocked product-acceptance
  status and retained Claude deep-worker claim. Closure is not acceptance evidence.
- [ ] Resolve or explicitly disposition the historical 17 projection major actions.
  The existing writer owns publication; this document does not accept them.
- [ ] Assign/disposition the historical 10 anchor findings; per-finding ownership
  was not confirmed. Do not silently assign them to the completed #950 scope.
- [ ] Assign/disposition partial practices coverage (not enabled/evaluated).
  No owner or current acceptance was confirmed.

The 17-action, 10-anchor and practices measurements are from #957 head
`24633552040b45739e7dccec79017ac7ed1ed435`, not a new check of current main or
writer head. Model validation then also warned that manifest review.failOn is
ignored. None of these gaps was waived by green PR CI.

## Verification on the frozen candidate

- [ ] Exact-head independent reviews and Required CI are satisfied.
- [ ] Run the authorized release full-CI check once after scope is fixed.
- [ ] Run `bun run check:release` for the separate package/install gate.
  Neither check has run for 0.24.2; prior PR checks do not replace them.
- [ ] Record the consumer architecture smoke from tests/hook-runtime.test.ts:
  a registry consumer without code facts or a projection manifest gets one architecture line (#850).
- [ ] Record current readiness and each yellow flag with its remedy or explicit
  current acceptance. 0.24.1 acceptance does not carry forward.
- [ ] Record skill evaluations: full_test_count, dry_run_ratio, grader_pass_rate
  and effectiveness_authority. These remain unavailable for the unfrozen candidate.

## Publication and rollback

Status: HOLD. No 0.24.2 tag, GitHub Release, npm publish or deployment has occurred.
Publication and any further merge require applicable authorization and gates.
Archive artifact digests and source SHA only after real release verification.
Derive rollback from the eventual release change; no rollback tag is created now.
