# Release Filing: repo-harness 0.2.4

Date: 2026-06-07
Status: Verified, npm auth blocked

## Scope

- Package: `repo-harness@0.2.4`
- GitHub tag: `v0.2.4`
- Base tag: `v0.2.3`
- Target branch: `main`
- Generated workflow compatibility: `5.2.3`

## Release Notes

- Prompt hooks now fall back to shell-side decision logic when installed copies
  cannot reach the TypeScript decision engine.
- Workflow checks now detect stale handoff/resume plan references.
- The npm release gate now refreshes the ignored Codex resume packet before
  strict workflow validation, so release tests cannot leave handoff runtime
  state stale before the final workflow check.
- Action-command skills now carry static readiness gates for failure modes,
  boundaries, and high-risk checkpoints.
- Benchmark reports now label skill-eval authority and keep dry-run smoke output
  separate from release-grade effectiveness evidence.
- Self-host CodeGraph tooling is refreshed to `0.9.9`, and gbrain readiness uses
  `doctor --json --fast` before falling back to the full doctor command.
- Plan/workflow consultation prompts stay advisory instead of reaching
  `PlanStatusGuard`, so questions that mention `new plan`, `方案`, hooks, or
  workflow routing do not create plan files or block unless they explicitly
  start execution.
- The self-host-only `autoresearch-advisory.sh` hook is retired from `.ai/hooks`,
  generated hook installers, and user-level adapters. Autoresearch evidence is
  now explicit agent-run work, not a background hook route.

## Verification

- `bash scripts/check-npm-release.sh` passed in this session:
  - npm registry uniqueness check for `repo-harness@0.2.4`
  - `bun install --frozen-lockfile`
  - `bun test`: 571 pass, 6 skip, 0 fail
  - `bash scripts/check-deploy-sql-order.sh`
  - `bash scripts/check-task-sync.sh`
  - `bash scripts/check-task-workflow.sh --strict`
  - `bun scripts/inspect-project-state.ts --repo . --format text`
  - `bash scripts/migrate-project-template.sh --repo . --dry-run`
  - `npm pack --dry-run --json`
- `bun run benchmark:skills -- --agent codex --profile with_skill --eval route-workflow-check --iteration release-0.2.4` passed:
  - `full_test_count = 1`
  - `dry_run_count = 0`
  - `dry_run_ratio = 0.0%`
  - `grader_pass_rate = 100.0% (4/4)`
  - `effectiveness_authority = authoritative`
- `npm pack --dry-run --json` reported `repo-harness-0.2.4.tgz`, 277 files,
  package size 1,894,792 bytes, unpacked size 3,404,452 bytes, and no
  `autoresearch-advisory.sh` file.
- `bash scripts/check-agent-tooling.sh --host both --json` reported CodeGraph
  present via local `0.9.9`, Waza present, gbrain warning, and Codex automation
  profile partial.

## Publish Status

- npm: blocked; the default `npm whoami --registry https://registry.npmjs.org/`
  returned `ENEEDAUTH`, and the only discovered local npm token returned `E401`
  from a temporary npmrc.
- GitHub release: not created because npm publish is blocked.
