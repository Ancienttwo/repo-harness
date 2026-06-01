# Implementation Notes: security-config-sentinel

> **Status**: Implemented
> **Source Plan**: User-provided plan, 2026-06-02
> **Lifecycle**: notes

## Decisions

- Keep the feature read-only: `repo-harness security scan` reports findings and never rewrites Claude, Codex, or VS Code config.
- Keep host adapter trust stable: `SessionStart.default` remains one route/adapter entry; only the route's ordered script list gains `security-sentinel.sh`.
- Aggregate SessionStart stdout in the TypeScript runtime so multiple ordered scripts still produce one valid `additionalContext` JSON payload.
- Treat unmanaged hooks and VS Code `folderOpen` tasks as warnings by default; escalate only obvious risky command patterns to `high`.
- Keep the hook low-frequency: `security-sentinel.sh` hashes the fixed config file set and only scans again when the fingerprint changes.
- After rebasing on the current `main`, keep only `.ai/harness/security/.gitkeep` as a tracked placeholder; `latest.json` and `state.sha256` remain ignored runtime state.

## Verification

- `bun test tests/cli/security.test.ts tests/cli/doctor.test.ts tests/cli/route-registry.test.ts tests/cli/hook.test.ts tests/hook-contracts.test.ts`
- `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts`
