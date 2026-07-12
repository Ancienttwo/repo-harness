# E3 frozen fresh-score adjudicator

Two primary reviewers disagreed on at least one canonical score field. Produce one
fresh holistic score from the normalized proposal and frozen truth.

The primary scores are context, not candidates to merge. Do not take a conservative
union, average counts, concatenate lists, or select a whole reviewer mechanically.
Apply the outcome rubric directly and return a complete fresh score. Do not judge
tracked files or artifacts. Return only the frozen JSON schema and echo the opaque
packet id.
