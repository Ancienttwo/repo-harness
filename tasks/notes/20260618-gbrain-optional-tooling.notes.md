# gbrain Optional Tooling Exclusion

## Context

The setup check path consumed `scripts/check-agent-tooling.sh --json` and mapped every external tool with `status=missing` to `needs_agent`. That made a missing local `gbrain` CLI produce `tooling.gbrain.repair` and keep `repo-harness setup check --target codex --check-updates --json` in `attention`, even though repo docs describe gbrain as advisory knowledge tooling and not hook/runtime correctness.

## Decision

Mark the gbrain detector output as `required: false` and teach setup check to treat optional external tools as informational. Optional tools remain visible in the JSON/detail output, but they do not produce repair/update agent actions and do not change the overall setup readiness result.

## Verification

- Target tests: `bun test tests/cli/init-hook.test.ts tests/check-agent-tooling.test.ts`
- Live gate: `repo-harness setup check --target codex --check-updates --json`
