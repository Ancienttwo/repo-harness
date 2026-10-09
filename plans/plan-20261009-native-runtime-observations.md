# Plan: Native runtime observations without a required Herdr source

> Status: Implementation authorized by the user on 2026-10-09 (Asia/Singapore).
> Branch: `codex/native-runtime-observations`
> Base: PR 606 head `2bb0e64864565e28a02393d2645fc0a557c60275`.

## Goal

Make runtime observation independent of Herdr. Keep Herdr as an optional source and keep its existing dispatch behavior. A user explicitly wraps a new run in capture. The operator reads a derived status snapshot. Neither path changes task acceptance.

## P1: Map

The current overlay and bindings contain Herdr pane identity. The service starts before HTTP admission. GET reads its cache. Codex 0.162.0 provides native thread/turn notifications, but no read-only observer role or subscribe method. Existing hook telemetry describes hook completion, not complete agent runtime state. The project already runs on Bun 1.4.2, which has a built-in PTY.

## P2: Trace and proof

The real isolated Codex probe initialized app-server, created a test-owned ephemeral thread without a turn or model request, received `thread/started` with idle status, and read that thread. A separate real Bun PTY probe completed a shell byte roundtrip. Neither probe observed an existing desktop session.

The new path is explicit capture -> real child output -> bounded decoder -> atomic white-list snapshot -> configured source reader -> existing runtime GET -> independent session/terminal observation UI.

## P3: Decision

Implement an opt-in I/O tap, not a scheduler or a desktop-session observer. Codex stdin/stdout are transparent. The tap never originates RPC, answers approval, starts a turn or resumes a session. PTY capture owns only the child explicitly supplied by the caller. It answers and consumes only the fixed OSC 7501 capability query; other bytes continue to the terminal.

Publish no raw logs. Snapshot fields are limited to source identity, capture generation/sequence, provider, format, capture health/heartbeat and bounded observations. Prompt, tool arguments, terminal text, paths and approval payloads stay out of snapshots and HTTP responses. A capture heartbeat does not advance the last event time or imply agent progress.

## Scope and contracts

- One `operator capture` CLI with Codex stdio and Claude/Pi PTY formats. No global installation/configuration change, automatic discovery, reconnect, restart or existing-session takeover.
- One `repo-harness.runtime-capture.v1` schema and single-writer atomic snapshot producer. A new capture refuses an existing output path. No durable event history or task ledger.
- Replace the unreleased runtime config v1 with a closed `repo-harness.runtime-config.v2` union: `kind: herdr` retains the explicit Herdr fields; `kind: native` contains explicit `{source_id, provider, snapshot_path}` entries. One mode per service avoids mixed-source clocks. Old config fails closed; no compatibility parser.
- Upgrade overlay to v4 and add `native_sources`. Keep existing Herdr identities inside the Herdr path. Native scope is `session` or `terminal`; no fake Herdr fields and no automatic task binding.
- Native rows use their own generation, heartbeat, event receive time and freshness. A successful file read cannot refresh an old heartbeat. Source rotation/sequence rollback/conflicting same-sequence data must not revive old state.
- GET performs no source I/O, spawn or write. The configured service refreshes before HTTP startup and on its owned timer. Closing it affects only its own handles.
- A disconnected or failed capture cannot report task completion. OSC idle is not cancellation. Codex interrupted is a native turn outcome, never project acceptance.

## Owners

1. Capture worker: new capture core/schema, bounded Codex/OSC decoders, owned I/O lifecycle, atomic writer, `operator capture`, and focused transport tests. It owns `src/cli/commands/operator.ts`.
2. Observer worker: overlay v4, config v2, read-only native source reader, cache/service integration, existing backend tests and documentation. It does not edit capture or UI files.
3. UI worker: independent native observation area, English/Chinese labels, source freshness and related browser/component tests. The user has approved Codex frontend work for this task.
4. Parent: integration, real probes, browser QA, read-only acceptance review, PR updates and reporting.

## Verification

Use real fragmented bytes and subprocesses for I/O tests. Cover bounded buffers/backpressure, malformed frames, unknown methods, query de-duplication, EOF/signal/raw-mode cleanup, existing-output refusal, privacy, file replacement, stale heartbeat, sequence conflict, per-source age and GET immutability. Preserve existing assertions; explain necessary schema fixture changes in the PR.

Run typecheck and affected tests after stable implementation. Test real Codex capture with a test-owned ephemeral thread and no model request. Test actual Pi 1.1 startup through PTY capture. Installed Claude is 2.1.291; it cannot prove 2.1.295 support. A temporary versioned 2.1.295 test may establish that capability without changing the installed CLI. Report missing proof explicitly.

Run one independent read-only acceptance review for implementation and assertion integrity. Browser QA uses controlled input for state variants and real source snapshots where available; distinguish these from provider-driven work.

## Risk and rollback

Capture is opt-in and applies to new owned runs only. It cannot observe arbitrary existing desktop chats or terminals. PTY support and cleanup must be verified on each supported platform. No production daemon, credential or release change is included. Revert the eventual integration commit to restore the previous schema/config. Retain unmerged work and original evidence.

## Reporting

Use the Feynman report and editable PlantUML progress source. Keep code, tests, real-source probes, merge and release status distinct. PR 606 remains based on Draft PR 604 unless a separate authorized integration decision changes that base.
