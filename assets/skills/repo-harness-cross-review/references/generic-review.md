# Generic acceptance review

Acceptance uses the existing fleet `deep-reasoner` role and task-agent runtime.
Prepare verification, provide a dedicated linked reviewer checkout and a JSON
address file `{endpoint:{session,configPath?,home?},parent_pane}`. Trust the exact
checkout through the normal operator workflow before starting; never respond to
trust/update/approval prompts automatically.

```bash
repo-harness review round --contract tasks/contracts/<task>.contract.md --reviewer-repo <linked> --herdr-endpoint <address.json>
repo-harness review status --contract tasks/contracts/<task>.contract.md
repo-harness review close --contract tasks/contracts/<task>.contract.md
```

Default selection uses an existing typed task binding for the parent pane and chooses
its opposite. Unknown identity requires `--harness claude|codex`. Explicit
selection never falls back; only a missing opposite executable before start
allows a reported fallback to a separate owner-harness reviewer. No launch or
request is replayed after an ambiguous outcome.

At most three changed-subject repair rounds retain the same task-agent. Prior
findings require stable IDs and open/resolved status. The reviewer may write
only each exact Result file; terminal history/sentinel/idle are observation.
The owner immutably collects the file, validates domain identity and findings,
consumes OAR Session model observation and calls the existing generic-review
Receipt writer/verifier. Receipt validity is launcher-independent.

Close requires the current passing Receipt to equal the final accepted round.
On failure use `repo-harness review cancel --contract <path>` for identity-proven
cleanup without acceptance. Preserve unknown delivery and cleanup evidence.
The server and attached parent/workspace remain with their existing owner.
Drain pre-cutover sessions with the prior version; archive old evidence read-only.

The fixed Node >=24 OAR host runs inside a visible Herdr pane under macOS
Seatbelt: all filesystem writes outside the canonical output tree are denied,
including inherited descendant writes. The paired zero-model fixture proves
that policy; real native/runtime behavior is still unverified. Other platforms
fail closed. Codex configures workspace-write with cwd=output; the setting is
not protection evidence. Stock OAR supplies Claude's bypass flag under the
explicitly approved OS boundary; the app adds no vendor arguments.

Claude's current OAR model event is system/init only. It cannot certify the
actual gateway backend, so Claude Results cannot mint a Receipt yet. Hooks,
complete packet ingestion, forced host-loss cleanup and native isolation remain
unverified. On normal cleanup SDK dispose acknowledgement and execution-owner
exit precede pane close; missing proof remains pending.
The independent Codex advisory cross-review path remains until a separate
post-E2 follow-up; this entry does not replace that path.
