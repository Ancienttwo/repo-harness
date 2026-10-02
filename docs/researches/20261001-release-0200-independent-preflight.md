# Next release preparation and independent preflight

Preparation status: OPEN / NOT FROZEN. Working release label: 0.20.0; final scope, version, date and source revision remain subject to work closeout.

Initial observations: 2026-10-01 (+0800). Scope: independent inspection and reversible preparation only; publication remains owned by the existing `codex/release-0.20.0` task. No candidate metadata, product source, global installation, daemon, or publication was changed.

## P1: authority and boundary

`package.json` and `assets/skill-version.json` supply package/template version authority. `scripts/check-npm-release.sh` requires an unpublished package version, then runs the complete `scripts/check-ci.sh` all lane. The existing release contract (`tasks/contracts/20261001-0133-release-0-20-0.contract.md` in the release-0200 worktree) is the sole executable authority for that candidate; its release-all evidence policy is current_exact. Published verification independently binds registry integrity, tarball, installed runtime, version tag and source stamps through `scripts/check-release-published.sh`. The initial observed clean main was cebb590e; the initial existing release candidate was based on eeb4cff5 with uncommitted 0.20.0 metadata. These are historical observation points, not the final release baseline.

## P2: historical preflight evidence

- Clean cebb590e main: `bun run check:release` exited 1 after hooks/helpers passed, because repo-harness@0.19.5 already exists on the official npm registry. The full suite was not entered; this is a version admission failure, not a test failure. Raw evidence: `.ai/harness/runs/independent-release-preflight/main-check-release.log`.
- Registry readback: latest is 0.19.5; lookup of 0.20.0 returned E404. This proves version availability only, not release readiness.
- Existing release candidate: HEAD eeb4cff5; package/template fields are prepared for 0.20.0, but `assets/reference-configs/host-invariants.md` is absent. Candidate notes explicitly require integrating cebb590e before publication; the owning docs CLI regression is also absent from that base.
- The source-context version check run in the candidate reports package/template 0.20.0 consistency. Its separate downstream project migration notice (0.14.0 -> 0.20.0) is not a failed candidate version check. Running the same script from another checkout checks that checkout's package authority, so it must not be substituted for candidate evidence.
- Existing canonical release-all record vx-52f9963c5f2b4dd5a35f: command exit 0, duration 1,116,018 ms, no timeout, but passed=false because the repository snapshot changed during execution. Its log includes `[ci] OK` and `[release] OK`; neither overrides the current_exact refusal. Observed record copied read-only to `.ai/harness/runs/independent-release-preflight/observed-release-result.json`.
- The release review still says Pending / Recommendation: fail. No final immutable candidate or published/installed 0.20.0 state is established by these observations.

## P3: preparation while work continues

The initial preflight was NOT READY for the then-current subject. The user subsequently specified: prepare now, do not freeze while other work is ongoing; publication remains with the existing release owner. Therefore no final candidate, version lock, release tag, publication, global installation or new exact-subject full gate is performed by this preparation.

Latest read-only update: the existing release worktree is clean at 4d1e334f, following d065e967, and now contains the host-invariants asset. The stale-asset finding is resolved in that observed candidate. The external commit title says "freeze current-main 0.20.0 candidate"; that is an external candidate record, not evidence that all ongoing work is complete or permission for this independent task to freeze/publish. The prior exit-0 / snapshot-changed record remains historical and cannot certify that newer subject.

### Rolling scope inventory

| Area already observed on main | User-visible release note direction | Acceptance evidence to carry forward |
| --- | --- | --- |
| Herdr task-agent lifecycle and task-goal MCP rename | Persistent task-scoped peers; retired Codex goal names/path return upgrade errors, with no aliases | Existing stage proof and public compatibility notes; retain their declared unverified boundaries |
| Trusted engineer observation preparation | Prepared observations and first-offer staleness checks | Owning Engineer contract and exact installed/source regression evidence |
| Reviewer startup cleanup and MCP observation completion | Owned provider cleanup on failed setup; delivery baseline precedes accepted working/idle observation | Existing real private Herdr regressions, matching Result/observation distinction and parent preservation |
| ArchContext maintenance reminder | Request authorization for stale daemon maintenance | Existing reminder verification; no automatic daemon replacement/index reset |
| Host-invariant guidance | Bundled `docs show host-invariants` reads canonical runtime guidance | Canonical asset/projection equality and installed-package-owned path/list/show readback |
| Work still in progress | To be added only after its owner marks it ready and it lands | Pending per user notice; no completion claim, final inclusion or date assigned |

This inventory is a planning aid, not an additional version authority or executable Verification Plan. Maintain one changelog/package owner. Research-only material remains research; unmerged/in-progress work is not promoted to a supported runtime claim by appearing here.

### Ready-to-run handoff when work closes

1. Re-read ongoing work and the latest main; update this inventory for landed changes and explicit exclusions. Decide final version/date/scope with the release owner at that point.
2. Integrate intended landed work into the owner's candidate and finish metadata, generated projections, compatibility copy and review notes. Until work closes, candidate changes invalidate exact evidence normally; do not repeatedly run expensive exact gates on a moving subject.
3. After the user/owner closes preparation, the existing contract's Verification Plan remains the sole command authority for release-all and version checks. Keep the candidate stable during that run and verify its subject remains unchanged. Do not rewrite or waive the historical snapshot refusal.
4. The existing owner handles merge/tag/npm publication after its required acceptance. Published verification stays at `scripts/check-release-published.sh`; also read installed `docs show host-invariants` from the registry-bound package, preserving source-root routing isolation and byte identity.
5. Record registry integrity, tag/commit and installed runtime readback separately from source/CI acceptance. Preparation itself makes no "available to npm consumers" claim.

No competing release candidate or duplicate full suite is prepared here. This handoff is ready to update as work lands; it deliberately sets no final SHA, freeze time, release date or publication deadline.

The Herdr proof currently covers private deterministic transport fixtures, not real harness auth, sandbox enforcement, model choice or session resume. Those capabilities remain explicitly unverified in `docs/researches/20260930-herdr-task-runtime-proof.md`; this inspection creates no model canary authorization or full-cutover AcceptanceReceipt, and does not add a new release gate or widen the existing release task.

No product fix or new dependency/test was introduced. This file is the durable inspection report; transient raw evidence remains in the ignored runtime cache. A second full suite was deliberately not run against a competing or stale candidate.
