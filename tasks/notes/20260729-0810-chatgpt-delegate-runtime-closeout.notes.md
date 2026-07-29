# Implementation Notes: chatgpt-delegate-runtime-closeout

> **Status**: Active
> **Plan**: plans/plan-20260729-0810-chatgpt-delegate-runtime-closeout.md
> **Contract**: tasks/contracts/20260729-0810-chatgpt-delegate-runtime-closeout.contract.md
> **Review**: tasks/reviews/20260729-0810-chatgpt-delegate-runtime-closeout.review.md
> **Last Updated**: 2026-07-29 09:14
> **Lifecycle**: notes

## Design Decisions

- **P1 map**: `prompt-assembler.ts` freezes the outbound `PromptBundle`; `engine.ts` is the shared pre-session/pre-provider egress boundary; Oracle and native are downstream transports. `assets/skills/repo-harness-chatgpt/` remains the sole protocol byte authority, while `chatgpt-skill/installer.ts` owns only explicit host discovery projections.
- **P2 trace**: brief plus allowed files -> frozen `PromptBundle` -> Gitleaks `stdin` scan of `bundle.rendered` and each follow-up -> persisted receipt -> native sends the frozen rendered text, Oracle rebuilds attachments from frozen bundle bytes in a private directory and rechecks each file SHA-256 -> session persistence. A scan-bound source session forces the same gate on every follow-up, including callers that try to pass `requireSecretScan: false`.
- **P2 install trace**: `repo-harness chatgpt install-skill` -> validate `SKILL.md` plus all six canonical references -> preflight every selected host -> create an absolute symlink under the selected discovery roots. Uninstall preflights all targets and revalidates exact symlink ownership immediately before each unlink.
- **P3 decision**: keep delegate scanning opt-in at the machine surface so ordinary planning consult behavior does not silently change, but make the canonical delegate protocol require it. Keep one scanner (Gitleaks), one skill byte authority, and fail closed rather than adding a local heuristic scanner, copied skill prose, or provider fallback.
- Gitleaks resolution is explicit binary -> `REPO_HARNESS_GITLEAKS_BIN` -> PATH, with a version floor of 8.19. The scanner runs from an empty temporary cwd, clears both supported config environment overrides, ignores `gitleaks:allow`, sends payload only on stdin, and surfaces generic errors without captured finding text.
- The successful receipt records scanner version/source and exact byte count/SHA-256 per payload; paths and finding content are not persisted in the receipt.

## Deviations From Plan Or Spec

- The first implementation placed the scan before provider launch but Oracle still accepted mutable repository attachment paths. Adversarial review added immutable per-run attachment staging from already-scanned bundle bytes and a post-write SHA-256 assertion; this is a safety correction within the approved exact-egress boundary.
- Review also closed two local bypass/race shapes before acceptance: inherited follow-up scanning now cannot be disabled programmatically with `false`, and uninstall revalidates ownership at the unlink sink.
- A standalone full-suite run exposed a stale ignored `.ai/harness/checks/latest.json` from the previous archived contract: 2092 passed, 1 skipped, and only the live projection self-hash check failed. The accepted receipt event had embedded the prior projection's `provenance` inside its `run_trace`, so the materializer hashed content that the final top-level projection omits. This is a pre-existing workflow-projection defect, not counted as a green run; the current task must rematerialize evidence through its own final verify cycle and rerun the full suite.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Scan individual source paths | Reject | It misses prompt prose, follow-ups, and serialization boundaries; scan the frozen rendered payload instead. |
| Copy the canonical Skill into each host | Reject | Copies create multiple protocol authorities and drift. |
| Symlink the canonical Skill explicitly | Use | It preserves one byte authority, is reversible, and leaves default install profiles unchanged. |
| Let Oracle reread approved repo paths after scan | Reject | A post-scan mutation can change outbound bytes; stage from the frozen bundle. |
| Automatically disable/fallback when Gitleaks is unavailable | Reject | Missing security authority must block delegate egress. |

## Open Questions

- The existing Oracle metadata projection gap remains intentionally deferred in `tasks/todos.md`; this slice does not parse Oracle >=0.16 model/conversation metadata into `BrowserSessionMeta`.
- The AcceptanceReceipt-to-`checks/latest` provenance normalization defect is deferred as its own workflow-engine work-package; final verification rematerializes a self-consistent projection but does not fix that unrelated source module here.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Corrected Codex IAB Canary B dry-run session: `chgpt_20260729_082808_corrected-codex-iab-canary-b`; `prompt.md` SHA-256 `b08771998ee82ce2a5361914c19c88236e4afd4eb2c9195df849df2b5b43a9c3`; Gitleaks 8.30.1/PATH; 339 bytes.
- Corrected Codex IAB conversation: `https://chatgpt.com/c/6a694a06-ebe8-83ee-b6e4-5edf78e105fc`; visible model label `Pro`; attachment `prompt.md` read successfully; response ended with exact `===END OF DELIVERABLE===` sentinel.
- Focused browser suite: `bun test tests/cli/chatgpt-browser.test.ts` -> 29 pass, 0 fail after the final review fixes.
- Installed package proof: `bash scripts/check-tarball-install-smoke.sh` passed; a second tarball smoke confirmed the packaged secret-scan/installer/delegate files and exercised install, idempotent reinstall, realpath equality for both host symlinks, and owned uninstall.
- Real scanner falsifier: Gitleaks 8.30.1 accepted the clean exact bundle and rejected a high-entropy synthetic PAT before session allocation with generic output; the earlier low-entropy sequential fixture was explicitly discarded as non-evidence.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
