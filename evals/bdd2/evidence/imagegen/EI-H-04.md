# EI-H-04 ImageGen Prototype Appendix

- Provider: OpenAI ImageGen
- Generated at: 2026-07-13T00:25:00+08:00
- Asset: `evals/bdd2/evidence/imagegen/EI-H-04.png`
- Synthetic evidence: yes; this is stimulus material, not reliability evidence
- Named uncertainty: Which hierarchy keeps editing, unsynced status, and conflict recovery understandable without exposing sync internals?
- Directions: A top banner; B inline status bar; C bottom status panel.
- Decisions removed: manual sync policy, device list, quota, version history.
- Concepts added: none beyond offline/unsynced and conflict review.
- Backstage state hidden: sync engine and reconciliation internals.
- Recovery/trust retained: continued editing, preserved unsent edit, reconnect, review before overwrite.
- Resolution: Adapt direction A; the persistent top banner makes data-risk state visible without occupying an editor control surface.
- Falsifier: users continue editing without noticing unsynced state or cannot locate conflict review.
- Cannot prove: reliability or safe reconciliation implementation.
