---
name: obsidian-memory
description: Recall project memory or save reusable lessons to Obsidian only when explicitly requested. Exclude automatic task closeout, raw transcripts, and secrets.
when_to_use: "obsidian-memory"
disable-model-invocation: true
---

# obsidian-memory

Bot entrypoint. The vault is optional. Keep authority in repo artifacts;
sync direction is repo → brain. No configured brainRoot is a legitimate steady state.
Resolve the root fail-closed. Never guess or create one to complete a task.
Use `references/worker.md` for assigned recall, formatting, write and index steps.

Exclusion-first write gate: anything already recorded by Git, CI, a registry,
or a re-runnable command gets only a pointer in the vault, never a restatement.
Save only reusable reasons or methods that have one authoritative home.
Exclude secrets and transient status. Verify recalled claims against current state.
Preserve paths owned by `brain-manifest.json`. Hooks never read or write the vault.
An ordinary task does not require memory persistence.
