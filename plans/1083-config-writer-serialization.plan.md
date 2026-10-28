# Serialize global configuration writers (#1083)

Base: `5636eb2d3`. Owner: `codex/backend-dispatch-20261028-8f26/issue-1083`.

## Problem and invariant

Agents settings, brain root, architecture settings and the Windows helper replace
the same global configuration document. A revision check before rename does not
serialize another writer. Installer rollback can also replace a successful write
with its older snapshot. Every product writer must hold the existing global
runtime lock from its read through its final write or rollback.

## Approved change

- Move the existing runtime lock owner to the effects layer. Keep its path and
  scope rules. Remove the old module and update its consumers.
- Add one strict, atomic, durable global configuration mutation boundary. Check
  an expected revision inside the lock. Reject malformed data and symlink paths.
- Pass an explicit held-lock context through runtime setup and uninstall.
  Candidate reconciliation builds its context only after the existing one-shot
  capability validates the parent and its live lock.
- Keep installer snapshots and rollback under their existing outer lock.
- Keep operator target lock before global runtime lock. Configuration contention
  fails promptly and has a clear retryable response; stale revision stays 409.
- On Windows, all supplied configuration HOMEs share the existing account lock;
  each write still targets its supplied HOME. POSIX contexts bind the target HOME
  to the lock root. This does not grant access to another filesystem root.
- Update all writers together. Do not change frontend, dependencies or Herdr.

## Verification owned by the parent

Run typecheck and focused configuration, agents settings, uninstall, Windows
helper, installer and candidate-reconciliation tests. Add regression cases for
real process contention, preserved unrelated fields, stale revision, invalid
documents and lock-context ownership.

A separate evidence worker reproduced the rollback variant on `5636eb2d3`.
The parent held the real runtime lock and installer snapshot. An independent
`configureBrainRoot` call returned success, then rollback restored the old value.
The control added the existing runtime lock around the unchanged writer: it was
refused while the parent held the lock and succeeded after release. Evidence:
`/tmp/repo-harness-wt-1083-repro/.ai/harness/handoff/1083-repro/`.
The agents CAS-to-rename interleaving has not been executed.

## Tradeoff

An install can make configuration writes busy until its commit or rollback.
At higher concurrency, contention occurs before file mutation. Old processes
must restart before they join the shared lock protocol.
