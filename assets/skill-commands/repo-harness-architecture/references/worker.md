# Architecture execution

Worker reference. Use only within the assigned architecture scope.

## Protocol

1. Confirm the target repo path and architecture scope.
   Projection `check` and `apply` need CodeGraph code facts. In a new worktree run `codegraph init -y .`; when `.codegraph/` exists, run `codegraph sync .`.
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
   - `repo-harness architecture-projection anchors --json` (read-only; see "Drift signals")
   - `repo-harness run capability-resolver validate --repo <repo> --format text`
   - `repo-harness run check-task-workflow` when repo workflow surfaces changed
   - The module reader and the review diff read the committed HEAD model, but `archctx resolve` reads the worktree model. Commit the model before a review diff.

## Managed archctx command

Run `repo-harness architecture-projection status --json`. Require
`projectionProvider.state` to be `ready`. Set `NODE` to
`projectionProvider.command[0]` and `ARCHCTX` to `projectionProvider.command[1]`.
Run every archctx command as `"$NODE" "$ARCHCTX" <command>` in the target repo.
Do not run a bare archctx from PATH. A PATH copy can have another version. A wrong
version can print a help envelope with `"ok": true`, so a failure looks like
success. Do not install a repo-local archctx.

## Drift signals

- Generated sections: `repo-harness architecture-projection check --json`.
  `freshness.staleNodes` names the stale capabilities.
- Human-written sections: `repo-harness architecture-projection anchors --json`.
  It runs `docs anchors` and writes no file. It lists cited paths that are
  missing, line numbers out of range, symbols that are missing and lines that
  moved. Fix the citations in your scope. Report the others.
- Flow selectors: `"$NODE" "$ARCHCTX" flows check --json`. It checks the flow
  selectors in seconds. Run it before `apply`, so that a flow error does not
  first show in the slower projection check. It needs CodeGraph code facts.

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
4. Set `NODE` and `ARCHCTX` as "Managed archctx command" describes. Write the
   model through one ChangeSet as described in "Model ChangeSets". Do not edit
   model YAML by hand when a ChangeSet route exists.
5. Run `"$NODE" "$ARCHCTX" validate --format json` and
   `"$NODE" "$ARCHCTX" flows check --json`. Verify source matching with
   capability-resolver. Then run `repo-harness architecture-projection apply --json`
   and `repo-harness architecture-projection check --json` (expect `noop`).
   Verify the expected module document exists and shows `Proof: proven`. Missing docs
   for an unchanged node need projection, not a duplicate node. Generated module
   regions belong to archctx; preserve human-owned prose. Commit the model and the
   projected documents in the same pull request.

## Model ChangeSets (archctx 0.7.2)

- `plan` creates, updates and deletes entities. The operations are `create_entity`,
  `update_entity_fields` and `delete_entity`. A body is the complete new YAML
  document, not a field patch.
- `expectedHash` is `missing` for a new file. For an existing file, read it with
  `"$NODE" "$ARCHCTX" hash --path <repo-relative file>`. It is not `sha256sum` of the file.
- Put dependent changes (node, relation, flow) in one ChangeSet with
  `"$NODE" "$ARCHCTX" plan --id <id> --operations-file <file>`; `-` reads the
  operations from stdin. The single-entity route
  `"$NODE" "$ARCHCTX" plan --id <id> --op <op> --path <file> --expected-hash <hash> --body-file <file>`
  also works. Input files must be repository-relative; use an ignored path such as
  `.archcontext/tmp/` and delete it before commit.
- Inspect the draft and preview, then run
  `"$NODE" "$ARCHCTX" apply --id <same-id> --approved --expected-worktree-digest <draft.base.worktreeDigest>`.
  A draft lives in daemon memory. Plan again after a daemon restart or any worktree
  change. `--approved` records the authorized Agent decision; it does not grant extra scope.
- A component footprint is `source.include` on the `component.*` node, with an
  optional `source.exclude`. ArchContext validation owns the include and exclude
  shapes. repo-harness resolves path ownership only through
  `"$NODE" "$ARCHCTX" resolve --paths-from <file> --json`. When the candidates lie on one
  `parent` chain, the deepest node owns the path, and the result reports
  `owningCapabilityId`. A capability can own paths only through globs. It then
  has no literal anchor, and lists show it by its node id.
- In a capability include, use exact paths or `dir/**`. A file-name glob such as
  `scripts/new-*.sh` widens the capability's literal anchor to `scripts`, and the
  module review diff uses that anchor. Put file-name globs on a component. When one
  node owns most of a directory, include `dir/**` and exclude the files that other
  nodes own, so that no file has two owners off one `parent` chain.
