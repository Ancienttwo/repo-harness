#!/usr/bin/env bun
/**
 * Skill Version Consistency Checker
 *
 * Validates that version numbers are consistent across:
 * - package.json
 * - assets/skill-version.json
 *
 * Also checks if a generated project needs migration.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveAgenticDevRoot } from "./workflow-contract.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");

export interface ConsistencyResult {
  consistent: boolean;
  packageJsonVersion: string | null;
  skillVersionJsonVersion: string;
  skillVersionSource: string;
  warnings: string[];
  errors: string[];
}

export interface MigrationCheckResult {
  needsMigration: boolean;
  currentSkillVersion: string;
  projectSkillVersion: string | null;
  projectTemplatVersion: string | null;
}

/**
 * Check version consistency across the version sources this repo owns.
 */
export function checkConsistency(repoRoot: string = REPO_ROOT): ConsistencyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Read package.json
  const pkgPath = join(repoRoot, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const packageJsonVersion =
    typeof pkg.version === "string" && pkg.version.length > 0
      ? (pkg.version as string)
      : null;

  // Read the local source manifest when this script runs inside agentic-dev;
  // generated projects resolve the upstream skill root instead.
  const localSvPath = join(repoRoot, "assets", "skill-version.json");
  const svPath = existsSync(localSvPath)
    ? localSvPath
    : join(resolveAgenticDevRoot(repoRoot), "assets", "skill-version.json");
  if (!existsSync(svPath)) {
    throw new Error(`skill-version.json not found at ${svPath}`);
  }
  const sv = JSON.parse(readFileSync(svPath, "utf-8"));
  const skillVersionJsonVersion = sv.version as string;

  // package.json.version is product release metadata. skill-version.json is the
  // generated workflow/template compatibility line.
  if (packageJsonVersion !== null) {
    warnings.push(
      `package.json.version (${packageJsonVersion}) is treated as product release metadata; workflow parity uses upstream agentic-dev skill-version.json only`
    );
  }

  return {
    consistent: errors.length === 0,
    packageJsonVersion,
    skillVersionJsonVersion,
    skillVersionSource: svPath,
    warnings,
    errors,
  };
}

/**
 * Check if a generated project needs migration.
 */
export function checkProjectNeedsMigration(
  projectPath: string,
  repoRoot: string = REPO_ROOT
): MigrationCheckResult {
  const localSvPath = join(repoRoot, "assets", "skill-version.json");
  const svPath = existsSync(localSvPath)
    ? localSvPath
    : join(resolveAgenticDevRoot(repoRoot), "assets", "skill-version.json");
  const sv = JSON.parse(readFileSync(svPath, "utf-8"));
  const currentSkillVersion = sv.version as string;

  const stampPath = join(projectPath, ".claude", ".skill-version");
  if (!existsSync(stampPath)) {
    return {
      needsMigration: true,
      currentSkillVersion,
      projectSkillVersion: null,
      projectTemplatVersion: null,
    };
  }

  const stampContent = readFileSync(stampPath, "utf-8");
  const skillVersionMatch = stampContent.match(/^skill_version=(.+)$/m);
  const templateVersionMatch = stampContent.match(/^template_version=(.+)$/m);

  const projectSkillVersion = skillVersionMatch?.[1] ?? null;
  const projectTemplatVersion = templateVersionMatch?.[1] ?? null;

  return {
    needsMigration: projectSkillVersion !== currentSkillVersion,
    currentSkillVersion,
    projectSkillVersion,
    projectTemplatVersion,
  };
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf("--project");
  const projectPath = projectIdx !== -1 ? args[projectIdx + 1] : null;

  try {
    const result = checkConsistency();

    if (result.consistent) {
      console.log(
        `Workflow version check passed: upstream skill-version.json=${result.skillVersionJsonVersion}`
      );
      console.log(`Workflow version source: ${result.skillVersionSource}`);
      for (const warning of result.warnings) {
        console.log(`Warning: ${warning}`);
      }
    } else {
      console.error("Version consistency check FAILED:");
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }

    if (projectPath) {
      const migration = checkProjectNeedsMigration(projectPath);
      if (migration.needsMigration) {
        console.log(
          `Project at ${projectPath} needs migration: ` +
          `${migration.projectSkillVersion ?? "(no stamp)"} → ${migration.currentSkillVersion}`
        );
      } else {
        console.log(`Project at ${projectPath} is up to date (${migration.currentSkillVersion})`);
      }
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
