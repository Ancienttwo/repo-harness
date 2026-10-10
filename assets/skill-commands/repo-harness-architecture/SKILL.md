---
name: repo-harness-architecture
description: Inspect or update an assigned architecture model, document, or Mermaid diagram. Exclude unrelated code edits and full harness setup.
when_to_use: "repo-harness-architecture"
---

# repo-harness-architecture

Worker entrypoint. Read the existing model and trace source responsibilities.
Package layout and hook observations are inspection leads, not semantic authority.
Keep intentional umbrella boundaries. Change the model only for a real
responsibility change. Use `references/worker.md` for ChangeSet, projection
and verification commands.
Generated regions belong to archctx. Preserve human prose. Keep diagrams in
Mermaid Markdown. Do not install tools, create approval records, or add capability
nodes to satisfy an unrelated edit. Report ambiguous ownership or provider failure.
