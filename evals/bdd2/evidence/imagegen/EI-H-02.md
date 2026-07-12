# EI-H-02 ImageGen Prototype Appendix

- Provider: OpenAI ImageGen
- Generated at: 2026-07-13T00:23:00+08:00
- Asset: `evals/bdd2/evidence/imagegen/EI-H-02.png`
- Synthetic evidence: yes; this is stimulus material, not semantic accessibility evidence
- Named uncertainty: Which layout connects one field error, summary, and focus order without adding a validation wizard?
- Directions: A summary plus error below field; B summary plus error beside field; C section summary plus field error.
- Decisions removed: extra steps, wizard, validation settings.
- Concepts added: one existing-form error summary.
- Backstage state hidden: validation implementation.
- Recovery/trust retained: entered values, linked summary, field-local text, focus order.
- Resolution: Adapt direction A; it keeps conventional reading order with the smallest layout change.
- Falsifier: semantic tests fail to establish summary link, field association, or focus/announcement behavior.
- Cannot prove: screen-reader behavior or conformance; implementation tests remain required.
