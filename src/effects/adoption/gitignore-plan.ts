import { readFileSync } from "fs";
import { join } from "path";
import type { AppendManagedBlockOperation, ManagedBlockMarker } from "../../core/adoption/operations";
import { makeOperationId } from "../../core/adoption/operations";
import { RETIRED_RUNTIME_IGNORE_RULES, retiredRuntimeRuleFiles } from "../upgrade/legacy-inventory";

export const GITIGNORE_MANAGED_BLOCK_MARKER = "repo-harness generated-runtime";

export const LEGACY_GITIGNORE_MANAGED_MARKERS: readonly ManagedBlockMarker[] = [
  {
    begin: "# BEGIN: claude-runtime-temp (managed by repo-harness)",
    end: "# END: claude-runtime-temp",
  },
];

export const GITIGNORE_MANAGED_BLOCK_CONTENT = readFileSync(
  join(import.meta.dir, "../../../assets/templates/runtime.gitignore"), "utf8",
).trimEnd();

const RETIRED_RUNTIME_HEADER = "# Retired runtime state that still exists; repo-harness upgrade lists these files";

function gitignoreManagedBlockContent(repoRoot: string, extraContent: string): string {
  const retained = RETIRED_RUNTIME_IGNORE_RULES.filter((rule) => retiredRuntimeRuleFiles(repoRoot, rule).length > 0);
  const retiredContent = retained.length > 0 ? [RETIRED_RUNTIME_HEADER, ...retained].join("\n") : "";
  return [GITIGNORE_MANAGED_BLOCK_CONTENT, retiredContent, extraContent].filter((content) => content.trim().length > 0).join("\n\n");
}

export function gitignoreManagedBlockOperation(
  repoRoot: string,
  status: AppendManagedBlockOperation["status"],
  extraContent = "",
): AppendManagedBlockOperation {
  return {
    id: makeOperationId("appendManagedBlock", ".gitignore", GITIGNORE_MANAGED_BLOCK_MARKER),
    kind: "appendManagedBlock",
    path: ".gitignore",
    marker: GITIGNORE_MANAGED_BLOCK_MARKER,
    content: gitignoreManagedBlockContent(repoRoot, extraContent),
    legacyMarkers: LEGACY_GITIGNORE_MANAGED_MARKERS,
    reason: "Ensure repo-harness generated/runtime ignore block is present and current",
    risk: "low",
    status,
  };
}
