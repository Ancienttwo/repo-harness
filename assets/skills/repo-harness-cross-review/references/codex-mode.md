# Retired direct Codex advisory review

The old direct `repo-harness cross-review` command is retired. It is not an
alias and does not launch another provider or return an advisory skipped/pass.
The three former Core/Effects/CLI runtime files and their output parser are removed.

For a newly authorized acceptance request, use the existing generic review
surface described in `generic-review.md`: `repo-harness review round` with an
explicit `--harness codex` when required. The persistent fleet deep-reasoner
runs in the addressed Herdr pane through OAR. A missing explicit harness does
not silently fall back. Prepare the frozen contract/verification and dedicated
reviewer checkout first; this is a new domain review, not replay of an old command.

Acceptance binds the exact file Result, subject, request, actual model and
generic-review Receipt. Terminal output is observation; no native output parser
or synthesized receipt is introduced. Drain old sessions using their admitted
prior version and retain their evidence read-only. Do not reinterpret old
launcher-specific receipt sources as the new generic-review source.
