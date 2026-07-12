# EI-H-01 ImageGen Prototype Appendix

- Provider: OpenAI ImageGen
- Generated at: 2026-07-13T00:22:00+08:00
- Asset: `evals/bdd2/evidence/imagegen/EI-H-01.png`
- Synthetic evidence: yes; this is stimulus material, not user evidence
- Named uncertainty: Which placement keeps timeout status and one safe Retry visible on the report page with the fewest decisions?
- Directions: A top inline banner; B persistent side panel; C centered overlay.
- Decisions removed: model, prompt, queue, fallback, retry policy, settings.
- Concepts added: none beyond existing report status and Retry.
- Backstage state hidden: provider routing and orchestration.
- Recovery/trust retained: report context, timeout, running, success/failure, one Retry.
- Resolution: Adapt direction A; it preserves page context and avoids modal interruption or persistent navigation weight.
- Falsifier: if users cannot find or understand Retry in a low-fidelity usability check, reopen placement.
- Cannot prove: preference, usability, value, or demand.
