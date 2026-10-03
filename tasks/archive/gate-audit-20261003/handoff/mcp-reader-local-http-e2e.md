# MCP Reader Local HTTP E2E

Updated: 2026-06-21T22:41:58+0800
Status: passed
Scope: local HTTP MCP server transcript only

## Boundary

This is not live ChatGPT Connector/App evidence. It proves the local HTTP MCP server, session lifecycle, tool registry, and workspace reader path using a temporary repo, a temporary `REPO_HARNESS_HOME`, and a temporary bearer token that is not included here.

No release, tag, publish, version bump, release check, staging, or commit was run.

## Command Shape

```text
node <inline transcript runner>
  -> bun src/cli/index.ts mcp serve
     --repo <temp repo>
     --transport http
     --host 127.0.0.1
     --port <temp port>
     --profile planner
     --auth bearer
     --enable-reader
     --allow-root <temp repo>
```

Environment:

```text
REPO_HARNESS_HOME=<temp home>
REPO_HARNESS_MCP_TOKEN=<temp token, not recorded>
REPO_HARNESS_MCP_PUBLIC_ORIGIN=https://repo-harness-e2e.example.test
```

## Transcript Summary

```json
{
  "generated_at": "2026-06-21T14:41:27.117Z",
  "server": {
    "health_status": "ok",
    "auth_mode": "bearer",
    "profile": "planner",
    "package_version": "0.7.5",
    "public_origin": "https://repo-harness-e2e.example.test",
    "schema_hash_shape": "sha256-hex",
    "capabilities": {
      "workspaceReader": true,
      "workflowPlanner": true,
      "workflowExecutor": false,
      "agentRunner": false
    },
    "allowed_root_count": 1
  },
  "auth": {
    "no_auth_status": 401,
    "bearer_initialize_status": 200,
    "session_id_shape": "uuid-redacted"
  },
  "tools": {
    "total_count": 25,
    "has_workflow_writer": true,
    "has_reader_subset": true,
    "has_run_agent_goal": false,
    "has_browser_tools": false
  },
  "roots": {
    "count": 1,
    "selected_root_id_shape": "root_hash-redacted"
  },
  "workspace": {
    "open_workspace_id_shape": "workspace-redacted",
    "outside_open_error": "TRAVERSAL_DENIED"
  },
  "reads": {
    "tree_paths": [
      "docs/design.md",
      "docs/large.md",
      "docs/repo-harness-chatgpt-mcp-setup.md",
      "package.json",
      "src/index.ts"
    ],
    "markdown_text": "2: local http reader route\n3: needle in design",
    "source_text": "1: export const localHttpReader = true;",
    "manifest_text": "1: {\"name\":\"local-http-reader\"}",
    "large_first_lines": "1: 1: filler\n2: 2: filler",
    "large_second_range": "2201: 2201: filler needle-large",
    "large_second_has_more": true
  },
  "search": {
    "match_count": 2,
    "paths": [
      "docs/design.md",
      "docs/large.md"
    ]
  },
  "denies": {
    "env_error": "PATH_DENIED",
    "secret_error": "PATH_DENIED",
    "traversal_error": "TRAVERSAL_DENIED"
  },
  "session": {
    "delete_status": 200,
    "stale_status": 404,
    "stale_error": "SESSION_NOT_FOUND"
  }
}
```

## Evidence Meaning

- Planner `tools/list` exposes workflow writer tools plus reader tools in the same Connector.
- Runner/browser tools are absent by default.
- `read_text` can read normal Markdown, source, package manifest, and large-file ranges from an allowed workspace.
- `search_text` finds bounded text matches across Markdown files.
- `.env`, `secrets/**`, and traversal paths remain blocked.
- DELETE closes the session; reusing the deleted session returns `SESSION_NOT_FOUND`.

## Still Pending

- Live ChatGPT Connector/App tool invocation through the public HTTPS endpoint.
- OAuth refresh and reconnect evidence from the ChatGPT surface.
- Hosted Ubuntu/macOS/Windows path matrix on the current diff.
- Release and published-package smoke after the release hold is lifted.
