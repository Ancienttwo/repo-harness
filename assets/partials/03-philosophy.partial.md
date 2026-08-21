### 7. Development Protocol

> **Core Philosophy**: Code is toilet paper when contracts change; durable truth belongs in repo-local artifacts, not chat memory.

#### The Layered Truth

- **PRODUCT TRUTH**: `docs/spec.md`
- **EXECUTION TRUTH**: `plans/`
- **DONE TRUTH**: `tasks/contracts/`, `tasks/reviews/`, `tasks/notes/`, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`
- **MUTABLE LAYER**: `src/`

#### Response Protocol (Concise)

```yaml
NEW_FEATURE_FLOW:
  1. Define acceptance criteria
  2. Define contract
  3. Write failing tests
  4. Implement and verify

BUG_FIX_FLOW:
  1. Reproduce with test
  2. Fix root cause
  3. Re-run full verification
```

#### Artifact Hygiene

- Write comments, commit messages, and PR text from the final diff only, as if discarded intermediate attempts never existed.
- Comments state only the non-obvious reason at the owning boundary; never restate the operation, preserve intermediate attempts, or list speculative future work.
- PR text states final behavior plus only the material rationale or trade-off a reviewer cannot recover from the diff; never mention never-merged states or reverted work.

Detailed playbooks:
- `docs/reference-configs/harness-overview.md`
- `docs/reference-configs/agentic-development-flow.md`
- `docs/reference-configs/sprint-contracts.md`

---
