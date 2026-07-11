import { homedir } from "os";
import { realpathSync } from "fs";
import { resolve } from "path";
import { runProcess } from "../../effects/process-runner";

export interface RepoAdoptionTargetError {
  readonly step: "validate repo target";
  readonly status: "failed";
  readonly detail: string;
}

function homeDir(env?: NodeJS.ProcessEnv): string | null {
  return env?.HOME ?? env?.USERPROFILE ?? process.env.HOME ?? process.env.USERPROFILE ?? homedir() ?? null;
}

function samePath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function isGitWorkTree(repoRoot: string, env?: NodeJS.ProcessEnv): boolean {
  const result = runProcess("git", ["-C", repoRoot, "rev-parse", "--is-inside-work-tree"], { env });
  return result.ok && result.stdout.trim() === "true";
}

/**
 * The public `adopt` command and `init` share this boundary. Keeping it here
 * prevents either entrypoint from silently gaining a different target policy.
 */
export function validateRepoAdoptionTarget(
  repoRoot: string,
  explicitRepo: boolean,
  env?: NodeJS.ProcessEnv,
): RepoAdoptionTargetError | null {
  const home = homeDir(env);
  if (home && samePath(repoRoot, home)) {
    return {
      step: "validate repo target",
      status: "failed",
      detail:
        `refusing to apply repo harness to HOME (${repoRoot}); run repo-harness adopt --repo <git-repo> from an intended project`,
    };
  }

  if (!explicitRepo && !isGitWorkTree(repoRoot, env)) {
    return {
      step: "validate repo target",
      status: "failed",
      detail:
        `cwd is not inside a git work tree (${repoRoot}); pass --repo <project-path> explicitly for non-git scaffolds`,
    };
  }

  return null;
}
