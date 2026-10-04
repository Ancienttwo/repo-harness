# Fleet worktree helper ownership

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

Fleet acquisition must resolve contract-worktree and plan-to-todo from the same trusted package runtime used by the CLI. Installed downstream repositories do not carry helper implementations in scripts/. Requiring those paths prevents a valid execution-ready offer from becoming a bound worktree.

The CLI acquisition regression deliberately omits repository-local helper scripts. It creates a real worktree and verifies the bound lease, claim token and repeated-acquire refusal. Existing effect and concurrency tests cover compensation and ownership. Campaign admission and frozen grants remain independent; a helper fix does not retroactively validate a failed canary.
