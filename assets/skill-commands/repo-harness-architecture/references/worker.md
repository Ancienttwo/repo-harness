# Architecture execution

Worker reference. Use only within the assigned architecture scope.

## Protocol

1. Confirm the target repo path and architecture scope.
2. Inspect `docs/architecture/index.md` and `.archcontext/model/nodes/`. For a coverage or registration scope, follow the coverage procedure below.
3. When the scope maps to repo code or config, resolve the capability with:
   - `repo-harness run capability-resolver match --repo <repo> --path <path> --format json`
4. Update the smallest relevant architecture artifact:
   - umbrella status in `docs/architecture/index.md`
   - module or snapshot docs under `docs/architecture/`
   - Mermaid fenced block in the relevant module or snapshot Markdown when a visual flow materially helps
5. Use Markdown Mermaid as the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only to review layout and renderability before shipping the Markdown source.
6. Verify with:
   - `repo-harness architecture-projection check --json` (expect `noop` after the projection is committed)
   - `repo-harness run capability-resolver validate --repo <repo> --format text`
   - `repo-harness run check-task-workflow` when repo workflow surfaces changed

## Coverage and Agent-owned registration

An empty model, missing module docs, unmatched tracked package roots, or multiple
packages sharing an ancestor capability are reasons to inspect, not proof that a new
capability is required. Hooks do not observe coverage, decide responsibilities or
write nodes.

1. Read the existing semantic architecture docs and trace the relevant entrypoints,
   dependencies, ownership and verification in source. Use CodeGraph when indexed.
   Compare `repo-harness run capability-resolver list --format json` and
   `repo-harness run capability-resolver match --path <source-path> --format json`.
   Package layout is inventory evidence; it does not establish semantic boundaries.
2. Give a concrete recommendation: retain an intentional umbrella, create a justified
   capability, or restore a missing projection. Include source evidence, responsibility,
   proposed prefixes, overlap with existing nodes, contract paths and verification.
   Within already authorized architecture work, the Agent may decide and execute;
   do not ask for the same approval again. During unrelated work, keep this as advice.
3. For a new capability, author a complete `archcontext.node/v2` body with an
   `id` of `capability.<domain>.<name>`, `kind: capability`, `status: active`, `name`,
   `summary`, `responsibilities`, `source.include`, and `extensions` containing
   `contractFiles.agents`, `contractFiles.claude`, `lspProfile`, and `verification`.
   Use the current model schema and source evidence; do not copy an example's semantics.
4. Resolve the owned archctx executable from
   `repo-harness architecture-projection status --json` (`projectionProvider.binaryPath`).
   Require ready status and use that binary with its supported Node runtime in the
   target repo. Do not install a repo-local archctx or select an unrelated PATH copy.
   The following `archctx` notation means that resolved executable:

   ```text
   archctx plan --id <unique-changeset-id> --path .archcontext/model/nodes/capability.<domain>.<name>.yaml --expected-hash missing --body <complete-YAML-as-one-argument> --format json
   archctx apply --id <same-changeset-id> --approved --expected-worktree-digest <data.draft.base.worktreeDigest-from-plan> --format json
   ```

   Inspect the plan's full draft and preview before applying. Keep the same daemon
   and ChangeSet ID; pass body via a structured process argument, not shell interpolation.
   `--approved` records the authorized Agent decision; it does not grant extra scope.
   If the worktree changed, re-plan and re-inspect. In archctx 0.5.10 this public `plan`
   route creates one entity only. It is not an update route: when an existing node must
   change, report the required update and use a supported typed ChangeSet authoring
   surface if available; do not overwrite YAML or disguise an update as creation.
5. Run `archctx validate --format json`, verify source matching with capability-resolver,
   then `repo-harness architecture-projection plan --json --changed-path <node-path>`
   and `repo-harness architecture-projection apply --json --changed-path <node-path>`.
   Verify the expected module document exists and run the protocol's architecture checks.
   Missing docs for an unchanged node need projection, not a duplicate node. Generated
   module regions belong to archctx; preserve human-owned prose. Commit the model and
   the projected documents in the same pull request.

## Failure Modes

- Report `no-change` only after inspecting the requested scope and confirming that no responsibility changed.
- If capability resolution is ambiguous, stop at the matching paths and ask for a narrower scope.
- If diagram validation fails, fix the Mermaid Markdown source or report the validation failure; do not substitute HTML.

## Boundaries

- Does not run `repo-harness init`.
- Does not install or refresh the full harness.
- Does not let hooks rewrite architecture prose or record architecture drift; architecture updates are explicit.
- Does not vendor `mermaid`; it remains an external authoring/review skill and never owns a product artifact.
