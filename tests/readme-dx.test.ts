import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const PACKAGE_VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version as string;
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
  if (file === "README.md" && /Claude\/Codex paths \(`~\/\.claude\/skills\/repo-harness`/.test(line)) {
    return true;
  }
  if (file === "README.zh-CN.md" && /~\/\.claude\/skills\/repo-harness/.test(line)) {
    return true;
  }
  return false;
}

describe("README DX contract", () => {
  test("front-loads a single first-run path and hook authority guidance", () => {
    const readme = read("README.md");
    const getStarted = section(readme, "Get Started");
    const hooksSection = section(readme, "Hooks");
    const maintainer = section(readme, "Maintainer Reference");

    expect(readme.indexOf("## Get Started")).toBeLessThan(readme.indexOf("## MCP Connector"));
    expect(readme).toContain("docs/images/repo-harness-hook-carrot.png");
    // Only the commands a first-run user copies are pinned here. Surrounding prose,
    // code-comment text, occurrence counts, and CLI stdout literals quoted back
    // through the README are not: they never caught a regression, they only forced
    // a same-commit test edit whenever the README was reworded.
    expect(getStarted).toContain("bunx repo-harness@latest install");
    expect(getStarted).toContain("bun add -g repo-harness");
    expect(getStarted).toContain("npx -y repo-harness@latest install");
    expect(getStarted).toContain("repo-harness install");
    expect(getStarted).toContain("repo-harness init --dry-run");
    // Kept as the negative half of a placement invariant: the template assembly
    // command belongs in Maintainer Reference (asserted below), not in the
    // first-run path.
    expect(getStarted).not.toContain("bun scripts/assemble-template.ts");
    expect(maintainer).toContain("assets/hooks/");
    expect(maintainer).toContain("bun run sync:hooks");
    expect(hooksSection).toContain("repo-harness-hook");
    expect(hooksSection).toContain("route registry");
    // HRD-04 retired minimal-change-context.sh (folded into the in-process
    // session-context builder). HRD-05 retired post-edit-guard.sh and
    // minimal-change-observer.sh (folded into the in-process
    // mutation-observed journal handler). The 14-section rewrite folded the
    // former "Hook Authority Map" section into "Hooks" and "Maintainer
    // Reference"; the handler filenames are the placement invariant that
    // replaces it.
    expect(hooksSection).toContain("session-context.ts");
    expect(hooksSection).toContain("mutation-guard.ts");
    expect(hooksSection).toContain("mutation-observed.ts");
    expect(hooksSection).toContain("stop-handler.ts");
    expect(readme).not.toContain("finalize-handoff.sh");
    expect(readme).not.toContain("session-start-context.sh");
    expect(readme).not.toContain("post-edit-guard.sh");
    expect(readme).not.toContain("minimal-change-observer.sh");
    expect(maintainer).toContain("bun scripts/assemble-template.ts --plan C --name \"MyProject\"");
  });

  test("links to the hook operations reference and projection contract", () => {
    const readme = read("README.md");
    const hookOps = read("docs/reference-configs/hook-operations.md");

    expect(readme).toContain("docs/reference-configs/hook-operations.md");
    // SSD-xx: the README's own "Generated vs Self-Hosted Hook Projection"
    // heading retired in the 14-section rewrite; the projection contract now
    // lives solely in hook-operations.md, so pin its phrasing there instead
    // of duplicating it back into the README.
    expect(hookOps).toContain("generated operator-helper projection");
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
    const maintainer = section(readme, "Maintainer Reference");
    const releaseDoc = read("docs/reference-configs/release-deploy.md");
    const evalArchitecture = read("docs/architecture/modules/verification/evals-checks.md");

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

    // SSD-xx: the README's dedicated "## Verification" section folded into
    // Maintainer Reference; the authoritative non-dry-run eval-evidence
    // requirement now lives solely in evals-checks.md (asserted above)
    // instead of a copy-pasted eval command example in the README.
    expect(maintainer).toContain("bun run check:ci");
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
    const externalTooling = read("docs/reference-configs/external-tooling.md");

    expect(spec).toContain("## Product Outcome");
    expect(spec).toContain("## Core Invariants");
    expect(spec).toContain("## Human Review Expectations");
    expect(spec).toContain("## Acceptance Scenarios");
    // SSD-xx: Human Review Path and Agent Tracking Path merged into one
    // Reviewing Work section; the agent-reads-first/human-reviews-first
    // table header is the structural invariant that survives the merge.
    expect(readme).toContain("## Reviewing Work");
    expect(readme).toContain("Agent reads first");
    expect(readme).toContain("Human reviews first");
    expect(zhReadme).toContain("## 审查产出");
    expect(flow).toContain("Agent reads first");
    expect(flow).toContain("Human reviews first");
    expect(readme).toContain("external verification manifests");
    expect(readme).toContain("manual convention today");
    expect(readme).toMatch(/not an automatic\s+`repo-harness check` gate/);
    expect(zhReadme).toContain("external verification manifest");
    expect(zhReadme).toContain("人工约定");
    expect(zhReadme).toContain("`repo-harness check` 会自动执行的 gate");
    expect(externalTooling).toContain("## External Verification Evidence");
    expect(externalTooling).toContain("convention only");
    expect(externalTooling).toContain("does not automatically discover");
    expect(externalTooling).toContain("not yet an automatic `repo-harness check` gate");
    expect(externalTooling).toContain(".ai/harness/runs/external/<task-id>/<run-id>/manifest.json");
    expect(externalTooling).toContain("relative to the manifest directory");
    expect(externalTooling).toContain("\"side_effects\": \"writes_ignored_runtime_state\"");
  });

  test("localized READMEs track the current English release surface", () => {
    const languageSwitcher =
      "[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Español](README.es.md)";

    for (const file of LOCALIZED_READMES) {
      const localized = read(file);

      // SSD-06: the GPT Pro hero image reference is dropped from every
      // README (the image file itself stays on disk, undeleted, per the
      // plan's explicit "update or drop the image reference" choice); the
      // diagram depicted the retired repo-harness-gptpro-branded flow.
      expect(localized).toContain(PACKAGE_VERSION);
      expect(localized).toContain(`repo-harness@${PACKAGE_VERSION}`);
      expect(localized).toContain(`repo-harness@${PACKAGE_VERSION}+template@${PACKAGE_VERSION}`);
      expect(localized).toContain("repo-harness update");
      expect(localized).toContain("repo-harness init");
      expect(localized).toContain("repo-harness docs list");
      expect(localized).toContain("SessionStart.default");
      expect(localized).toContain("PostToolUse.always");
      // SSD-xx: "Generated vs Self-Hosted Hook Projection", "Package Manager
      // Defaults", "Runtime Profiles", and the benchmark:skills eval command
      // example all moved into docs/reference-configs (harness-overview.md,
      // evals-checks.md) per the approved README slim-down; they are no
      // longer README content to pin. Pin the install commands and the
      // five-language switcher instead, since every locale must keep them.
      expect(localized).toContain(languageSwitcher);
      expect(localized).toContain(
        "curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh",
      );
      expect(localized).toContain("bunx repo-harness@latest install");
      expect(localized).not.toContain("0.5.0");
      expect(localized).not.toContain("0.2.1");
      expect(localized.toLowerCase()).not.toContain("gstack");
    }
  });

  test("dry-run keeps the canonical adoption-plan onboarding signal", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-harness-readme-dx-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "readme-dx-fixture", private: true }));
      const res = spawnSync("bun", ["src/cli/index.ts", "init", "--repo", repo, "--dry-run"], {
        cwd: ROOT,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain(`[init-plan] repo: ${repo}`);
      expect(res.stdout).toContain("[init-plan] operations:");
      expect(res.stdout).toContain("writeFile:");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
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
