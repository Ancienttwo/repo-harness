# Architecture Domain: Runtime MCP

> **Source**: `repo-harness run capability-resolver`
> **Owner**: MCP-facing repository tools and the local ChatGPT browser consult engine.

## Purpose

Runtime MCP holds the tool surfaces that external assistants reach through the
local MCP sidecar or a host skill. General repository access exposes bounded
repository tools under the sidecar policy. The ChatGPT browser consult runs a
local ChatGPT Web session through a pinned browser provider and keeps the
session record in the repository.

## Capabilities

- `runtime-mcp-general-repo-access` -> `docs/architecture/modules/runtime-mcp/general-repo-access.md`: exposes bounded repository read tools and revision-guarded write tools through MCP.
- `runtime-mcp-chatgpt-browser` -> `docs/architecture/modules/runtime-mcp/chatgpt-browser.md`: runs local ChatGPT Web consult sessions through the pinned Oracle provider and projects the ChatGPT skill to hosts.

## Stable Rules

- A path is authorized before CodeGraph is called. Every path that CodeGraph returns passes the root and `.ignore` checks again.
- `repo_manifest` is the authority for the visible file set. Search results are not a completeness proof.
- Write tools require a `read_write` grant and a revision precondition (`expected_sha256` or `must_not_exist`).
- File bodies never go into logs, audit records, traces or errors.
- The browser consult never asks for login secrets. It sends only repository files that the caller selects explicitly.
- The browser consult never switches provider automatically. The repository session record is the audit record.
- The Oracle version match is exact.

## Verification Surface

- `bun test tests/cli/mcp-reader-tools.test.ts tests/cli/mcp-codegraph-contract.test.ts`
- `bun test tests/cli/mcp-policy.test.ts tests/cli/mcp-tools.test.ts`
- `bun run test:files tests/cli/chatgpt-browser.test.ts tests/unit/oracle-session-evidence.test.ts tests/skill-surface/chatgpt-package.test.ts --timeout 60000 --max-concurrency 1`
- `bun run check:type`
