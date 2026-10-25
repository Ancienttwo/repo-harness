# repo-harness 0.24.2 preparation — HOLD

This is a draft closeout plan, not a release receipt. No release candidate SHA is fixed.

Current main observed: 2cee26d888af9dd34ed52982e13df0c16db00681.
951 AXR5 slice: 3be464f3ad5c81e00dd55d2b9d1cc43d519a084d.

## Open scope

- #951: paired archctx 0.9.3 upgrade and AXR5 cleanup repair. Await bounded CI integration, exact-head independent review and real clean-room evidence. Old receipt failure remains visible.
- #950 / #948: separate architecture documentation owner. Preserve its unresolved model/rendering conditions; do not close by documentation-only inference.
- #895 / #898: writer-owned generated outputs. Read-only GitHub check returned head ef33704a1c46a883b80ef6210de494aa536f0ba5 and baseRefOid11227768b683580531f29dd489400dc47cd94501. It returned MERGEABLE, which differs from an earlier conflict report. This is not freshness or owner GO. Existing review comment covers old4891805, not current head. #898 remains open, no assignee or comments. Do not start a replacement writer or edit generated files.
- #903: parent confirms active prior owner and incomplete generic review identity migration. Dependencies926/906 are merged; they are not current blockers. Stop927 alone does not close the issue.

## Release preparation after candidate scope is settled

- Update package.json and assets/skill-version.json version/templateVersion consistently to0.24.2. Inspect CLI/status version derivation and lock metadata before editing; do not mass-replace historical version strings.
- Add docs/CHANGELOG.md0.24.2 entry from the exact merged commit range, separating shipped fixes from pending PRs. Do not list pending changes as released.
- Add deploy/release-checklists/261025-repo-harness-0.24.2.md with exact candidate/base, verification and publication status HOLD.
- Obtain current readiness evidence. The0.24.1 yellow-flag acceptance was specific to that release and does not carry forward.
- Record skill evaluation fields full_test_count,dry_run_ratio,grader_pass_rate,effectiveness_authority, or explicitly unavailable.
- Include consumer architecture smoke evidence for the no-codefacts/no-manifest registry case in tests/hook-runtime.test.ts.
- Only after fixing the candidate and confirming authority, consider one release full-CI run. bun run check:release is a separate expensive/package/install lane, not a replacement for exact-SHA green CI. Do not run either now.

No merge, tag, GitHub Release, npm publish, deployment, service operation or issue closure is authorized by this preparation note.

## Current execution checkpoint

- #951 updated to45ddb7e7be0272ceaeb53245181f5f8bea980969. Astra closed the two cleanup findings on this head; real integration and Required CI are still open.
- #952 is the standalone CI bootstrap at4475af0f7cfbdce9750ac58cc76c15dd1584e683. Its PR-event selector selected136 of295 test files, not the full suite. CI40203733912 is running; no final result is claimed here.
- Planned stack: reviewed CI bootstrap, AXR5-only support (script, helper, regression tests), then paired dependency upgrade. Keep Required checks on each exact candidate. No layer is merged merely to enable another layer.
- The current upgrade-only residual diff is exactly package.json,bun.lock,tests/architecture-projection-e2e.test.ts and three archctx-0.9.3 verification files. The upgrade note's current blob is c3dc61b8fee7ced041f7e22478e8e2e3b505c940, which differs from the bootstrap policy. Rebind only after the exact scope is settled and reviewed.
- A genuine new clean-room receipt would add another changed file. Do not assume the current six-file exception accepts it, or edit a receipt just to satisfy that exception. Reassess the exact reviewed scope when real evidence is available.
