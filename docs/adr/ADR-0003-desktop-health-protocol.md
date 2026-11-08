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
[#1968](https://github.com/Ancienttwo/repo-harness/issues/1968) adds the
first native call, opening a worktree, and so bumps the protocol to 3.

## Decision

`GET /healthz` returns `ok: true`, `service: "repo-harness-operator"`,
`protocol: 3` and `version`, the core package version. The server imports
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

A new native call that the shell must provide is a breaking change, because
the page uses it without a capability probe. A UI-only change does not bump
this protocol. A package version change
alone does not bump it. The `version` field identifies the core release;
it does not replace the integration protocol.

### Protocol 3 surfaces

A protocol-3 shell and server agree on exactly these surfaces:

- Health: the fields above, unchanged from protocol 2. The response type keeps
  the name `OperatorHealthResponseV2`, because its shape does not change.
- Startup URL: `repo-harness operator serve` prints one URL line on stdout.
- Origin and cookie rules: unchanged from protocol 2.
- Shutdown: SIGTERM stops the server.
- `GET /api/v1/dev-activity`: the shell reads `projection_version`, `status`
  and `attention[].kind`, `attention[].subject_id` and `attention[].summary`.
- `repo-harness worktrees path --repository <repo_id> --worktree <wt_id>`:
  one JSON line `{"protocol":1,"kind":"operator_worktree_path","repository_id",
  "worktree_id","path"}`, where `path` is the absolute real path of a
  registered worktree. A refusal prints `{"error":{"code","message"}}` on
  stderr and exits 2. The codes are `invalid_argument`,
  `inventory_unavailable`, `repository_not_found` and `worktree_not_found`.
  A worktree that Git lists but whose directory is missing gives
  `worktree_not_found`.
  The shell runs the command with its login environment. No HTTP response
  carries the path.
- The page call `window.repoHarnessDesktop.openWorktree({repository_id,
  worktree_id, target})`, where `target` is `terminal` or `editor`. The shell
  resolves the path with the command above, opens the local app and shows a
  failure itself. The page does not wait for the result. The page shows the
  open controls only when the bridge exists.
- Page routes: `/#home` and `/#<fragment>`.

The startup check is an exact protocol match, so the page does not probe
single bridge functions.

## Consequences

The server serves protocol 3 only. It has no protocol 1 or 2 path or
translator. A protocol-2 shell refuses a protocol-3 server with
`protocol_unsupported`. Release the server change and the protocol-3 shell
together, with no npm release between the two merges. The shell's
implementation is outside this repository.

Other route protocols keep their own contracts. This change does not alter
`BOARD_PROTOCOL` 3, `BOARD_PARENTS_PROTOCOL` 4, `BOARD_SUMMARIES_PROTOCOL` 3
or `QUOTA_PROTOCOL` `repo-harness.quota.v1`.