- Before a `plan` that writes a node file, read `preview.ownershipDelta`: the files
  that become owned, contested or unowned, or change owner.
- A flow step is proven only with a relation for the exact step, a source symbol that is
  unique in its file, and a direct CodeGraph `calls` edge from source to sink.
- Do not pass `--request-id` to `architecture-projection apply`. When ArchContext
  reports a major change, `apply` derives the request id of the accepted change from
  the ArchContext signal. A large model can exceed the configured
  `projection_timeout_ms`. The archctx run can still finish, so run `check` before
  you apply again.
- A relation to another capability rewrites that capability's module page. When several
  workers change the model in parallel, restore generated pages and shared projection
  outputs outside your scope before commit. The integrator projects once.
- `repo-harness module list`, `module review-prompt` and Engineer contract
  revisions read the committed HEAD snapshot. Commit the model before you verify
  them. An uncommitted model change shows in `worktree_dirty_paths`. An
  uncommitted new capability returns `capability_uncommitted`.

## Adopt ArchContext in a repository

Use this flow when `architecture-projection status --json` returns a `next` step.
Then the repository has no complete ArchContext model, and `apply.enabled` is
`false`. Do the flow in one branch. Commit the result in one pull request.

1. Run `codegraph init -y .`. Set `NODE` and `ARCHCTX` as "Managed archctx command"
   describes.
2. While `.ai/harness/policy.json#context.capability_source` is `registry`, export
   the registry:
   `repo-harness run capability-resolver export --format archcontext-nodes-v2`.
   The output is a JSON array of complete `archcontext.node/v2` capability nodes.
   An empty registry gives an empty array. Then author the first nodes as
   "Coverage and Agent-owned registration" describes.
3. Run `"$NODE" "$ARCHCTX" init --name <product name>`. It writes
   `.archcontext/manifest.yaml`, `.archcontext/product.yaml` and one sample node
   `capability.architecture.context`. The sample node has no `responsibilities`
   or `extensions`, so repo-harness cannot read it.
4. Write one ChangeSet. Create one node file per exported node at
   `.archcontext/model/nodes/<id>.yaml`. JSON text is valid YAML, so the body can
   be the exported node. Delete the sample node with the hash from
   `"$NODE" "$ARCHCTX" hash --path .archcontext/model/nodes/capability.architecture.context.yaml`.
   A first apply has no baseline, so it cannot accept an unproven capability. Give
   each capability a proof in the same ChangeSet:
   - a child `component.*` node with `parent` set to the capability, and a relation
     between two nodes in that scope (proof P1);
   - a flow with `applicability: required` that `flows check` proves, or a flow
     with `applicability: not-applicable` and a `rationale` (proof P2).
5. Run `"$NODE" "$ARCHCTX" validate --format json` and
   `"$NODE" "$ARCHCTX" flows check --json`.
6. Set `context.capability_source` to `archcontext` in `.ai/harness/policy.json`.
   Delete `.ai/context/capabilities.json`. In `.ai/context/context-map.json`,
   replace `.ai/context/capabilities.json` in `root_context_files` with
   `.archcontext/model/nodes`. Update the root `CLAUDE.md` and `AGENTS.md` lines
   that name the registry file. Keep one authority. Do not keep the registry as
   a second source.
7. Run `repo-harness run capability-resolver validate --repo . --format text`.
   Run `repo-harness capability-context status`. It lists each capability id and
   its declared contract files. For each capability whose contract files do not
   exist, run `repo-harness capability-context sync --capability <id> --apply`
   with the id from that list. Commit.
8. Run `repo-harness architecture-projection apply --json`. A repository with an
   existing `docs/architecture/index.md` returns `adoption-required`. Then read the
   `adoptionPlanId` from the preview
   `"$NODE" "$ARCHCTX" docs adopt --profile repo-harness/v1`. The preview writes
   no file. Run
   `repo-harness architecture-projection adopt --json --adoption-plan-id <adoptionPlanId>`.
9. Commit the projected `docs/architecture/` files. Run
   `repo-harness architecture-projection check --json` and expect `noop`.

## Failure Modes

- Report `no-change` only after inspecting the requested scope and confirming that no responsibility changed.
- If capability resolution is ambiguous, stop at the matching paths and ask for a narrower scope.
- If diagram validation fails, fix the Mermaid Markdown source or report the validation failure; do not substitute HTML.

## Boundaries

- Does not run `repo-harness init`.
- Does not install or refresh the full harness.
- Does not let hooks rewrite architecture prose or record architecture drift; architecture updates are explicit.
- Does not vendor `mermaid`; it remains an external authoring/review skill and never owns a product artifact.
