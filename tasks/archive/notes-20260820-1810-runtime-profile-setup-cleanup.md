> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Runtime Profile Setup Cleanup Notes

> **Date**: 2026-05-30
> **Slice**: runtime-profile-setup-cleanup

## Decision

Normalize `scripts/setup-plugins.sh` to describe the current default runtime as
Plan-only, with Codex using platform defaults plus approval-on-failure and
Claude using default permissions.

## Tradeoff

The setup script still installs runtime policy hooks for worktree warnings and
atomic checkpoint reminders. The cleanup only removes stale permissionless
default wording and renames the installer helper to match what it actually
does; it does not change hook behavior or remove the explicit optional
permissionless profile from historical question packs.

## Verification Focus

- Shell syntax for `scripts/setup-plugins.sh`.
- Setup-plugin structure tests.
- Bootstrap and assembled-output tests that enforce Plan-only defaults.
