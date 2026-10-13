# Loop Engine Cutover History

The one-time cutover evaluator and its standing gate are retired.
The prompt classifier is deleted too. The prompt-guard-decision modules were
removed in #691. `src/cli/hook/prompt-intents.ts` and its test were removed in
#694.
No prompt classifier or prompt decision table is a runtime authority. The
`UserPromptSubmit.default` handler only adds the `[OperationBoundaries]` line
for an explicit workflow command.

The old proposal required second G1 evidence and a shadow divergence report.
The last recorded state had no shadow divergence report. It did not permit
cutover. A new prompt classifier needs current evidence for its own scope.
