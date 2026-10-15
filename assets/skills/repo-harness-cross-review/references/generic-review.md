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
Seatbelt: all filesystem writes outside the canonical output tree are denied, except the
proved /dev/null device literal; TMPDIR is private inside output,
including inherited descendant writes. The paired zero-model fixture proves
that policy; real native/runtime behavior is still unverified. Other platforms
fail closed. The host deletes inherited OAR_CODEX_SANDBOX; stock OAR selects Codex
danger-full-access, with cwd=output. The OS boundary is the protection authority. Stock OAR supplies Claude's bypass flag under the
explicitly approved OS boundary; the app adds no vendor arguments.

Claude's current OAR model event is system/init only. It cannot certify the
actual gateway backend, so Claude Results cannot mint a Receipt yet. Hooks,
complete packet ingestion, forced host-loss cleanup and native isolation remain
unverified. On normal cleanup SDK dispose acknowledgement and execution-owner
exit precede pane close; missing proof remains pending.
The independent direct Codex advisory runtime is retired. New acceptance
requests use this generic domain; the removed command is not an alias or fallback.

Codex runs with an owner-prepared `output/.codex-home` as `CODEX_HOME`, passed through OAR SessionOptions.env. No native state directory is granted.
Only auth is copied (exclusive/no-follow, modes 0700/0600) and only its access `exp` is checked against the run window. Config, trust and instructions are not copied.
The owner deletes the copy on close, cancel, start failure and timeout. A failed deletion is `cleanup_pending`.

## App terminal launch

Use this mode when an operator works in the Claude desktop app without Herdr.
The Claude app session is the owner, so the default reviewer is Codex.

```bash
repo-harness review round --launch app-terminal --contract tasks/contracts/<task>.contract.md --reviewer-repo <linked> --verification <report>
```

1. The first call prepares the packet, the Seatbelt profile and the host spec.
   It sends no request. It prints `status: "launch_required"` with `command`.
2. Run that exact `command` once in a Claude app Terminal tab
   (`run_in_terminal`). Do not edit it. Do not hand-write a Codex CLI call.
3. Run the same `review round` command again, in the background. The CLI
   waits for the host, binds it by pid, start time and exact argv, then sends
   the round. It blocks until the Result or the round deadline.
4. Later repair rounds reuse the same host. Do not launch it again.

The terminal shows the host event stream, not a Codex TUI. The host claims the
control directory once, so a repeated launch exits before it opens a Session.
A cancel before any claim writes a tombstone claim, so a later launch also
exits before it opens a Session. If the host exits or is not ready in time, the
round fails. Read the terminal output, then run `review cancel`; do not launch
again. Keep the tab open until `review close`. Closing the tab sends SIGHUP;
the host disposes and exits, and the session can then only be cancelled.
Cleanup never signals the terminal process. It waits for the host to dispose
and exit. If a host exits after it began a Session but before `disposed.json`,
cleanup stays pending; check for a leftover reviewer process. Terminal history
is not available to the CLI.
