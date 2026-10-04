# Phase 1 observer plan

Frozen source: `/Users/chris/Projects/_share/pipeline-management-design.md`.
SHA-256: `6ac6967d847905e6ad3a7b754e294ffc622f97dcacf725fa6270262748f460ff`.

## P1 map

The CLI routes commands in `src/cli/index.ts`.
Task identity comes from `taskRepository` and persisted `TaskRequest` files.
Verification authority comes from immutable execution records and the evidence log.
The operator server owns GET and HEAD routes. React owns the organization view.
There is no pipeline store or pipeline consumer on this branch.

## P2 trace

`task-agent send` saves each request before it returns.
`readTaskRequestResult` checks the original binding and request before it reads a result.
It calls `assertTaskRequest`. It does not write a collected receipt.
The passing verification validator checks the contract, snapshot and immutable run.
The notify panel reads through a bounded CLI process. The new panel uses that boundary.

## P3 decision

Use Bun SQLite and standard library file operations. Add no package dependency.
Keep `(source_host, repository_id, task)` in every ledger key.
Keep record CAS separate from the store commit sequence.
Append ingest observations. Derive their display state from the published copy.
Publish a complete generation before the atomic pointer change.
Keep receipt replay before CAS, artifact reads and gates.
Source-host validation uses the original authority APIs. Missing access stays unavailable.
No existing dispatch, notice, merge or cleanup caller will import the ledger.

## Work and checks

1. Add the schema, ledger core, store and CLI.
2. Add request enrollment, source validation and event observation.
3. Add the read-only API and Claude-owned panel through Herdr.
4. Add A1-A15 tests. Use real scratch repositories and authority artifacts.
5. Rebase on origin/main. Run typecheck and affected tests with fresh `/tmp` HOME.
6. Review the complete diff and test intent. Make bounded commits.
7. Push and open a PR. Write `/tmp/pipeline-observer-report.md`. Do not merge.

Do not run the full suite. Do not deploy to the Mini.
The linked Bun SQLite version is 3.51.0 here. The writer must reject it.
Use a fixed SQLite library for acceptance execution if one is available.
This requirement has no version bypass.
