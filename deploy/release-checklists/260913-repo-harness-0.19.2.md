# repo-harness 0.19.2 Release Preparation

- Integration base: `8d5d4e60f920ed50027fca8f7fe09819d9575f57`.
- Package / skill / template: `0.19.2`; previous published release: `0.19.1`.
- Scope: runtime-owned archctx resolution, evidence-based Agent registration guidance,
  and task-sync recovery diagnostics. No new dependency or runtime protocol.
- Status: preparation in progress; npm publication and tag creation are not authorized here.

## Evidence boundaries

The integration base passed hosted functional/platform tests, 119 local integration
tests and nine repository checks. Its hosted Governance run failed because the
push-range digest lacked a matching workflow record. The historical digest is
recorded in the original archived notes; this candidate must independently bind its
own Git diff and pass CI. No prior failed CI result is relabeled as successful.

One canonical `check:release` all-lane execution owns source checks, full tests,
real-install/Herdr cases and clean tarball-install smoke. Run with file isolation,
four jobs and per-file concurrency one after the candidate source is frozen.
Version consistency is checked separately. Artifact identity and installed readback
will be recorded after verification. Existing archctx dependencies stay pinned.
