# repo-harness 0.10.1 Release Filing

- Date: 2026-07-19
- Package: `repo-harness@0.10.1`
- Base release: `v0.10.0`
- Release scope: the Loop Semantics Convergence line on top of the Effective
  State authority — ESA core/effects seams (PR #79), CRG-01 closeout runner
  guardrails (PR #83), LSC-01..08 (PRs #82, #84..#90: frozen 9-cell
  characterization baseline; ArtifactRequirementPolicy matrix; Standard
  missing_contract cutover; four-way revision partition + progress token
  with circuit-key cutover; in-lock stable-snapshot version allocation;
  evaluateReadiness authority; Stop cutover removing install-fallback/
  mtime/cache crutches; four-adapter parity with the MCP surface closed),
  review-triggers convergence, the closeout-authority ship-gate repairs
  (PR #91: contract-declared evidence requirements; freeze-before-archive
  merge-gate receipts), and the ESA-era test retirement (PR #92, net -25
  duplicate tests).
- Publish status: **pending publish** (checklist below updated as steps land).

## Preflight Evidence

- `npm view repo-harness version dist-tags --json` returned
  `version: 0.10.0`, `dist-tags.latest: 0.10.0` at prepare time.
- `npm pack --dry-run --json --ignore-scripts` reported
  `repo-harness-0.10.1.tgz` with 418 files on the prepare candidate.
- Version parity: `package.json`, `assets/skill-version.json`
  (version + templateVersion + 0.10.1 ledger entry),
  `.claude/.skill-version` stamp, and the five README variants all read
  `0.10.1`; `bun scripts/check-skill-version.ts --project .` passes.

## Verification

- Every constituent PR merged with independent gatekeeper PASS, full
  `bun test` green at its own subject, and CI green (two Test jobs + six
  MCP path-matrix jobs per PR). Suite size moved 1392 -> 1687 across the
  line, then -25 to 1662 via the test retirement (PR #92: 1661 pass /
  1 skip / 0 fail, verified by three independent runs).
- External acceptance for the line was recorded under the documented
  Claude-gatekeeper-substitution exception (Codex CLI quota-limited until
  2026-08-16), stated explicitly in each package's review file rather than
  claimed as clean Codex passes. The PR #91 repairs retire the manual-ship
  pattern for future closeouts; the reviewer-identity gating remains
  tracked in `tasks/todos.md` (solo-operator row).
- `bun run check:release` result recorded below at candidate freeze.

## Publish Checklist

- [ ] Push the release-prep commit to `origin/main`.
- [ ] Confirm CI for the pushed commit is green.
- [ ] Run `bun run check:release` on the release commit.
- [ ] Publish `repo-harness@0.10.1` to npm with the `latest` dist-tag.
- [ ] Push annotated tag `v0.10.1` at the published source commit.
- [ ] Create GitHub release `repo-harness 0.10.1`.
- [ ] Run `bash scripts/check-release-published.sh 0.10.1`.
- [ ] Refresh this machine's global install (`--profile standard`) and
      verify `repo-harness --version` returns `0.10.1`.
