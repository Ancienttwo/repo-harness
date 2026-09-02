# Implementation Notes: brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport

> **Status**: Active
> **Plan**: plans/plan-20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.md
> **Contract**: tasks/contracts/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.contract.md
> **Review**: tasks/reviews/20260902-2348-brc4a-browser-consult-transport-copy-profile-doctor-session-meta-transport.review.md
> **Last Updated**: 2026-09-02 23:48
> **Lifecycle**: notes

## Design Decisions

- **Capability detection needed no new probe shape.** `--copy-profile` is printed by
  `oracle --help`, `--browser-chrome-profile` only by `oracle --debug-help` (it is
  `hideHelp()` in the Oracle CLI). `probeOracle` already concatenates stdout and stderr of
  both invocations into one `helpText`, so a plain `helpText.includes(flag)` sees both. No
  parser probe in the style of `probeBrowserThinkingTime` and no version-number inference
  was needed. Verified on the pinned host binary: `oracle --help | grep -c copy-profile` = 1,
  `oracle --debug-help | grep -c browser-chrome-profile` = 1, and the inverse greps are 0.
- **The bound-profile path probes the binary before every real consult.** The capability
  gate calls `probeOracle` lazily and shares the result with the existing `--chatgpt-app`
  gate, so a bound consult costs one extra `--help`/`--debug-help`/parser-probe round rather
  than two. Cost accepted: without it there is no fail-closed signal for
  `ORACLE_COPY_PROFILE_UNSUPPORTED`.
- **Missing `profileDirectory` is a hard failure, not a degraded mode.** Oracle would fall
  back to the `Local State` `last_used` profile, which depends on whatever the user last
  opened in Chrome. That is exactly the class of silent, unattributable session the transport
  change is meant to remove, so `validateOracleProfileBinding` rejects it.
- **`browserCookiePath` stays in the doctor capability map.** The acceptance line adds two
  capabilities and does not retire one. Removing it would also loosen the doctor readiness
  bar in the same change that tightens it, so it is left alone; the wrapper simply never
  sends the flag any more.
- **Oracle's `--copy-profile` mutual exclusions need no defensive code.** Oracle rejects
  `--copy-profile` together with `--browser-manual-login`, `--browser-keep-browser`,
  `--remote-chrome`, and `--remote-host`. `buildOracleCommand` emits none of those four on
  any path, so there is nothing to guard; the constraint is documented in
  `docs/repo-harness-chatgpt-browser-engine.md` instead.
- **Dry run renders the command it would run, including a malformed binding.** A binding
  without `profileDirectory` still renders a lone `--copy-profile` in
  `dryRun.command`, because that argv is what the run would attempt; the run itself is
  stopped earlier by `ORACLE_PROFILE_NOT_FOUND`. Making the dry run diverge from the real
  argv would make the preview useless as evidence.

## Deviations From Plan Or Spec

- The dispatch expected `repo-harness chatgpt browser-doctor --provider oracle --json` to
  report `ready` on this machine with Oracle 0.18.0. It reports `action_required` /
  `ORACLE_VERSION_UNSUPPORTED` because `REQUIRED_ORACLE_VERSION` is still pinned to
  `0.14.1`. The two new capabilities do probe `true` against the 0.18.0 binary, which is the
  part this contract owns. Bumping the version pin is not in the BRC4a acceptance line and
  is left untouched.
- The dispatch's precheck design named only `ORACLE_PROFILE_NOT_FOUND`; the sprint
  acceptance line also requires `ORACLE_COPY_PROFILE_UNSUPPORTED`. Both are implemented,
  capability gate first (binary compatibility) and binding gate second (local
  configuration).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Keep `--browser-cookie-path` as a fallback when `--copy-profile` is unavailable | Rejected | Two transports keep the silent anonymous-login failure reachable and make the failure untestable |
| Detect the running-session refusal by exit code | Rejected | Oracle exits 1 for many reasons; the verbatim message is the only specific signal |
| Auto-append `--force` on `ORACLE_SESSION_ALREADY_RUNNING` | Rejected | It would abandon a live detached worker and its browser; reattach or cleanup is the user's call |
| Bump `REQUIRED_ORACLE_VERSION` to 0.18.0 so the local doctor turns green | Deferred | Version pinning is its own compatibility surface and is not in this acceptance line |

## Open Questions

- `REQUIRED_ORACLE_VERSION` is pinned at `0.14.1` while the transport this contract
  introduces was measured on 0.18.0. Any real GPT Pro consult on this machine stays blocked
  by the version gate until that pin is revisited in its own work-package.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
