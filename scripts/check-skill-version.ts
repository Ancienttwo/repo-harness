#!/usr/bin/env bun
/**
 * Skill Version Consistency Checker
 *
 * Validates that version numbers are consistent across:
 * - package.json
 * - assets/skill-version.json
 * - README.md, which carries the npm pin and the workflow stamp of a release
 *
 * Also checks if a generated project needs migration.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveAgenticDevRoot } from "./workflow-contract.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = __dirname.endsWith("/assets/templates/helpers")
  ? join(__dirname, "../../..")
  : join(__dirname, "..");

/** The three versions of the README release line: the npm pin and both workflow stamp versions. */
export interface ReadmeVersionPin {
  npm: string;
  skill: string;
  template: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  packageJsonVersion: string | null;
  skillVersionJsonVersion: string;
  templateVersionJsonVersion: string;
  skillVersionSource: string;
  readmeVersionPin: ReadmeVersionPin | null;
  warnings: string[];
  errors: string[];
}

// The README release line is the only README edit of a release:
// - npm: `repo-harness@<v>` · workflow stamp `repo-harness@<v>+template@<v>`
const README_PIN_PATTERN =
  /`repo-harness@(\d+\.\d+\.\d+)`[^\n]*?workflow stamp `repo-harness@(\d+\.\d+\.\d+)\+template@(\d+\.\d+\.\d+)`/;

function readReadmeVersionPin(readmePath: string): ReadmeVersionPin | null {
  if (!existsSync(readmePath)) return null;
  const match = readFileSync(readmePath, "utf-8").match(README_PIN_PATTERN);
  const npm = match?.[1];
  const skill = match?.[2];
  const template = match?.[3];
  if (npm === undefined || skill === undefined || template === undefined) return null;
  return { npm, skill, template };
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

  // Read the local source manifest when this script runs inside repo-harness;
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
  const templateVersionJsonVersion = sv.templateVersion as string;
  const usingLocalSkillManifest = svPath === localSvPath;

  if (
    usingLocalSkillManifest &&
    pkg.name === "repo-harness" &&
    packageJsonVersion !== null &&
    packageJsonVersion !== skillVersionJsonVersion
  ) {
    errors.push(
      `package.json.version (${packageJsonVersion}) must match assets/skill-version.json version (${skillVersionJsonVersion})`
    );
  }

  if (usingLocalSkillManifest && templateVersionJsonVersion !== skillVersionJsonVersion) {
    errors.push(
      `assets/skill-version.json templateVersion (${templateVersionJsonVersion}) must match version (${skillVersionJsonVersion})`
    );
  }

  // The README release line projects package.json. Only the repo-harness checkout
  // carries it; a generated project keeps its own README.
  const readmeVersionPin = readReadmeVersionPin(join(repoRoot, "README.md"));
  if (usingLocalSkillManifest && pkg.name === "repo-harness" && packageJsonVersion !== null) {
    if (readmeVersionPin === null) {
      errors.push(
        "README.md has no release line; it must read - npm: `repo-harness@<v>` · workflow stamp `repo-harness@<v>+template@<v>`"
      );
    } else {
      if (readmeVersionPin.npm !== packageJsonVersion) {
        errors.push(
          `README.md npm pin (${readmeVersionPin.npm}) must match package.json.version (${packageJsonVersion})`
        );
      }
      if (readmeVersionPin.skill !== packageJsonVersion) {
        errors.push(
          `README.md workflow stamp version (${readmeVersionPin.skill}) must match package.json.version (${packageJsonVersion})`
        );
      }
      if (readmeVersionPin.template !== packageJsonVersion) {
        errors.push(
          `README.md workflow stamp template version (${readmeVersionPin.template}) must match package.json.version (${packageJsonVersion})`
        );
      }
    }
  }

  if (!usingLocalSkillManifest && packageJsonVersion !== null) {
    warnings.push(
      `package.json.version (${packageJsonVersion}) belongs to the target repo; workflow stamp uses upstream repo-harness skill-version.json`
    );
  }

  return {
    consistent: errors.length === 0,
    packageJsonVersion,
    skillVersionJsonVersion,
    templateVersionJsonVersion,
    skillVersionSource: svPath,
    readmeVersionPin,
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
        `Workflow version check passed: repo-harness=${result.skillVersionJsonVersion}, template=${result.templateVersionJsonVersion}`
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
