# Codex fleet worker model mappings

> **Substantive Change SHA256**: `sha256:b0611921df3b5bf31eb20cecc45cf2217e2b7b13965aa82671fd12624c305e71`

The Codex installer override and packaged helper now select `gpt-6-luna` with
`max` reasoning for fast-worker. The tracked persona and existing installer
expectations agree. Deep-worker selects `gpt-6-sol` with `high` reasoning. The
fleet mapping in the authored external-tooling reference config and its
projected documentation agree with the installer.

The remaining Codex roles now use GPT-6 models by responsibility: explorer
uses Luna/high, deep-reasoner uses Astra/xhigh, and root-cause-prover and
harness-evaluator use Sol/high. Gatekeeper remains Astra/medium. The source
family projection is updated to GPT-6, while the Claude role files keep their
existing model and effort selections.

Verification on 2026-09-23: `bun test tests/install-agent-fleet.test.ts` passed
22 tests and 262 assertions. Hook, helper and reference-config projections,
deploy SQL order, architecture sync, strict task workflow, project inspection
and source-checkout init dry-run passed. Task-sync passed against this digest.

The installed global `repo-harness run capture-plan` entrypoint reported a
missing regular helper file; the repository's own `scripts/capture-plan.sh`
successfully captured the authorized plan. Global installation repair is
outside scope.
