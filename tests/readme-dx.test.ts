import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const RUNTIME_SCAN_FILES = [
  "SKILL.md",
  "README.md",
  "README.zh-CN.md",
  "docs/reference-configs/external-tooling.md",
];
const LOCALIZED_READMES = ["README.zh-CN.md", "README.ja.md", "README.es.md", "README.fr.md"];
const RUNTIME_RED_FLAGS = [
  /在 Claude Code/,
  /Claude Code skill/,
  /Claude Code 用户/,
  /Cursor only/,
  /Codex 中/,
  /^\[!\[Claude Code/,
  /~\/\.claude\/skills\/[a-z]/,
  /\/plugin install\b/,
];

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function section(doc: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = doc.match(new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?:\\n## |$)`));
  return match?.[1] ?? "";
}

function isAllowedRuntimeReference(file: string, line: string): boolean {
  if (/Claude skill alias/.test(line)) return true;
  if (file === "docs/reference-configs/external-tooling.md" && /~\/\.claude\/skills\/gstack/.test(line)) {
    return true;
  }
  return false;
}

describe("README DX contract", () => {
  test("front-loads a single first-run path and hook authority guidance", () => {
    const readme = read("README.md");
    const firstFive = section(readme, "First 5 Minutes");
    const hookAuthority = section(readme, "Hook Authority Map");
    const maintainer = section(readme, "Maintainer Reference");

    expect(readme.indexOf("## First 5 Minutes")).toBeLessThan(readme.indexOf("## Current Model"));
    expect(firstFive).toContain("npx -y repo-harness install");
    expect(firstFive).toContain("npx -y repo-harness adopt --dry-run");
    expect(firstFive).toContain("npx -y repo-harness adopt");
    expect(firstFive).toContain("first-run global bootstrap path");
    expect(firstFive.match(/npx -y repo-harness adopt --dry-run/g)?.length).toBe(2);
    expect(firstFive).not.toContain("npx -y repo-harness install --dry-run");
    expect(firstFive).not.toContain("npx -y repo-harness init --dry-run");
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

  test("release and verification docs require authoritative skill eval evidence", () => {
    const readme = read("README.md");
    const verification = section(readme, "Verification");
    const releaseDoc = read("docs/reference-configs/release-deploy.md");
    const releaseAsset = read("assets/reference-configs/release-deploy.md");
    const evalArchitecture = read("docs/architecture/modules/verification/evals-checks.md");

    expect(releaseAsset).toBe(releaseDoc);
    expect(releaseDoc).toContain("full_test_count");
    expect(releaseDoc).toContain("dry_run_ratio");
    expect(releaseDoc).toContain("grader_pass_rate");
    expect(releaseDoc).toContain("effectiveness_authority");
    expect(releaseDoc).toContain("missing eval evidence");
    expect(releaseDoc).toMatch(/non-authoritative\s+skill eval evidence/);

    expect(evalArchitecture).toContain("non-dry-run `bun run benchmark:skills --eval <slug>`");
    expect(evalArchitecture).toContain("Non-authoritative smoke");
    expect(evalArchitecture).toMatch(/not\s+skill-effectiveness evidence/);
    expect(evalArchitecture).toContain("full_test_count");
    expect(evalArchitecture).toContain("effectiveness_authority");

    expect(verification).toContain("bun run benchmark:skills --eval route-workflow-check");
    expect(verification).not.toContain("bun run benchmark:skills --dry-run");
  });

  test("documents explicit Codex GitHub contributor attribution", () => {
    const readme = read("README.md");
    const zhReadme = read("README.zh-CN.md");

    expect(readme).toContain("Co-authored-by: codex <codex@openai.com>");
    expect(readme).toContain("explicit commit trailer");
    expect(readme).toContain("not hidden hook automation");
    expect(zhReadme).toContain("Co-authored-by: codex <codex@openai.com>");
    expect(zhReadme).toContain("逐 commit 显式添加");
  });

  test("documents human review and agent tracking paths", () => {
    const readme = read("README.md");
    const zhReadme = read("README.zh-CN.md");
    const spec = read("docs/spec.md");
    const flow = read("docs/reference-configs/agentic-development-flow.md");

    expect(spec).toContain("## Product Outcome");
    expect(spec).toContain("## Core Invariants");
    expect(spec).toContain("## Human Review Expectations");
    expect(spec).toContain("## Acceptance Scenarios");
    expect(readme).toContain("## Human Review Path");
    expect(readme).toContain("## Agent Tracking Path");
    expect(readme).toContain("Agent reads first");
    expect(readme).toContain("Human reviews first");
    expect(zhReadme).toContain("## Human Review Path");
    expect(zhReadme).toContain("## Agent Tracking Path");
    expect(flow).toContain("Agent reads first");
    expect(flow).toContain("Human reviews first");
  });

  test("localized READMEs track the current English release surface", () => {
    for (const file of LOCALIZED_READMES) {
      const localized = read(file);
      const expectedHeroImage =
        file === "README.zh-CN.md"
          ? "docs/images/repo-harness-gptpro-cn.png"
          : "docs/images/repo-harness-gptpro.png";

      expect(localized).toContain(expectedHeroImage);
      expect(localized).toContain("0.7.1");
      expect(localized).toContain("repo-harness@0.7.1");
      expect(localized).toContain("repo-harness@0.7.1+template@0.7.1");
      expect(localized).toContain("repo-harness update");
      expect(localized).toContain("repo-harness adopt");
      expect(localized).toContain("repo-harness docs list");
      expect(localized).toContain("SessionStart.default");
      expect(localized).toContain("PostToolUse.always");
      expect(localized).toContain("Generated vs Self-Hosted Hook Parity");
      expect(localized).toContain("Package Manager Defaults");
      expect(localized).toContain("Runtime Profiles");
      expect(localized).toContain("bun run benchmark:skills --eval route-workflow-check");
      expect(localized).not.toContain("0.5.0");
      expect(localized).not.toContain("0.2.1");
      expect(localized).not.toContain("bun run benchmark:skills --dry-run");
    }
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
    expect(res.stdout).toContain("Helper runtime:");
    expect(res.stdout).toContain("package-dispatched through repo-harness run with scripts/* compatibility wrappers");
    expect(res.stdout).toContain("Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json");
    expect(res.stdout).toContain("Host hook adapters are user-level:");
  }, 15000);

  test("runtime red-flag scan uses an explicit allowlist for install examples and legacy aliases", () => {
    const hits: string[] = [];

    for (const file of RUNTIME_SCAN_FILES) {
      read(file).split("\n").forEach((line, index) => {
        const redFlag = RUNTIME_RED_FLAGS.some((pattern) => pattern.test(line));
        if (redFlag && !isAllowedRuntimeReference(file, line)) {
          hits.push(`${file}:${index + 1}:${line}`);
        }
      });
    }

    expect(hits).toEqual([]);
  });
});
