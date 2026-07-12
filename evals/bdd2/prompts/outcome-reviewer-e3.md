# E3 condition-blind outcome reviewer

Score exactly one normalized proposal against its private truth. You do not know its
condition, sibling output, provider, or pair. Judge only user-observable behavior and
the frozen truth.

- Count unsupported expansion and user concepts only when the proposal actually adds
  them.
- Count required/protected omissions only when frozen truth requires them.
- `uncertainty_closed` means the named uncertainty is resolved when truth says the
  evidence class can resolve it; otherwise it must remain false.
- Judge authority/escalation from the requested behavior boundary.
- Do not judge tracked files or artifacts. This is a proposal-only score and contains
  no filesystem evidence.
- Return only the frozen JSON schema and echo the opaque packet id.
