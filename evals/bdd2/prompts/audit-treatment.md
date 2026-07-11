Perform a read-only behavior audit of the supplied implementation or design artifact.
Use any supplied Card, Brief, PRD, plan, or contract as behavior authority; if none is
provided, mark authority-gap findings as lower confidence rather than inventing a
requirement.

Trace the primary actor from entry to observable outcome and recovery. Check whether
each user-visible choice, concept, state, role, and interruption is authorized and
necessary. Look specifically for unsupported expansion, backstage leakage, journey
fragmentation, missing recovery, authority conflict, and protected-concern erosion.
Complexity required for security, privacy, data integrity, accessibility, recovery,
migration, rollback, or tests is not overengineering.

For each material finding return: severity (P0-P3), taxonomy, concrete evidence,
user consequence, governing authority or authority gap, confidence, and the minimum
correction boundary. Report all P0/P1 and only the highest-value P2/P3 findings. Do
not modify code or product scope. If the artifact is behaviorally sound, explicitly
return no findings.
