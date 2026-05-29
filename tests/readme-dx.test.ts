import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function section(doc: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = doc.match(new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?:\\n## |$)`));
  return match?.[1] ?? "";
}

describe("README DX contract", () => {
  test("front-loads a single first-run path and hook authority guidance", () => {
    const readme = read("README.md");
    const firstFive = section(readme, "First 5 Minutes");
    const hookAuthority = section(readme, "Hook Authority Map");
    const maintainer = section(readme, "Maintainer Reference");

    expect(readme.indexOf("## First 5 Minutes")).toBeLessThan(readme.indexOf("## Current Model"));
    expect(firstFive).toContain("npx -y repo-harness init");
    expect(firstFive).toContain("npx -y repo-harness init --dry-run");
    expect(firstFive.match(/npx -y repo-harness init --dry-run/g)?.length).toBe(1);
    expect(firstFive).not.toContain("bun scripts/assemble-template.ts");
    expect(firstFive).toContain("=== Migration Report ===");
    expect(firstFive).toContain("Project hooks synced from:");
    expect(firstFive).toContain("Host hook config target:");
    expect(firstFive).toContain("Host hook adapters are user-level:");
    expect(hookAuthority).toContain(".ai/hooks/");
    expect(hookAuthority).toContain("repo-harness-hook");
    expect(hookAuthority).toContain("route registry");
    expect(maintainer).toContain("bun scripts/assemble-template.ts --plan C --name \"MyProject\"");
  });

  test("links to the hook operations reference and parity contract", () => {
    const readme = read("README.md");
    const hookOps = read("docs/reference-configs/hook-operations.md");

    expect(readme).toContain("docs/reference-configs/hook-operations.md");
    expect(readme).toContain("Generated vs Self-Hosted Hook Parity");
    expect(hookOps).toContain("## Hook Authority Map");
    expect(hookOps).toContain("## Hook Failure Playbook");
    expect(hookOps).toContain("PlanStatusGuard");
    expect(hookOps).not.toContain("TodoGuard");
    expect(hookOps).toContain("ContractGuard");
    expect(hookOps).toContain("WorktreeGuard");
    expect(hookOps).toContain(".ai/harness/failures/latest.jsonl");
    expect(hookOps).toContain(".claude/.trace.jsonl");
    expect(hookOps).toContain("self-host");
    expect(hookOps).toContain("generated");
  });

  test("dry-run keeps the migration report onboarding signals", () => {
    const res = spawnSync("bash", ["scripts/migrate-project-template.sh", "--repo", ".", "--dry-run"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("=== Migration Report ===");
    expect(res.stdout).toContain("Project hooks synced from:");
    expect(res.stdout).toContain("Workflow migration:");
    expect(res.stdout).toContain("Helper scripts:");
    expect(res.stdout).toContain("Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json");
    expect(res.stdout).toContain("Host hook adapters are user-level:");
  }, 15000);
});
