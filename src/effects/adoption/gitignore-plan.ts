import { lstatSync, readdirSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import type { AppendManagedBlockOperation, ManagedBlockMarker } from "../../core/adoption/operations";
import { makeOperationId } from "../../core/adoption/operations";

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

/**
 * Rules that left the managed block while older releases still wrote their
 * files. Removing a rule while its files exist turns that runtime state into
 * untracked files, so init keeps each rule until no file that it matches exists.
 * Each rule is a path, a directory with a trailing `/`, or a name prefix with a trailing `*`.
 */
export const RETIRED_RUNTIME_IGNORE_RULES: readonly string[] = [
  ".claude/.session-id",
  ".claude/.trace.jsonl",
  ".ai/harness/active-plan",
  ".ai/harness/sprint/",
  ".ai/harness/handoff/current.md",
  ".ai/harness/handoff/resume.md",
  ".claude/.active-plan",
  ".claude/.plan-state/",
  "tasks/current.md",
  "tasks/.current.md.tmp.*",
];

const RETIRED_RUNTIME_HEADER = "# Retired runtime state that still exists; repo-harness upgrade lists these files";

function entry(path: string): ReturnType<typeof lstatSync> | null {
  try { return lstatSync(path); } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return null;
    throw error;
  }
}

/** A link counts as one file; it is never followed. */
function filesBelow(repoRoot: string, path: string): string[] {
  const stat = entry(join(repoRoot, path));
  if (!stat) return [];
  if (!stat.isDirectory()) return [path];
  return readdirSync(join(repoRoot, path)).sort().flatMap((name) => filesBelow(repoRoot, `${path}/${name}`));
}

/** Repo-relative POSIX paths of the files that a retired rule matches. */
export function retiredRuntimeRuleFiles(repoRoot: string, rule: string): string[] {
  if (!rule.endsWith("*")) return filesBelow(repoRoot, rule.replace(/\/$/, ""));
  const parent = dirname(rule);
  const prefix = basename(rule).slice(0, -1);
  if (!entry(join(repoRoot, parent))?.isDirectory()) return [];
  return readdirSync(join(repoRoot, parent)).sort().filter((name) => name.startsWith(prefix))
    .flatMap((name) => filesBelow(repoRoot, `${parent}/${name}`));
}

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
