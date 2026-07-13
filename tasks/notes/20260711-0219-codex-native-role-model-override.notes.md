# Implementation Notes: codex-native-role-model-override

> **Status**: Blocked
> **Plan**: plans/plan-20260711-0219-codex-native-role-model-override.md
> **Contract**: tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md
> **Review**: tasks/reviews/20260711-0219-codex-native-role-model-override.review.md
> **Last Updated**: 2026-07-11 19:49 +0800
> **Lifecycle**: notes

## Design Decisions

- Preserve the native GPT-5.6 V2 transport as the hard requirement.
- Treat Codex model catalog `multi_agent_version` and the active tool schema as runtime authority.
- Do not infer a role from `task_name`; V2 uses it only for `/root/<task_name>` identity.
- Roll back the same-name TOML installer candidate after the real canary falsified it.
- Treat the installed runtime as acceptance authority when current official documentation and persisted child metadata disagree.

## Deviations From Plan Or Spec

- The initial root-cause hypothesis was incomplete: the advisor/fleet namespace mismatch exists, but fixing it cannot affect the active GPT-5.6 V2 flat spawn path.
- `codex exec --strict-config` is separately blocked by the pre-existing user-level key `default_mode_request_user_input`; this slice did not mutate that unrelated config.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Lower the root to Terra/xhigh | Rejected | Violates the required Sol/xhigh orchestrator invariant and changes every child, not only workers |
| Same-name TOML files plus config registration | Rejected by canary | V2 emitted `agent_role:null` and inherited Sol with plain, registered, and identity-enabled variants |
| Force `hide_spawn_agent_metadata=false` | Rejected by runtime | GPT-5.6 rejected the modified reserved `collaboration.spawn_agent` schema with HTTP 400 |
| Non-native `codex exec -m gpt-5.6-terra` worker | Out of scope | Could select Terra/xhigh, but breaks the native-subagent requirement and needs explicit scope approval |

## Open Questions

- Platform decision required: relax native V2, relax Sol root, or wait for role/model metadata support in GPT-5.6 V2.

## Latest Published Runtime Retest

- Updated the standalone installation from `codex-cli 0.144.0` to the latest published `0.144.1`.
- Current official Subagents documentation says a custom agent is identified by its `name` and a same-name custom agent takes precedence over a built-in.
- A fresh prompt explicitly requested the custom agent named `explorer`.
- Persisted child metadata still recorded `/root/explorer`, `agent_role:null`, `gpt-5.6-sol`, and `high`, rather than the configured `gpt-5.6-terra` / `medium`.
- Conclusion: the documentation describes a role-aware surface that the current GPT-5.6 MultiAgentV2 path in the published local runtime does not expose.

## Evidence Links

- Pre-fix regression: `.ai/harness/checks/codex-native-role-model-override.pre-fix.txt`
- Plain V2 canary: `.ai/harness/checks/codex-native-role-model-override.canary.jsonl`
- Identity canary: `.ai/harness/checks/codex-native-role-model-override.identity-canary.jsonl`
- Registry canary: `.ai/harness/checks/codex-native-role-model-override.registry-canary.jsonl`
- Registry plus identity canary: `.ai/harness/checks/codex-native-role-model-override.identity-registry-canary.jsonl`
- Reserved-schema failure: `.ai/harness/checks/codex-native-role-model-override.metadata-canary.stderr.txt`
- Latest published runtime retest: `.ai/harness/checks/codex-native-role-model-override.0.144.1-canary.md`

## Promotion Filter

Promote only conclusions that are hard to reverse, surprising without local context, and backed by a real trade-off.

## Promotion Candidates

- GPT-5.6 V2 `task_name` is transport identity, not native agent-role selection.
