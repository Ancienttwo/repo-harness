// One owner for the worktree-leak attribution of a CI run tree.
// A run that sees a new /tmp/*-wt-* path cannot tell its own leak from a path
// that a concurrent test file made and will remove. Every run in the tree
// records the path here. Only the outermost run reads the reports, after its
// own children have ended: a path that is still there then leaked. The guard
// reports. It never removes a worktree.
import { appendFileSync, lstatSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export function recordSuspect(dir, worktreePath, owner) {
  appendFileSync(join(dir, process.pid + ".suspects"), worktreePath + "\t" + owner + "\n");
}

// Returns the recorded paths that still exist and clears the reports.
export function survivingSuspects(dir) {
  const survivors = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".suspects")) continue;
    const report = join(dir, entry);
    for (const line of readFileSync(report, "utf8").split("\n")) {
      if (!line) continue;
      const [path, owner] = line.split("\t");
      try { lstatSync(path); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      survivors.push({ path, owner });
    }
    rmSync(report);
  }
  return survivors;
}

export const survivorMessage = ({ path, owner }) =>
  "[ci] surviving new worktree path outside disposable roots (current uid; created during test): " + path + " (" + owner + ")";
