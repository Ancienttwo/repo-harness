# Task Review: archctx-maintenance-reminder

> **Status**: Pending
> **Plan**: plans/plan-20261001-0018-archctx-maintenance-reminder.md
> **Contract**: tasks/contracts/20261001-0018-archctx-maintenance-reminder.contract.md
> **Recommendation**: fail

## Review outcome

Waza check security and architecture specialist passes found no concrete code
findings. The only new runtime dispatch is daemon status via exact package-local
archctx and compatible Node. Typed upstream error/action triggers fixed
authorization text and never becomes an executable command. No new dependency,
persistent authorization store, or test file was introduced.

## Verification Evidence

Final canonical evidence is prepared by the contract Verification Plan;
review consumes that evidence without repeating checks. The initial focused
integration run passed 89 tests; the final exact-subject run is authoritative.
Architecture candidate b7ebfc46339bc12722ce47e623d3e8a3538c07a3d3568bc582d2f68559c7c6ed
was reconciled after package-local CodeGraph 1.6.1 indexed this isolated worktree.
The provider changed only docs/architecture/.projection-manifest.json.
Final verification/review binds dc77b3c6 after refreshing main. The pre-refresh
plugin review returned two findings, reproduced and fixed before acceptance.

## Residual Risks

Original checkout daemon and managed global CLI were verified live at 0.6.1;
no 0.2.3 process was demonstrated there. Real shared daemon replacement and
index rebuilding were not performed. Upstream status can recover stale control
files, as documented; no automatic upgrade or index reset is introduced.

## Independent review transcript (verbatim)

```json
{"verdict":"needs-attention","summary":"Do not ship yet: daemon mismatch now triggers an unsafe update rollback, and unhealthy daemons can pass readback.","findings":[{"severity":"high","title":"Daemon mismatch rolls back the harness without restoring its dependencies","body":"Updating while an older shared daemon is running now returns runtime-mismatch after installing the candidate. runTransactionalRuntimeRefresh then restores the previous repo-harness package and global manifests. However, installProfileHostMutationPaths excludes the hoisted archctx and archctx-contracts directories, so those dependencies can remain at the candidate versions. The resulting installation fails exact dependency readback, and the reminder's requested managed CLI is no longer the candidate. This is a concrete failure scenario for Bun installations with hoisted dependencies.","file":"src/cli/commands/global-runtime.ts","line_start":483,"line_end":486,"confidence":0.94,"recommendation":"Handle daemon maintenance as a distinct pending state that preserves a verified candidate installation, or restore the complete managed dependency closure during rollback. Add a transactional update regression covering an older running daemon and hoisted dependencies."},{"severity":"medium","title":"An unhealthy live daemon is accepted as safely stopped","body":"The packaged archctx@0.6.1 status implementation catches health-request failures, removes the unhealthy connection file, and returns running:false with staleConnection:true. This verifier accepts that response without further checks. A temporarily unresponsive live daemon therefore passes managed runtime readback even though compatibility was never established; subsequent runtime operations have lost the connection file while the live daemon lock remains. The new tests cover only a clean stopped response.","file":"src/effects/architecture/archctx-provider.ts","line_start":280,"line_end":282,"confidence":0.97,"recommendation":"Reject staleConnection:true as degraded runtime readiness instead of treating it as a clean stopped daemon. Preserve a clear recovery diagnostic and add a regression using the upstream unhealthy-status response."}],"next_steps":["Fix transactional handling of daemon maintenance and distinguish unhealthy status from a clean stopped daemon before shipping."]}
```
