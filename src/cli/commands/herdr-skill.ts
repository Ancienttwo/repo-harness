import { renderHerdrSkill } from "./herdr-skill-render.mjs";
import { sha256Prefixed } from "../../core/evidence/sha256";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { hostSkillRoot, stagedSkillRoot, SKILL_HOSTS, type SkillHost } from "../../effects/host-skill-roots";
import type { InstallTargetSpec } from "./install";

const STEP = "configure required Herdr skill";
const STALE_STAGE_AGE_MS = 10 * 60 * 1_000;
const MARKER = ".repo-harness-owner.json";
type Step = { step: string; status: "ok" | "failed"; detail: string };
type BackupCleanup = (path: string) => void;

function ownedSkillIsIntact(directory: string): boolean {
  try {
    const marker = JSON.parse(readFileSync(join(directory, MARKER), "utf8"));
    return marker.owner === "repo-harness"
      && marker.sha256 === sha256Prefixed(readFileSync(join(directory, "SKILL.md"), "utf8"))
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

/** Remove only old, directly contained staging entries with known contents. */
function cleanupStaleStages(root: string, remove: BackupCleanup): string[] {
  const notes: string[] = [];
  if (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory()
    || realpathSync(root) !== root) throw new Error(`non-canonical skill root: ${root}`);
  try {
    const cutoff = Date.now() - STALE_STAGE_AGE_MS;
    for (const name of readdirSync(root)) {
      if (!/^\.herdr-stage-[A-Za-z0-9]{6}(-backup)?$/.test(name)) continue;
      const path = join(root, name);
      try {
        const stat = lstatSync(path);
        let reason: string | null = null;
        if (!stat.isDirectory() || stat.isSymbolicLink()) reason = "not a real directory";
        else if (!(stat.mtimeMs < cutoff)) reason = "recent stage";
        else {
          const entries = readdirSync(path);
          if (entries.some(entry => !lstatSync(join(path, entry)).isFile())) reason = "non-regular child";
          else if (name.endsWith("-backup")) {
            if (!ownedSkillIsIntact(path)) reason = "backup ownership not proved";
          } else if (!(entries.length === 0
            || (entries.length === 1 && entries[0] === "SKILL.md"
              && readFileSync(join(path, "SKILL.md"), "utf8").startsWith("---\nname: herdr\n"))
            || ownedSkillIsIntact(path))) reason = "stage contents not proved";
        }
        if (reason) notes.push(`stage cleanup skipped: ${path}: ${reason}`);
        else {
          remove(path);
          notes.push(`stage cleanup removed: ${path}`);
        }
      } catch (error) {
        notes.push(`stage cleanup pending: ${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    notes.push(`stage cleanup pending: ${root}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return notes;
}

/**
 * Project the hc manual with the managed caller-context policy. With
 * `includePi` false a `both` target writes the Claude and Codex copies only.
 */
export function configureRequiredHerdrSkill(
  target: InstallTargetSpec,
  env: NodeJS.ProcessEnv = process.env,
  removeBackup: BackupCleanup = (path) => rmSync(path, { recursive: true, force: true }),
  includePi = true,
): Step {
  // `hc --skill` prints its manual and starts no hc core.
  const result = spawnSync("hc", ["--skill"], { env, encoding: "utf8", timeout: 5_000 });
  if (result.status !== 0) {
    const why = result.error?.message
      ?? (result.stderr?.trim() || (result.signal ? `signal ${result.signal}` : `exit ${result.status}`));
    return { step: STEP, status: "failed", detail: `hc --skill failed: ${why}` };
  }
  let content: string;
  try { content = renderHerdrSkill(result.stdout); }
  catch (error) {
    return { step: STEP, status: "failed", detail: error instanceof Error ? error.message : String(error) };
  }
  const home = env.HOME || homedir();
  const hosts: readonly SkillHost[] = target === "both" ? SKILL_HOSTS.filter(host => includePi || host !== "pi") : [target];
  const plans: Array<{ root: string; destination: string; staged: string; backup: string | null; changed: boolean; current: boolean }> = [];
  try {
    const canonicalHome = realpathSync(home);
    const roots = hosts.map(host => [hostSkillRoot(home, host, env), hostSkillRoot(canonicalHome, host, env)]);
    // Codex can discover this shared copy as well as its host-specific copy.
    if (hosts.includes("codex") && pathEntryExists(join(stagedSkillRoot(home), "herdr"))) {
      roots.push([stagedSkillRoot(home), stagedSkillRoot(canonicalHome)]);
    }
    // Preflight all discoverable copies before writing any of them.
    for (const [root, canonicalRoot] of roots) {
      if (!isAbsolute(root)) throw new Error(`refusing non-canonical host skill root: ${root}`);
      const destination = join(root, "herdr");
      for (const [directory, expected] of [
        [dirname(root), dirname(canonicalRoot)],
        [root, canonicalRoot],
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
          throw new Error(`refusing to replace unowned or changed Herdr skill: ${destination}; `
            + `to keep it and install a fresh owned copy, move it out of ${root} `
            + `(for example: mv "${destination}" "${join(dirname(root), "herdr-skill.moved")}"), `
            + "then run `rh update` again");
        }
        // A copy equal to the render is the managed projection. Rewrite its stale
        // marker now; otherwise the next render change refuses to replace it.
        // Replacement removes the old directory, so any other or non-file entry
        // keeps the copy untouched. The entry check runs first: a marker read
        // blocks when the marker is a FIFO.
        current = existingContent === content && (readdirSync(destination).some(name =>
          (name !== "SKILL.md" && name !== MARKER) || !lstatSync(join(destination, name)).isFile())
          || ownedSkillIsIntact(destination));
      }
      plans.push({ root: canonicalRoot, destination, staged: "", backup: null, changed: false, current });
    }
    for (const plan of plans) {
      if (plan.current) continue;
      const root = join(plan.destination, "..");
      mkdirSync(root, { recursive: true });
      plan.staged = mkdtempSync(join(root, ".herdr-stage-"));
      writeFileSync(join(plan.staged, "SKILL.md"), content);
      writeFileSync(join(plan.staged, MARKER), `${JSON.stringify({ owner: "repo-harness", sha256: sha256Prefixed(content) })}\n`);
    }
    for (const plan of plans) {
      if (plan.current) continue;
      if (pathEntryExists(plan.destination)) {
        plan.backup = `${plan.staged}-backup`;
        // Rename preserves mtime. Refresh it before exposing a concurrent run's backup.
        const now = new Date();
        utimesSync(plan.destination, now, now);
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
  let stageCleanup: string[];
  try { stageCleanup = plans.flatMap(plan => cleanupStaleStages(plan.root, removeBackup)); }
  catch (error) { return { step: STEP, status: 'failed', detail: (error as Error).message }; }
  return {
    step: STEP,
    status: "ok",
    detail: `installed for ${hosts.join(", ")}; ${sha256Prefixed(content)}`
      + (cleanupFailures.length ? `; backup cleanup pending: ${cleanupFailures.join("; ")}` : "")
      + (stageCleanup.length ? `; ${stageCleanup.join("; ")}` : ""),
  };
}
