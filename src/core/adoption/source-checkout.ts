import { existsSync, lstatSync, readFileSync } from "fs";
import { join, resolve } from "path";

const SOURCE_AUTHORITY_FILES = [
  "assets/workflow-contract.v1.json",
  "scripts/check-ci.sh",
  "src/cli/index.ts",
  "src/cli/hook-entry.ts",
  "src/core/adoption/standard-plan.ts",
] as const;

function regularFile(repoRoot: string, path: string): boolean {
  const target = join(repoRoot, path);
  return existsSync(target) && lstatSync(target).isFile();
}

/**
 * Identify the repo-harness package source by its complete canonical package
 * shape. The target path is deliberately irrelevant: an installed CLI and the
 * source checkout necessarily live under different roots.
 */
export function isRepoHarnessSourceCheckout(repoRoot: string): boolean {
  const root = resolve(repoRoot);
  if (!regularFile(root, "package.json")) return false;

  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
  } catch {
    return false;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;

  const packageManifest = manifest as Record<string, unknown>;
  const bins = packageManifest.bin;
  if (!bins || typeof bins !== "object" || Array.isArray(bins)) return false;
  const binMap = bins as Record<string, unknown>;
  if (packageManifest.name !== "repo-harness") return false;
  if (binMap["repo-harness"] !== "src/cli/index.ts") return false;
  if (binMap["repo-harness-hook"] !== "src/cli/hook-entry.ts") return false;

  return SOURCE_AUTHORITY_FILES.every((path) => regularFile(root, path));
}
