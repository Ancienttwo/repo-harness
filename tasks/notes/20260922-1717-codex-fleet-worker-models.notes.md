# Codex fleet worker model mappings

> **Substantive Change SHA256**: `sha256:a204ec6bc5d3d8c79d150c914858e28e1734a42206f693c493f1dd762b737b14`

The Codex installer override and packaged helper now select `gpt-6-sol` with
`medium` reasoning for fast-worker. The tracked persona and existing installer
expectations agree. Deep-worker selects `gpt-6-sol` with `xhigh` reasoning. The
fleet mapping in the authored external-tooling reference config and its
projected documentation agree with the installer.

The remaining Codex roles now use GPT-6 models by responsibility: explorer
uses Luna/high, deep-reasoner uses Astra/xhigh, and root-cause-prover and
harness-evaluator use Sol/high. Gatekeeper remains Astra/medium. The source
family projection is updated to GPT-6, while the Claude role files keep their
existing model and effort selections.

Verification on 2026-09-24: `bun test tests/install-agent-fleet.test.ts` passed
22 tests and 262 assertions. Hook, helper and reference-config projections,
deploy SQL order, architecture sync, strict task workflow, project inspection
and source-checkout init dry-run passed. Task-sync passed against this digest.

The installed global `repo-harness run capture-plan` entrypoint reported a
missing regular helper file; the repository's own `scripts/capture-plan.sh`
successfully captured the authorized plan. Global installation repair is
outside scope.

The push CI for the mapping (range `direct:0b0a9505..80fb3339`) failed because
bootstrap-files, check-agent-tooling and subagent-handler fixtures still
asserted the pre-GPT-6 persona models, so verified routing reported a mismatch.
Those positive fixtures now follow the tracked Codex TOMLs; negative mismatch
fixtures keep their deliberately stale models.
