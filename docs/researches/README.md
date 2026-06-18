# Research Reports

Durable research reports live in this directory as topic-scoped Markdown files.

Use `YYYYMMDD-topic.md` names when chronology matters, or `<topic>.md` for
stable subject reports. Keep task-local implementation decisions in
`tasks/notes/`, and keep repeated correction-derived rules in `tasks/lessons.md`.

External model consults such as GPT Pro reviews are raw evidence, not durable
research by themselves. Store timestamped raw replies under
`.ai/harness/handoff/gptpro/` and promote only the reviewed synthesis into this
directory. Include provenance for promoted notes: raw artifact path, local
`sessionId`, upstream provider session id when available, requested model,
capture timestamp, and conversation URL when available.
