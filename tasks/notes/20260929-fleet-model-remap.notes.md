# Fleet Model Remap Notes

> **Substantive Change SHA256**: `sha256:0edecc31ebf0a2ea239b3bc033655db483733062812c295a5c2e298ff2d7b5f3`

## Decision

- Every fleet agent now has an explicit `AGENT_TARGET_OVERRIDES` entry, so the Codex model/effort no longer follows the Claude-side family default. A Claude tier change (for example explorer sonnet/high -> sonnet/medium) can no longer silently move the Codex target.
- Claude tiers: explorer sonnet/medium, deep-reasoner opus/xhigh, fast-worker sonnet/xhigh, deep-worker opus/high, gatekeeper opus/high, root-cause-prover opus/xhigh, harness-evaluator opus/high.
- Codex targets: explorer luna/high, deep-reasoner astra/high, fast-worker sol/high, deep-worker sol/xhigh, gatekeeper astra/medium, root-cause-prover astra/high, harness-evaluator astra/medium.

## Open Questions

- `Fleet collector supervision protocol` (Windows Job controller) timed out on the windows-latest MCP path matrix in this PR's first CI run; it is outside this change's surface.
