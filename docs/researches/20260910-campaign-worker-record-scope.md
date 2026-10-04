# Worker record scope

> Historical record. Campaign execution moved to the existing Bot skills on 2026-10-04. Use [repo-harness](../../SKILL.md) to dispatch and collect work through Herdr/OAR. Use [repo-harness-product](../../assets/skills/repo-harness-product/SKILL.md) for planning and [repo-harness-check](../../assets/skill-commands/repo-harness-check/SKILL.md) for scope and verification. repo-harness has no campaign runtime.

The contract-run worker packet has two different responsibilities: repository implementation under the contract's writable paths, and reporting an execution outcome through the exact runtime-owned result file. The result is not semantic acceptance and grants no authority to edit plans, contracts, policies, reviews or unrelated runtime files.

A real BRC worker refused its README-only task because the packet mandated Notes and result writes outside the displayed writable paths. It returned a blocked explanation without the result file; the independent verifier rejected the unchanged README. The controller retained its reservation when reading the absent result failed. Process exit0 was not interpreted as semantic success.

The packet now explicitly authorizes only the generated campaign result path, including blocked outcomes supported by real evidence. Notes are appended only within the existing write scope; otherwise observations return to the parent in the final response. No local shadow allowlist parser, wider business scope, synthesized result, or recovery bypass is added. The source script and shipped helper stay identical.

Model-free evidence: tests/contract-run.test.ts renders the real narrow-scope dry-run packet and exercises current-attempt output authority; tasks/evidence/campaign-worker-record-scope-pre-fix.log records the previous contradiction guard failing. This does not establish live worker success or BRC acceptance.
