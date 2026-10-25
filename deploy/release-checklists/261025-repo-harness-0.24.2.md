# repo-harness 0.24.2 — draft release checklist, HOLD

## Authority and source

This file prepares a release. It does not record a release or grant publication
permission. The user asked to close the repo-harness PRs and issues and prepare
0.24.2. No release candidate SHA is frozen. Main was observed at
`2cee26d888af9dd34ed52982e13df0c16db00681`.

- [ ] Freeze the exact source commit after the open work is resolved.
- [ ] Review the merged range since0.24.1 and prepare the changelog.
- [ ] Set package.json and assets/skill-version.json consistently to0.24.2.
- [ ] Verify CLI/status version derivation and lock metadata.

No version file has changed in this preparation branch. Pending PR changes are
not described as shipped. See `plans/261025-repo-harness-0.24.2-hold.md` for the
working closeout map.

## Open work and holds

- [ ] #951: complete paired0.9.3 integration, a genuine current clean-room
  receipt, independent review and Required checks on the final candidate.
  The old0.9.1 receipt assertion is still a real failure on the upgrade.
- [ ] #952: integrate the independently reviewed standalone CI bootstrap. Its exact-head CI is green,
  but it proves0.9.1 bootstrap only. Rebind the complete final upgrade diff;
  do not put a0.9.3 receipt into a0.9.1 support branch.
- [ ] [#953 AXR5 support](https://github.com/Ancienttwo/repo-harness/pull/953): complete the exact-head gates for
  `99041f2870387ea29e1977745ddd6a505783104c` on main.
  Mock lifecycle tests do not prove real daemon integration. No loopback
  restriction is waived by this checklist.
- [ ] #950 / #948: the dedicated owner must resolve model/rendering conditions
  and complete the architecture-documentation scope. Head
  `a94f3870b04bce8ab7c71b4d40f6bfc836eff380` has successful
  [CI40203361611](https://github.com/Ancienttwo/repo-harness/actions/runs/40203361611)
  and [Astra review](https://github.com/Ancienttwo/repo-harness/pull/950#issuecomment-6399051350); visual/model verification is still blocked.
  The old36ea33d result is not evidence for this head.
- [ ] #895 / #898: the existing writer must refresh the generated outputs and
  provide owner GO. Mergeability alone does not prove freshness. Do not edit
  the writer's generated files in a release-preparation branch.
- [ ] #903: coordinate the active owner and finish the remaining generic-review
  identity work. Stop recovery alone does not close this issue. Dependencies
  #926/#906 are already merged and are not current blockers.

## Verification on the frozen candidate

- [ ] Exact-head independent reviews and Required CI are satisfied.
- [ ] Run the authorized release full-CI check once after scope is fixed.
- [ ] Run `bun run check:release` for the separate expensive/package/install
  gate. It does not replace exact-head CI. Neither check has run for0.24.2.
- [ ] Record the consumer architecture smoke from tests/hook-runtime.test.ts:
  a registry consumer without code facts or a projection manifest gets one
  architecture line (#850).
- [ ] Record current readiness and every yellow flag with its specific remedy
  or explicit current acceptance.0.24.1 acceptance does not carry forward.
- [ ] Record skill evaluations: full_test_count, dry_run_ratio,
  grader_pass_rate and effectiveness_authority. All are currently unavailable
  for this unfrozen candidate; none is assumed to pass.

## Publication and rollback

Status: HOLD. No tag, GitHub Release, npm publish or deployment has occurred.
Publishing and any merge require their own applicable authorization and gates.
Do not infer them from preparation. Archive exact release artifact digests and
source SHA only after real verification. Derive the rollback command from the
actual eventual merge commit; no rollback tag is created now.
