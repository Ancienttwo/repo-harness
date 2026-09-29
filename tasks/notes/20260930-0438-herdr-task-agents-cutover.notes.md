# Implementation Notes: Herdr task agents cutover

> **Status**: Active
> **Plan**: plans/plan-20260930-0438-herdr-task-agents-cutover.md
> **Contract**: tasks/contracts/20260930-0438-herdr-task-agents-cutover.contract.md

## H0 decisions and boundaries

- Worktree HEAD is origin/main 43b7d72d, created through a pre-created branch plus contract-worktree start/plan-to-todo. The helper moved the owned untracked plan from main into this branch; no main pull/checkout/stash. Existing dirty files remain outside the worktree.
- Git worktree metadata records merge-base with the local main (6af754ad); execution HEAD is nevertheless 43b7d72d. Final PR target is origin/main; do not infer the base from that local metadata.
- All runtime experiments use fixture HOME and a unique task-proof-* session. Test control rejects default before spawning a CLI. User advisor-gatekeeper in default/w8:p2 is attached by explicit authorization, not created/owned for cleanup.
- mini default is a user remote session: no canary authorization, no machine mutations.
- H0 probes deterministic peers without provider auth/model calls. Four installed executable/help observations must not be reported as read-only or session-resume capability proof.

## Open items

- Real four-harness provider/auth/permission/resume evidence remains unverified; H0 deterministic composition and official CLI inventory are documented in research.
- H1/H4/H5 checkpoint waits require designated advisor-gatekeeper PASS.

## H0 conclusions for advisor-gatekeeper

- First proof point passes: root-linked metadata, two harness-named fixture peers, owner 1 exit / owner 2 binding restore, same PID/session and ordered context, task-only cleanup, live primary sentinel. Test cost about 4.6s.
- Evidence limitation: peers are deterministic Bun processes, explicitly fixture-reported lifecycle state; this proves Herdr/process ownership and request context wiring, not real model authentication, native session resume or runtime sandbox enforcement.
- Feasibility deviations resolved: macOS socket path overflow required short fixture HOME/session; canonical /private/tmp paths must be compared; documented raw CLI mutations cannot be parsed as JSON. Production endpoint validation is an H1 responsibility.
- No new dependency or production wrapper. A single composition test owns this previously uncovered cross-owner/root-linked boundary.
- H0 ends at its commit and designated PASS; do not enter H1 before advisor-gatekeeper reviews its evidence.
