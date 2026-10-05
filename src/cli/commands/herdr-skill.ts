import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { InstallTargetSpec } from "./install";

const STEP = "configure required Herdr skill";
const MARKER = ".repo-harness-owner.json";
type Step = { step: string; status: "ok" | "failed"; detail: string };
type BackupCleanup = (path: string) => void;

function digest(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function ownedSkillIsIntact(directory: string): boolean {
  try {
    const marker = JSON.parse(readFileSync(join(directory, MARKER), "utf8"));
    return marker.owner === "repo-harness"
      && marker.source === "herdr --skill"
      && marker.sha256 === digest(readFileSync(join(directory, "SKILL.md"), "utf8"))
      && readdirSync(directory).sort().join(",") === `${MARKER},SKILL.md`;
  } catch {
    return false;
  }
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Project the release-matched skill shipped by the required Herdr binary. */
export function configureRequiredHerdrSkill(
  target: InstallTargetSpec,
  env: NodeJS.ProcessEnv = process.env,
  removeBackup: BackupCleanup = (path) => rmSync(path, { recursive: true, force: true }),
): Step {
  const result = spawnSync("herdr", ["--skill"], { env, encoding: "utf8", timeout: 5_000 });
  if (result.status !== 0 || !result.stdout?.startsWith("---\nname: herdr\n") || !result.stdout.includes("HERDR_ENV")) {
    return { step: STEP, status: "failed", detail: "herdr --skill did not return the expected Herdr skill" };
  }
  const content = result.stdout;
  const home = env.HOME || homedir();
  const hosts = target === "both" ? ["claude", "codex"] : [target];
  const plans: Array<{ destination: string; staged: string; backup: string | null; changed: boolean; current: boolean }> = [];
  try {
    const canonicalHome = realpathSync(home);
    // Check every target before changing either host.
    for (const host of hosts) {
      const hostName = host === "codex" ? ".codex" : ".claude";
      const hostDir = join(home, hostName);
      const root = join(hostDir, "skills");
      const destination = join(root, "herdr");
      for (const [directory, expected] of [
        [hostDir, join(canonicalHome, hostName)],
        [root, join(canonicalHome, hostName, "skills")],
      ]) {
        if (pathEntryExists(directory) && (lstatSync(directory).isSymbolicLink()
          || !lstatSync(directory).isDirectory() || realpathSync(directory) !== expected)) {
          throw new Error(`refusing non-canonical host skill root: ${directory}`);
        }
      }
      let current = false;
      if (pathEntryExists(destination)) {
        if (!lstatSync(destination).isDirectory() || lstatSync(destination).isSymbolicLink()) {
          throw new Error(`refusing non-directory Herdr skill: ${destination}`);
        }
        const existingContent = readFileSync(join(destination, "SKILL.md"), "utf8");
        if (existingContent !== content && !ownedSkillIsIntact(destination)) {
          throw new Error(`refusing to replace unowned or changed Herdr skill: ${destination}`);
        }
        current = existingContent === content;
      }
      plans.push({ destination, staged: "", backup: null, changed: false, current });
    }
    for (const plan of plans) {
      if (plan.current) continue;
      const root = join(plan.destination, "..");
      mkdirSync(root, { recursive: true });
      plan.staged = mkdtempSync(join(root, ".herdr-stage-"));
      writeFileSync(join(plan.staged, "SKILL.md"), content);
      writeFileSync(join(plan.staged, MARKER), `${JSON.stringify({ owner: "repo-harness", source: "herdr --skill", sha256: digest(content) })}\n`);
    }
    for (const plan of plans) {
      if (plan.current) continue;
      if (pathEntryExists(plan.destination)) {
        plan.backup = `${plan.staged}-backup`;
        renameSync(plan.destination, plan.backup);
      }
      renameSync(plan.staged, plan.destination);
      plan.staged = "";
      plan.changed = true;
    }
  } catch (error) {
    for (const plan of plans.reverse()) {
      if (plan.changed) rmSync(plan.destination, { recursive: true, force: true });
      if (plan.backup && pathEntryExists(plan.backup)) renameSync(plan.backup, plan.destination);
    }
    return { step: STEP, status: "failed", detail: error instanceof Error ? error.message : String(error) };
  } finally {
    for (const plan of plans) if (plan.staged) rmSync(plan.staged, { recursive: true, force: true });
  }
  const cleanupFailures: string[] = [];
  for (const plan of plans) {
    if (!plan.backup) continue;
    try { removeBackup(plan.backup); }
    catch (error) { cleanupFailures.push(`${plan.backup}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return {
    step: STEP,
    status: "ok",
    detail: `installed for ${hosts.join(", ")}; ${digest(content)}`
      + (cleanupFailures.length ? `; backup cleanup pending: ${cleanupFailures.join("; ")}` : ""),
  };
}
