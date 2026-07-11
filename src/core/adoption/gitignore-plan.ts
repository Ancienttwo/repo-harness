import type { AppendManagedBlockOperation, ManagedBlockMarker } from "./operations";
import { makeOperationId } from "./operations";

export const GITIGNORE_MANAGED_BLOCK_MARKER = "repo-harness generated-runtime";

export const LEGACY_GITIGNORE_MANAGED_MARKERS: readonly ManagedBlockMarker[] = [
  {
    begin: "# BEGIN: claude-runtime-temp (managed by repo-harness)",
    end: "# END: claude-runtime-temp",
  },
];

export const GITIGNORE_MANAGED_BLOCK_CONTENT = [
  "# Dependencies",
  "node_modules/",
  "",
  "# Project-specific",
  "artifacts/",
  "coverage/",
  "*.tar.gz",
  "*.tgz",
  "",
  "# External references",
  "_ref/",
  ".archcontext/",
  ".codegraph/",
  "",
  "# Local operations state",
  "_ops/",
  "",
  "# Environment",
  ".env",
  ".env.*",
  "!.env.example",
  "",
  "# OS metadata",
  ".DS_Store",
  "",
  "# Runtime evidence and local agent state",
  ".claude/settings.local.json",
  ".claude/.atomic_pending",
  ".claude/.session-id",
  ".claude/.trace.jsonl",
  ".claude/.session-handoff.md",
  ".claude/.task-state.json",
  ".claude/.task-handoff.md",
  ".claude/.codegraph-state/",
  ".claude/*.tmp",
  ".claude/*.bak",
  ".claude/*.bak.*",
  ".claude/*.backup-*",
  "tasks/.current.md.tmp.*",
  ".ai/harness/checks/latest.json",
  ".ai/harness/checks/*.latest.json",
  ".ai/harness/checks/*.latest.md",
  ".ai/harness/checks/post-bash-latest.json",
  ".ai/harness/events.jsonl",
  ".ai/harness/archive/",
  ".ai/harness/backups/",
  ".ai/harness/failures/latest.jsonl",
  ".ai/harness/handoff/current.md",
  ".ai/harness/handoff/resume.md",
  ".ai/harness/capability-context/",
  ".ai/harness/security/*",
  "!.ai/harness/security/.gitkeep",
  ".ai/harness/planning/*",
  "!.ai/harness/planning/.gitkeep",
  ".ai/harness/delegation/*",
  ".ai/harness/architecture/events.jsonl",
  ".ai/harness/active-plan",
  ".ai/harness/active-worktree",
  ".ai/harness/sprint/",
  ".ai/harness/worktrees/",
  ".ai/harness/runs/",
  ".ai/harness/chatgpt/browser-lock.json",
  ".ai/harness/chatgpt/tmp/",
  ".ai/harness/chatgpt/sessions/",
  ".ai/harness/triage/*",
  "!.ai/harness/triage/.gitkeep",
  ".repo-harness/chatgpt-browser.local.json",
  ".repo-harness/chatgpt-browser.tokens.json",
  ".codex/*",
  ".claude/.active-plan",
  ".claude/.plan-state/",
].join("\n");

function gitignoreManagedBlockContent(extraContent = ""): string {
  return [GITIGNORE_MANAGED_BLOCK_CONTENT, extraContent].filter((content) => content.trim().length > 0).join("\n\n");
}

export function gitignoreManagedBlockOperation(
  status: AppendManagedBlockOperation["status"],
  extraContent = "",
): AppendManagedBlockOperation {
  return {
    id: makeOperationId("appendManagedBlock", ".gitignore", GITIGNORE_MANAGED_BLOCK_MARKER),
    kind: "appendManagedBlock",
    path: ".gitignore",
    marker: GITIGNORE_MANAGED_BLOCK_MARKER,
    content: gitignoreManagedBlockContent(extraContent),
    legacyMarkers: LEGACY_GITIGNORE_MANAGED_MARKERS,
    reason: "Ensure repo-harness generated/runtime ignore block is present and current",
    risk: "low",
    status,
  };
}
