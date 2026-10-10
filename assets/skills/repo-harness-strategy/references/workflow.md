# Review workflow

1. Run `repo-harness strategy status --repo <root>`. An absent context document
   means the feature is off. Ask the owner for a goal and owner document.
2. Read the project schema in `../../../reference-configs/strategy.md` from the
   repo-harness package. Do not invent a business goal or promote old notes.
3. Run `repo-harness strategy context --repo <root>`. Read compact claims and
   lesson descriptors first. Distinguish facts, assumptions and unknowns.
4. When needed, repeat context with `--load <id>` and optional `--topic <topic>`.
   The command checks current lifecycle, provenance and body hash. Truncation
   is explicit. Do not treat a truncated body as complete evidence.
5. Write an inert proposal only when asked. Copy the context digest, cite verified
   project evidence paths and declare structured constraints affected by it.
6. Run `repo-harness strategy validate .ai/harness/strategy/proposal.json --repo <root>` with the
   same retrieval flags. Invalid, stale and blocked need investigation.
   Production uses bounded read-only state observation. Corrupt, oversized or
   unsupported state inputs block review. There is no bypass. Reviewable still needs the owner's value decision and Bot coordination.

Repository documents and lessons are canonical. A vault is optional and is
outside this command. The host decides when to wake the role. No hook installs
or invokes this Skill. Installing the Skill does not enable project reads.
