// No project imports: `herdr notify install` loads this module through a chain that plain Node also runs.
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** The single account-level harness home; every host-owned authority store roots here. */
export function repoHarnessHome(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.REPO_HARNESS_HOME ?? join(env.HOME ?? env.USERPROFILE ?? homedir(), ".repo-harness"));
}
