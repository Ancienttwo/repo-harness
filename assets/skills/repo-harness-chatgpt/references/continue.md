# Continue Mode: Sessions, Read-Back, and Cleanup

Reconciles the `repo-harness-chatgpt-browser` session/read/cleanup rules with
the `repo-harness-gptpro` continue/read/list/open wording.

## Continue An Existing Conversation

```bash
repo-harness chatgpt browser-followup --repo <repo> --session <sessionId> --prompt "<prompt>"
```

Follow-up reopens the conversation using the saved upstream
`providerSessionId`, not the local `sessionId`; the local id only identifies
the saved record on disk.

## Read Results

```bash
repo-harness chatgpt browser-list --repo <repo>
repo-harness chatgpt browser-session --repo <repo> <sessionId>
repo-harness chatgpt browser-open --repo <repo> <sessionId>
```

If a session id is invalid or missing, list recent sessions and ask the user
which one they mean rather than guessing.

## Cleanup

Plan before deleting local session records:

```bash
repo-harness chatgpt browser-cleanup --repo <repo> --status dry_run --limit 20
```

## Research Promotion

- Treat `.ai/harness/handoff/gptpro/*.md` (and equivalent
  `.ai/harness/handoff/chatgpt-review-*.md` / `codex-goal-*.md` outputs) as raw
  local evidence: timestamped and ignored so repeated reviews do not collide.
- When a result contains durable repo knowledge, create or update
  `docs/researches/YYYYMMDD-<topic>.md` with a curated synthesis instead of
  copying the raw answer as authority.
- The research note should include: conclusion, key findings, implementation
  implications, open questions, and a provenance block (raw artifact path,
  repo-harness `sessionId`, upstream provider session id when present,
  requested model, capture timestamp, conversation URL when available).
- Keep task-local decisions in `tasks/notes/` and repeated correction rules in
  `tasks/lessons.md`; `docs/researches/` is for stable cross-task knowledge
  only.

## Boundaries

- Does not treat a raw handoff file under `.ai/harness/handoff/` as authority
  until it is distilled with provenance.
- Does not reuse a fixed output filename across sessions; every write is
  timestamped and slugged so it cannot be confused with a previous
  conversation.
