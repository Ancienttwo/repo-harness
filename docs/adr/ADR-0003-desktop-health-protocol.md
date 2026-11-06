---
schemaVersion: archcontext.adr/v1
title: Operator health protocol for desktop integration
status: accepted
decidedAt: 2026-11-06
appliesTo:
  - capability.runtime-harness.operator
---

# ADR-0003: Operator health protocol for desktop integration

## Context

The desktop shell has its own release version. The npm packages in this
repository release in lockstep. The shell needs a contract that identifies
the server behavior it can use, separate from the package release version.
This decision records [#1890](https://github.com/Ancienttwo/repo-harness/issues/1890)
and the [desktop handshake decision in #1298](https://github.com/Ancienttwo/repo-harness/issues/1298#issuecomment-6675473710).

## Decision

`GET /healthz` returns `ok: true`, `service: "repo-harness-operator"`,
`protocol: 2` and `version`, the core package version. The server imports
`version` from its own `package.json`. It does not read the current working
directory's package metadata or import the CLI.

`/healthz.protocol` is the desktop integration contract. Its owner is
`OPERATOR_SERVER_PROTOCOL` in `src/effects/operator/server.ts`. Bump it only
for a breaking change to one of these shell-facing surfaces:

- Health response fields.
- Startup URL output.
- Origin and cookie rules.
- Shutdown behavior.
- An API or native call that the shell uses.

A UI-only change does not bump this protocol. A package version change
alone does not bump it. The `version` field identifies the core release;
it does not replace the integration protocol.

## Consequences

The server serves protocol 2 only. It has no protocol 1 path or translator.
The desktop shell must use a supported integration protocol. The shell's
implementation is outside this change.

Other route protocols keep their own contracts. This change does not alter
`BOARD_PROTOCOL` 3, `BOARD_PARENTS_PROTOCOL` 4, `BOARD_SUMMARIES_PROTOCOL` 3
or `QUOTA_PROTOCOL` `repo-harness.quota.v1`.
