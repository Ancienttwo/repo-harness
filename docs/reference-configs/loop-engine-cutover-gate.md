# Loop Engine Cutover History

The one-time cutover evaluator and its standing gate are retired.
This removal does not establish G2 completion or permit a classifier cutover.
`src/cli/hook/prompt-intents.ts` and `src/cli/hook/prompt-guard-decision.ts`
remain the runtime authority. Their affected tests remain active.

The old proposal required second G1 evidence and a shadow divergence report.
The last recorded state had no shadow divergence report. It did not permit
cutover. A future classifier change needs current evidence for its own scope.
