import { readFileSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join } from "path";
import type { AppendManagedBlockOperation, ManagedBlockMarker } from "../../core/adoption/operations";
import { managedBlockMarker, renderManagedBlock } from "../../core/adoption/managed-block";
import { makeOperationId } from "../../core/adoption/operations";
import { gitSpawnSync } from "../git/runner";
import { RETIRED_RUNTIME_IGNORE_RULES, retiredRuntimeRuleFiles } from "../upgrade/legacy-inventory";
import { isReleasedProjectIgnoreBlock, isReleasedUserExcludesBlock, isRetiredRuleSection } from "../upgrade/released-values";

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

const RETIRED_RUNTIME_HEADER = "# Retired runtime state that still exists; rh upgrade lists these files";

function gitignoreManagedBlockContent(repoRoot: string, extraContent: string): string {
  const retained = RETIRED_RUNTIME_IGNORE_RULES.filter((rule) => retiredRuntimeRuleFiles(repoRoot, rule).length > 0);
  const retiredContent = retained.length > 0 ? [RETIRED_RUNTIME_HEADER, ...retained].join("\n") : "";
  return [GITIGNORE_MANAGED_BLOCK_CONTENT, retiredContent, extraContent].filter((content) => content.trim().length > 0).join("\n\n");
}

/**
 * The current project block with any retired-rule subset at the place where
 * `gitignoreManagedBlockContent` renders the section: directly after the base content.
 */
function isCurrentProjectBlock(operation: AppendManagedBlockOperation, block: string): boolean {
  const { begin, end } = managedBlockMarker(operation.marker);
  const content = operation.content.trimEnd();
  if (!content.startsWith(GITIGNORE_MANAGED_BLOCK_CONTENT)) return block === renderManagedBlock(operation);
  const afterBase = content.slice(GITIGNORE_MANAGED_BLOCK_CONTENT.length);
  const ownSection = afterBase.startsWith(`\n\n${RETIRED_RUNTIME_HEADER}\n`) ? afterBase.indexOf("\n\n", 2) : 0;
  const prefix = `${begin}\n${GITIGNORE_MANAGED_BLOCK_CONTENT}`;
  const suffix = `${ownSection === -1 ? "" : afterBase.slice(ownSection)}\n${end}`;
  return block.length >= prefix.length + suffix.length && block.startsWith(prefix) && block.endsWith(suffix)
    && isRetiredRuleSection(block.slice(prefix.length, block.length - suffix.length), RETIRED_RUNTIME_HEADER, RETIRED_RUNTIME_IGNORE_RULES);
}

/**
 * Proof that an existing ignore block is managed. A project block is a released
 * block or the current rendering with any retired-rule subset. The user excludes
 * renderer has no retired section, so its block must equal a released block.
 */
export function ignoreBlockProof(operation: AppendManagedBlockOperation): (block: string) => boolean {
  if (operation.marker === GITIGNORE_MANAGED_BLOCK_MARKER) {
    return (block) => isReleasedProjectIgnoreBlock(block) || isCurrentProjectBlock(operation, block);
  }
  if (operation.marker === RUNTIME_STATE_IGNORE_MARKER) return isReleasedUserExcludesBlock;
  return () => false;
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

export const RUNTIME_STATE_IGNORE_MARKER = "repo-harness runtime-state";

// Runtime-state rules live in the user-level Git excludes file, so a rule change needs no commit in any repository.
export const RUNTIME_STATE_IGNORE_CONTENT = readFileSync(
  join(import.meta.dir, "../../../assets/templates/runtime-state.gitignore"), "utf8",
).trimEnd();

export function runtimeStateIgnoreOperation(path: string): AppendManagedBlockOperation {
  return {
    id: makeOperationId("appendManagedBlock", path, RUNTIME_STATE_IGNORE_MARKER),
    kind: "appendManagedBlock",
    path,
    marker: RUNTIME_STATE_IGNORE_MARKER,
    content: RUNTIME_STATE_IGNORE_CONTENT,
    reason: "Ensure the repo-harness runtime-state ignore block in the user-level Git excludes file is current",
    risk: "low",
    status: "planned",
  };
}

export type UserExcludesFile = { readonly ok: true; readonly path: string } | { readonly ok: false; readonly error: string };

/**
 * `core.excludesFile` from the global Git config when set, otherwise Git's default user-level excludes file.
 * `--includes` reads the `[include]` and `[includeIf]` sections of that config, as Git does when it applies ignore rules.
 */
export function userExcludesFilePath(callerEnv: NodeJS.ProcessEnv = {}): UserExcludesFile {
  // Git and the default path read the same HOME and XDG_CONFIG_HOME.
  const env = { ...process.env, ...callerEnv };
  const result = gitSpawnSync(["config", "--global", "--includes", "--type=path", "--get", "core.excludesFile"], { env, encoding: "utf8" });
  if (result.status === 0) {
    const configured = result.stdout.trim();
    if (!isAbsolute(configured)) return { ok: false, error: `core.excludesFile is not an absolute path: ${configured}` };
    return { ok: true, path: configured };
  }
  if (result.status === 1) {
    const configHome = env.XDG_CONFIG_HOME || join(env.HOME ?? homedir(), ".config");
    return { ok: true, path: join(configHome, "git", "ignore") };
  }
  const cause = (result.stderr || result.error?.message || `signal ${result.signal}`).trim();
  return { ok: false, error: `no user-level excludes file resolved: git config --global --includes --get core.excludesFile exited ${result.status}: ${cause}` };
}

export type RuntimeStateIgnoreRemoval =
  | { readonly status: "none" | "unbalanced" }
  | { readonly status: "removed"; readonly content: string };

/** Removes the marked block and at most one blank line before it, so a write and removal cycle adds no blank lines; other lines stay byte-equal. */
export function removeRuntimeStateIgnoreBlock(content: string): RuntimeStateIgnoreRemoval {
  const { begin, end } = managedBlockMarker(RUNTIME_STATE_IGNORE_MARKER);
  const lines = content.split(/(?<=\n)/);
  const bare = lines.map((line) => line.replace(/\r?\n$/, ""));
  const start = bare.indexOf(begin);
  const stop = bare.indexOf(end);
  if (start === -1 && stop === -1) return { status: "none" };
  if (start === -1 || stop < start || bare.indexOf(begin, start + 1) !== -1) return { status: "unbalanced" };
  // One blank line before the block is the write step's separator; drop it, unless it separates user lines.
  const blankBefore = start > 0 && bare[start - 1] === "";
  const blankAfter = stop + 1 < lines.length && bare[stop + 1] === "";
  const separator = blankBefore && (stop === lines.length - 1 || blankAfter) ? 1 : 0;
  return { status: "removed", content: [...lines.slice(0, start - separator), ...lines.slice(stop + 1)].join("") };
}
