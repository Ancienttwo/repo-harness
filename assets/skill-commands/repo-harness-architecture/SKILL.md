---
name: repo-harness-architecture
description: Handles architecture coverage guidance, capability registration and drift requests through the existing model and projection authorities.
when_to_use: "repo-harness-architecture, architecture drift, architecture doc, architecture diagram, architecture model guidance, register capability, update architecture index, resolve architecture request"
---

# repo-harness-architecture

Use this command when the harness already exists and the user wants a focused
architecture documentation, drift-request, or diagram pass.

## Protocol

1. Confirm the target repo path and architecture scope.
2. Inspect `docs/architecture/index.md`, `.archcontext/model/nodes/`, and pending files under `docs/architecture/requests/`. For architecture model guidance or a registration scope, follow the coverage procedure below even when no drift request exists.
3. When the scope maps to repo code or config, resolve the capability with:
   - `repo-harness run capability-resolver match --repo <repo> --path <path> --format json`
4. Update the smallest relevant architecture artifact:
   - umbrella status in `docs/architecture/index.md`
   - module or snapshot docs under `docs/architecture/`
   - Mermaid fenced block in the relevant module or snapshot Markdown when a visual flow materially helps
5. Use Markdown Mermaid as the only architecture diagram artifact. Do not generate standalone HTML; use the external `mermaid` skill only to review layout and renderability before shipping the Markdown source.
6. Archive handled requests with:
   - `repo-harness run archive-architecture-request --request <request> --status <resolved|superseded|rejected|no-change> --artifact <path> --note <text>`
   - For `resolved`, the live `Pending` request must declare `> **Architecture Module**:` and that exact existing module path must be supplied as an `--artifact`.
7. Verify with:
   - `repo-harness run check-architecture-sync`
   - `repo-harness run capability-resolver validate --repo <repo> --format text`
   - `repo-harness run check-task-workflow --strict` when repo workflow surfaces changed

## Coverage and Agent-owned registration

SessionStart automatically supplies read-only coverage observations when the global
architecture provider is enabled and the repo selects `capability_source: archcontext`.
An empty model, missing module docs, unmatched tracked package roots, or multiple
packages sharing an ancestor capability are reasons to inspect, not proof that a new
capability is required. Hooks do not decide responsibilities or write nodes.

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
   module regions belong to archctx; preserve human-owned prose. Resolve any resulting
   drift request through the normal request protocol.

## Failure Modes

- If no pending architecture request exists, do not invent one. Coverage and registration work can proceed independently; report `no-change` only after inspecting the requested coverage scope.
- If capability resolution is ambiguous, stop at the matching paths and ask for a narrower scope.
- If `check-architecture-sync.sh` blocks in strict mode, resolve or archive the pending request card for the touched capability before finishing the worktree.
- If diagram validation fails, fix the Mermaid Markdown source or report the validation failure; do not substitute HTML.

## Boundaries

- Does not run `repo-harness init`.
- Does not install or refresh the full harness.
- Does not let hooks rewrite architecture prose; hooks only record drift requests.
- Does not vendor `mermaid`; it remains an external authoring/review skill and never owns a product artifact.
- Keeps `docs/architecture/requests/` pending-only by archiving handled requests.
