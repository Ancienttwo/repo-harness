# Codex fleet worker model mappings

> **Substantive Change SHA256**: `sha256:37940f1e5003b87374ad17bb81a29af73e87713f9eaf219e592c0949b7557377`

The Codex installer override and packaged helper now select `gpt-5.6-sol` with
`medium` reasoning for fast-worker. The tracked persona and existing installer
expectations agree. Deep-worker already selects `gpt-6-astra` with `medium`
reasoning. Claude mappings and global installations were outside this change.

Verification on 2026-09-22: `bun test tests/install-agent-fleet.test.ts` passed
22 tests and 262 assertions. Hook, helper and reference-config projections,
deploy SQL order, architecture sync, strict task workflow, project inspection
and source-checkout init dry-run passed. Task-sync required this exact diff
digest and is rerun after recording it.

The installed global `repo-harness run capture-plan` entrypoint reported a
missing regular helper file; the repository's own `scripts/capture-plan.sh`
successfully captured the authorized plan. Global installation repair is
outside scope.
