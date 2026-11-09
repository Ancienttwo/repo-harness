import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Bootstrap Script Contracts", () => {
  test("root SKILL stays a compact five-action router", () => {
    const skill = read("SKILL.md");
    const body = skill.replace(/^---\n[\s\S]*?\n---\n/u, "");
    // The root SKILL.md is the router: every host loads it into context on every
    // session, before any action is chosen. The 2048-byte ceiling is a standing
    // budget on that always-resident cost, not an arbitrary style limit — content
    // that grows past it belongs in a reference file the router points at.
    expect(Buffer.byteLength(body, "utf-8")).toBeLessThanOrEqual(2048);
    expect(skill.split("\n").length).toBeLessThanOrEqual(80);
  });

  test("router exposes only the five default semantic actions", () => {
    const skill = read("SKILL.md");
    for (const [index, action] of ["setup", "plan", "execute", "verify", "handoff"].entries()) {
      expect(skill).toContain(`${index + 1}. **${action}**`);
    }
    expect(skill).not.toContain("Core Plans (A-F)");
    expect(skill).not.toContain("Custom Presets (G-K)");
    expect(skill).not.toContain("## Hook");
  });

  test("Codex agent metadata should exist for user-level installation", () => {
    const metadata = read("agents/openai.yaml");
    expect(metadata).toContain("interface:");
    expect(metadata).toContain('display_name: "repo-harness"');
    expect(metadata).toContain("short_description:");
    expect(metadata).toContain("default_prompt:");
  });

  test("Codex fleet subagent TOML definitions should exist with required keys", () => {
    const packageManifest = JSON.parse(read("package.json"));
    expect(packageManifest.files).toContain("agents/");
    const specs: Array<{ name: string; model: string; effort: string; sandboxMode?: string }> = [
      { name: "explorer", model: "gpt-6-luna", effort: "high", sandboxMode: "read-only" },
      { name: "deep-reasoner", model: "gpt-6-astra", effort: "high", sandboxMode: "read-only" },
      { name: "fast-worker", model: "gpt-6.1-sol", effort: "medium", sandboxMode: "workspace-write" },
      { name: "deep-worker", model: "gpt-6.1-sol", effort: "high", sandboxMode: "workspace-write" },
      { name: "gatekeeper", model: "gpt-6-astra", effort: "medium", sandboxMode: "read-only" },
      { name: "root-cause-prover", model: "gpt-6-astra", effort: "high", sandboxMode: "workspace-write" },
      { name: "harness-evaluator", model: "gpt-6-astra", effort: "medium", sandboxMode: "workspace-write" },
    ];

    for (const spec of specs) {
      const path = `.codex/agents/${spec.name}.toml`;
      expect(existsSync(join(ROOT, path))).toBe(true);

      const toml = read(path);
      expect(toml).toContain(`name = "${spec.name}"`);
      expect(toml).toContain("description = ");
      expect(toml).toContain(`model = "${spec.model}"`);
      expect(toml).toContain(`model_reasoning_effort = "${spec.effort}"`);
      expect(toml).not.toContain("Opus 4.8 at max effort");
      expect(toml).not.toContain("Sonnet 5 at max effort");
      expect(toml).toContain("developer_instructions = '''");
      // Persona owns role identity only. The execution boundary is injected once
      // by the runtime task packet (SubagentStart context), contract- and
      // writability-aware, so a read-only persona is never told to implement.
      expect(toml).not.toContain(
        "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief."
      );
      expect(read(`agents/fleet/${spec.name}.md`)).toContain(`name: ${spec.name}`);
      if (spec.sandboxMode) {
        expect(toml).toContain(`sandbox_mode = "${spec.sandboxMode}"`);
      }
    }

    expect(existsSync(join(ROOT, "agents/fleet/explore.md"))).toBe(false);
    const rootCause = read("agents/fleet/root-cause-prover.md");
    for (const field of ["root_cause", "repro", "regression_guard"]) {
      expect(rootCause).toContain(field);
    }
    expect(rootCause).toContain("DIAGNOSIS: CONFIRMED");
    expect(rootCause).toContain("Never edit production source");
    expect(rootCause).toContain("pipeline is forbidden");
    expect(rootCause).toContain("Record command, exit code and full failure output");
    expect(rootCause).not.toContain("PRE_FIX_EXIT=");

    const evaluator = read("agents/fleet/harness-evaluator.md");
    expect(evaluator).toContain("EVAL: PASS");
    expect(evaluator).toContain("fail closed");
    expect(evaluator).toContain("disposable clone/worktree");
    expect(evaluator).toContain("--run-adoption-profile");
    expect(evaluator).toContain("Workspace-write is disposable-only");
    expect(evaluator).toContain("debug-ground-truth profile is also retired");
    expect(evaluator).not.toContain("bun run benchmark:debug");

    const routing = read("docs/reference-configs/agentic-development-flow.md");
    expect(routing).toContain("Use independent gatekeeper/cross-model review for large changes, security/permissions or model uncertainty");
    expect(routing).toContain("Ordinary work has no plan/contract/review/notes");
  });

  test("repo root should include routing docs and one typed hook implementation", () => {
    expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(ROOT, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(ROOT, ".claude/settings.json"))).toBe(false);
    expect(existsSync(join(ROOT, ".codex/hooks.json"))).toBe(false);
    expect(existsSync(join(ROOT, "src/cli/hook-entry.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/cli/hook/runtime.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/cli/hook/hook-input.ts"))).toBe(true);

    const claude = read("CLAUDE.md");
    const agents = read("AGENTS.md");

    for (const file of ["CLAUDE.md", "AGENTS.md"]) {
      expect(lstatSync(join(ROOT, file)).isFile()).toBe(true);
      expect(read(file)).not.toMatch(/^@(?:AGENTS|CLAUDE)\.md\s*$/m);
      for (const section of ["Workflow", "Code Optimization Principles", "Testing", "Writing", "UI"]) {
        expect(read(file)).toContain(`## ${section}\n`);
      }
    }
    // Both standalone hosts must share all rules before host-specific guidance.
    const sharedRules = (content: string) => content.split(/\n## (?:Claude Code|Codex)\n/)[0]!;
    expect(sharedRules(claude)).toBe(sharedRules(agents));
    expect(agents).toContain('current task explicitly authorizes main publication');
    expect(claude).toContain("## Claude Code");
    expect(claude).toContain("~/.claude/settings.json");
    expect(agents).toContain("## Codex");
    expect(agents).toContain("~/.codex/hooks.json");
    expect(agents).toContain("~/.codex/skills");
  });

  test("repo package should expose workflow verification scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    const cliEntry = read("src/cli/index.ts");
    expect(pkg.name).toBe("repo-harness");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin["repo-harness"]).toBe("src/cli/index.ts");
    expect(pkg.bin["repo-harness-hook"]).toBe("dist/hook-entry.js");
    expect(pkg.files).toContain("assets/");
    expect(pkg.files).not.toContain("docs/reference-configs/");
    expect(cliEntry).toContain("CLI_VERSION");
    expect(cliEntry).toContain("buildDocsCommand");
    expect(cliEntry).not.toMatch(/\\.version\\(['\"][0-9]+\\.[0-9]+\\.[0-9]+['\"]\\)/);
    expect(pkg.scripts["check:ci"]).toBe("bash scripts/check-ci.sh");
    expect(pkg.scripts["check:brain"]).toBe("repo-harness brain check");
    expect(pkg.scripts["check:task-sync"]).toBeUndefined();
    expect(pkg.scripts["check:deploy-sql"]).toBe("repo-harness run check-deploy-sql-order");
    expect(pkg.scripts["check:architecture-sync"]).toBeUndefined();
    expect(pkg.scripts["check:task-workflow"]).toBeUndefined();
    expect(pkg.scripts["check:context-files"]).toBe("repo-harness run check-context-files");
    expect(pkg.scripts["sync:brain"]).toBe("repo-harness brain sync");
  });

  test("ci gate verifies the candidate without creating routine handoff artifacts", () => {
    const ciGate = read("scripts/check-ci.sh");
    const bunfig = read("bunfig.toml");
    const prepare = 'REPO_HARNESS_SKIP_RESUME_REFRESH=1 bash scripts/prepare-handoff.sh "ci gate"';
    const resume = 'bash scripts/codex-handoff-resume.sh --cwd . --reason "ci gate"';

    expect(bunfig).toContain("maxConcurrency = 4");
    expect(ciGate).not.toContain(prepare);
    expect(ciGate).not.toContain(resume);
    expect(ciGate).toContain("bun run check:type");
    expect(ciGate).toContain("run_bun_tests");
  });

  test("ci workflow should run MCP path matrix across hosted operating systems", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("mcp-path-matrix:");
    expect(workflow).toContain("MCP path matrix (${{ matrix.os }})");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("tests/cli/mcp-workspaces.test.ts");
    expect(workflow).toContain("tests/cli/mcp-reader-tools.test.ts");
    expect(workflow).toContain("tests/cli/mcp-policy.test.ts");
    expect(workflow).toContain("tests/cli/mcp-http.test.ts");
    expect(workflow).toContain("tests/cli/mcp-oauth.test.ts");
    expect(workflow).toContain("tests/cli/mcp-stdio.test.ts");
  });

  test("release gate should delegate owned checks to the ci gate", () => {
    const releaseGate = read("scripts/check-npm-release.sh");
    const ciGate = read("scripts/check-ci.sh");
    const pkg = JSON.parse(read("package.json"));
    expect(releaseGate).toContain('npm view "${name}@${PACKAGE_VERSION}"');
    expect(releaseGate).toContain("bash scripts/check-ci.sh");
    expect(releaseGate.indexOf("bash scripts/check-ci.sh")).toBeGreaterThan(
      releaseGate.indexOf('npm view "${name}@${PACKAGE_VERSION}"')
    );
    for (const name of ["PACKAGE_NAME", "CONSOLE_NAME"]) {
      expect(releaseGate.indexOf(`check_unpublished "$${name}"`)).toBeGreaterThan(-1);
      expect(releaseGate.indexOf("bash scripts/check-ci.sh release")).toBeGreaterThan(
        releaseGate.indexOf(`check_unpublished "$${name}"`)
      );
    }
    expect(ciGate).toContain("bash scripts/check-tarball-install-smoke.sh");
    expect(pkg.scripts["check:release-published"]).toBe("bash scripts/check-release-published.sh");
    expect(pkg.scripts["smoke:tarball-install"]).toBe("bash scripts/check-tarball-install-smoke.sh");
  });

  test("two-package release gates enforce publication order and registry evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-gate-"));
    try {
      for (const file of ["scripts/check-npm-release.sh", "scripts/check-release-published.sh", "package.json", "packages/operator-web/package.json", "src/core/skill-surface/plugin-manifest.ts"]) {
        mkdirSync(join(dir, file, ".."), { recursive: true });
        copyFileSync(join(ROOT, file), join(dir, file));
      }
      const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
      mkdirSync(join(dir, "bin"));
      const bun = Bun.which("bun")!;
      writeFileSync(join(dir, "bin/bun"), `#!/bin/bash\nif [[ "\${1:-}" == run && "\${2:-}" == check:helpers ]] || [[ "\${1:-}" == scripts/runtime-evidence-receipt.ts || "\${1:-}" == scripts/check-skill-version.ts ]]; then exit 0; fi\nexec "${bun}" "$@"\n`, { mode: 0o755 });
      writeFileSync(join(dir, "bin/npm"), `#!/bin/bash\necho "$*" >> "$CALLS"\nif [[ "$1" == view && "$2" == *@* ]]; then\n  if [[ "$PUBLISHED" == "$2" || "$PUBLISHED" == both ]]; then printf '{"version":"%s","dist.integrity":"sha512-x","dist.shasum":"abc","dist.tarball":"url"}\\n' "\${VIEW_VERSION:-${version}}"; exit 0; fi\n  echo 'E404 not in this registry' >&2; exit 1\nfi\nif [[ "$1" == view ]]; then printf '{"latest":"%s"}\\n' "\${LATEST:-${version}}"; exit 0; fi\nif [[ "$1" == pack ]]; then name="\${2%@*}"; echo "[{\\\"filename\\\":\\\"$name-${version}.tgz\\\",\\\"integrity\\\":\\\"\${INTEGRITY:-sha512-x}\\\",\\\"shasum\\\":\\\"abc\\\"}]"; exit 0; fi\nexit 0\n`, { mode: 0o755 });
      writeFileSync(join(dir, "bin/git"), "#!/bin/bash\n[[ \"$1\" == rev-parse && -n \"$NO_TAG\" ]] && exit 1\nexit 0\n", { mode: 0o755 });
      writeFileSync(join(dir, "scripts/check-ci.sh"), "#!/bin/bash\nexit 0\n");
      const calls = join(dir, "calls");
      const runGate = (script: string, args: string[], env: Record<string, string>) => spawnSync("bash", [join(dir, "scripts", script), ...args], {
        cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, CALLS: calls, ...env },
      });
      const core = { npm_package_name: "repo-harness" };
      writeFileSync(calls, "");
      expect(runGate("check-npm-release.sh", ["--prepublish"], { npm_package_name: "unknown" }).status).not.toBe(0);
      expect(readFileSync(calls, "utf8")).toBe("");
      const missing = runGate("check-npm-release.sh", ["--prepublish"], core);
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain(`repo-harness-operator-web@${version}`);
      expect(missing.stderr).toContain("E404 not in this registry");
      const consoleGate = runGate("check-npm-release.sh", ["--prepublish"], { npm_package_name: "repo-harness-operator-web", PUBLISHED: `repo-harness@${version}` });
      expect(consoleGate.status).toBe(0);
      expect(runGate("check-npm-release.sh", ["--prepublish"], { ...core, PUBLISHED: `repo-harness-operator-web@${version}` }).status).toBe(0);
      expect(runGate("check-npm-release.sh", [], {}).status).toBe(0);
      expect(runGate("check-npm-release.sh", [], { PUBLISHED: `repo-harness-operator-web@${version}` }).status).not.toBe(0);
      const verified = runGate("check-release-published.sh", [version], { PUBLISHED: "both" });
      expect(verified.status).toBe(0);
      expect(verified.stdout).toContain(`checking repo-harness-operator-web@${version}`);
      expect(verified.stdout).toContain(`checking repo-harness@${version}`);
      const beforeTag = runGate("check-release-published.sh", [version, "--before-tag"], { PUBLISHED: "both" });
      expect(beforeTag.status).toBe(0);
      expect(beforeTag.stdout).toContain("the tag is not checked");
      expect(runGate("check-release-published.sh", [version, "--before-tag"], { PUBLISHED: "both", NO_TAG: "1" }).status).toBe(0);
      expect(runGate("check-release-published.sh", [version], { PUBLISHED: "both", NO_TAG: "1" }).status).not.toBe(0);
      for (const [env, message] of [[{ VIEW_VERSION: "0.0.0" }, "npm view returned version 0.0.0"], [{ LATEST: "0.0.0" }, "latest dist-tag is 0.0.0"], [{ INTEGRITY: "wrong" }, "packed tarball integrity does not match"]] as const) {
        const mismatch = runGate("check-release-published.sh", [version, "--before-tag"], { PUBLISHED: "both", ...env });
        expect(mismatch.status).not.toBe(0);
        expect(mismatch.stderr).toContain(message);
      }
      const badIntegrity = runGate("check-release-published.sh", [version], { PUBLISHED: "both", INTEGRITY: "wrong" });
      expect(badIntegrity.status).not.toBe(0);
      expect(badIntegrity.stderr).toContain(`repo-harness-operator-web@${version}`);
      const manifest = join(dir, "packages/operator-web/package.json");
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      pkg.version = "0.0.0";
      writeFileSync(manifest, JSON.stringify(pkg));
      writeFileSync(calls, "");
      expect(runGate("check-npm-release.sh", ["--prepublish"], core).status).not.toBe(0);
      expect(readFileSync(calls, "utf8")).toBe("");
      const published = runGate("check-release-published.sh", ["0.26.5"], {});
      expect(published.status).not.toBe(0);
      expect(published.stdout).toContain("repo-harness-operator-web@0.26.5");
      expect(published.stderr).toContain("repo-harness-operator-web@0.26.5");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("release owner steps bind the command list and the tag readback to the release commit (#2006)", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-owner-"));
    // guard accepts only the worktree path that plan prints; the pid keeps parallel runs apart.
    const planVersion = `1.2.${process.pid}`;
    const worktree = `/tmp/repo-harness-wt-release-${planVersion}`;
    const otherVersion = `1.4.${process.pid}`;
    const otherWorktree = `/tmp/repo-harness-wt-release-${otherVersion}`;
    try {
      const repo = join(dir, "repo");
      const git = (...args: string[]) => {
        const result = spawnSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, HOME: dir, GIT_CONFIG_GLOBAL: "/dev/null" } });
        expect(result.status).toBe(0);
        return result.stdout.trim();
      };
      mkdirSync(join(repo, "scripts"), { recursive: true });
      mkdirSync(join(repo, "packages/operator-web"), { recursive: true });
      mkdirSync(join(repo, "docs"));
      copyFileSync(join(ROOT, "scripts/release-owner-steps.sh"), join(repo, "scripts/release-owner-steps.sh"));
      const release = (version: string, section = true) => {
        writeFileSync(join(repo, "package.json"), `{\n  "name": "repo-harness",\n  "version": "${version}"\n}\n`);
        writeFileSync(join(repo, "packages/operator-web/package.json"), `{\n  "name": "repo-harness-operator-web",\n  "version": "${version}"\n}\n`);
        writeFileSync(join(repo, "docs/CHANGELOG.md"), `# Changelog\n\n## [${section ? version : "0.0.2"}] - 2026-11-09\n\nRelease ${version}.\n\n### Upgrade\n\nRun step ${version}.\n\n### Changed\n\n- Change.\n\n## [0.0.1]\n\nOld.\n`);
        git("add", "-A");
        git("commit", "-qm", `release ${version}`);
        return git("rev-parse", "HEAD");
      };
      git("init", "-q", "-b", "main");
      git("config", "user.email", "t@example.com");
      git("config", "user.name", "t");
      const first = release("1.0.0");
      const second = release("1.1.0");
      git("init", "-q", "--bare", join(dir, "remote.git"));
      git("remote", "add", "origin", join(dir, "remote.git"));
      git("push", "-q", "origin", "main");
      git("fetch", "-q", "origin");
      git("tag", "-a", "v1.0.0", first, "-m", "v1.0.0");
      git("push", "-q", "origin", "v1.0.0");
      git("tag", "-a", "v1.1.0", first, "-m", "v1.1.0");
      git("push", "-q", "origin", "v1.1.0");
      mkdirSync(join(dir, "bin"));
      // The real npm config loader runs with the script's env; it needs no network.
      const realNpm = Bun.which("npm")!;
      writeFileSync(join(dir, "bin/npm"), `#!/bin/bash\n[[ -f \"$npm_config_userconfig\" && ! -s \"$npm_config_userconfig\" && -f \"$npm_config_globalconfig\" && ! -s \"$npm_config_globalconfig\" && \"$npm_config_globalconfig\" != \"$npm_config_userconfig\" ]] && echo \"$npm_config_userconfig\" >> \"$HOME/npm-config\"\n${realNpm} config get registry >/dev/null && echo loaded >> \"$HOME/npm-loader\"\n[[ \"$NPM_VIEW\" == published ]] && exit 0\n[[ \"$NPM_VIEW\" == error ]] && { echo 'npm error code ETIMEDOUT' >&2; exit 1; }\necho 'npm error code E404 not in this registry' >&2\nexit 1\n`, { mode: 0o755 });
      const realGit = Bun.which("git")!;
      writeFileSync(join(dir, "bin/git"), `#!/bin/bash\n[[ -n "$FAIL_TAGS" && "$1 $2" == "ls-remote --tags" ]] && exit 128\n[[ -n "$FAIL_TAG_PARSE" && "$1 $4" == "rev-parse refs/tags/"* ]] && exit 128\nexec ${realGit} "$@"\n`, { mode: 0o755 });
      writeFileSync(join(dir, "bin/gh"), `#!/bin/bash\ncase "$1 $2" in\n  "repo view") echo owner/repo ;;\n  "api repos/owner/repo") echo 42 ;;\n  "release view") case "$RELEASE_STATE" in missing) exit 1 ;; draft) d=true p=false ;; prerelease) d=false p=true ;; *) d=false p=false ;; esac; echo "{\\"tagName\\":\\"$3\\",\\"isDraft\\":$d,\\"isPrerelease\\":$p}" ;;\n  *) exit 1 ;;\nesac\n`, { mode: 0o755 });
      const runIn = (cwd: string, args: string[], env: Record<string, string> = {}) => spawnSync("bash", ["scripts/release-owner-steps.sh", ...args], {
        cwd, encoding: "utf8", env: { ...process.env, HOME: dir, GIT_CONFIG_GLOBAL: "/dev/null", PATH: `${join(dir, "bin")}:${process.env.PATH}`, ...env },
      });
      const run = (...args: string[]) => runIn(repo, args);

      const third = release(planVersion);
      git("push", "-q", "origin", "main");
      git("fetch", "-q", "origin");
      const plan = run("plan", planVersion);
      expect(plan.stderr).toBe("");
      expect(plan.stdout).toContain(`Release GO: repo-harness ${planVersion} at ${third}`);
      expect(plan.stdout).toContain(`git worktree add --detach ${worktree} ${third}`);
      expect(plan.stdout).toContain(`guard ${planVersion} ${third} && npm publish`);
      expect(plan.stdout).toContain(`git tag -a v${planVersion} ${third}`);
      expect(plan.stdout).toContain(`Run step ${planVersion}.`);
      expect(plan.stdout).toContain("--repository-id 42");
      // Each npm call saw an empty scratch npmrc outside HOME, never the owner's.
      const npmConfigs = readFileSync(join(dir, "npm-config"), "utf8").trim().split("\n");
      expect(npmConfigs).toHaveLength(2);
      expect(readFileSync(join(dir, "npm-loader"), "utf8")).toBe("loaded\nloaded\n");
      for (const config of npmConfigs) expect(config.startsWith(dir)).toBe(false);
      const planRefusals: Array<[Record<string, string>, string]> = [
        [{ FAIL_TAGS: "1" }, "git ls-remote --tags origin failed"],
        [{ FAIL_TAG_PARSE: "1" }, `git rev-parse of tag v${planVersion} failed`],
        [{ NPM_VIEW: "published" }, `repo-harness-operator-web@${planVersion} is already on npm`],
        [{ NPM_VIEW: "error" }, `unable to prove repo-harness-operator-web@${planVersion} is unpublished`],
      ];
      for (const [env, message] of planRefusals) expect(runIn(repo, ["plan", planVersion], env).stderr).toContain(message);
      git("tag", `v${planVersion}`, third);
      expect(run("plan", planVersion).stderr).toContain(`tag v${planVersion} already exists in this repository`);
      git("tag", "-d", `v${planVersion}`);
      expect(runIn(repo, ["plan", planVersion], { RELEASE_REMOTE: "missing" }).stderr).toContain("git ls-remote missing refs/heads/main failed");

      git("worktree", "add", "-q", "--detach", worktree, third);
      git("worktree", "add", "-q", "--detach", otherWorktree, third);
      expect(runIn(worktree, ["guard", planVersion, third]).status).toBe(0);
      const guardRefusals: Array<[string, string[], string]> = [
        [repo, [planVersion, third], "the checkout is"],
        [worktree, [planVersion, second], `HEAD is ${third}, not the release commit ${second}`],
        [otherWorktree, [otherVersion, third], `package.json has version ${planVersion}, not ${otherVersion}`],
      ];
      for (const [cwd, args, message] of guardRefusals) expect(runIn(cwd, ["guard", ...args]).stderr).toContain(message);
      writeFileSync(join(worktree, "dirty"), "");
      expect(runIn(worktree, ["guard", planVersion, third]).stderr).toContain("the checkout has changes");
      writeFileSync(spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "index"], { cwd: worktree, encoding: "utf8" }).stdout.trim(), "broken");
      expect(runIn(worktree, ["guard", planVersion, third]).stderr).toContain("git status failed");
      expect(run("notes", "1.0.0").stdout).toBe("\nRelease 1.0.0.\n\n### Upgrade\n\nRun step 1.0.0.\n\n### Changed\n\n- Change.\n");
      expect(run("plan", "1.0.0").stderr).toContain("tag v1.0.0 already exists on origin");

      expect(run("check", "tagged", "1.0.0").stdout).toContain(`Tag v1.0.0 and its GitHub Release are at ${first}`);
      const wrongTag = run("check", "tagged", "1.1.0");
      expect(wrongTag.status).toBe(1);
      expect(wrongTag.stderr).toContain(`tag v1.1.0 is at ${first}, not at the release commit ${second}`);
      expect(run("check", "tagged", planVersion).stderr).toContain(`tag v${planVersion} is not on origin`);
      for (const [state, message] of [["missing", "is missing"], ["draft", "is a draft"], ["prerelease", "is a prerelease"]]) {
        expect(runIn(repo, ["check", "tagged", "1.0.0"], { RELEASE_STATE: state }).stderr).toContain(`GitHub Release v1.0.0 ${message}`);
      }

      release("1.3.0", false);
      git("push", "-q", "origin", "main");
      git("update-ref", "refs/remotes/origin/main", third);
      const stale = run("plan", "1.3.0");
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain("Run git fetch origin first");
      git("fetch", "-q", "origin");
      expect(run("plan", "1.3.0").stderr).toContain("has no [1.3.0] section");
    } finally {
      rmSync(worktree, { recursive: true, force: true });
      rmSync(otherWorktree, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("create-project-dirs should create tasks primary files", () => {
    const content = read("scripts/create-project-dirs.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const contract = JSON.parse(read("assets/workflow-contract.v1.json"));

    expect(content).toContain("create_contract_directories");
    expect(content).not.toContain("cat > tasks/todos.md");
    expect(content).toContain('"adoptionTemplates.files.lessonsLog.lines" > tasks/lessons.md');
    expect(content).toContain("cat > docs/researches/README.md");
    expect(content).not.toContain("docs/TODO.md");
    expect(sharedLib).toContain("pi_install_helpers requires contract helper inventory");
    expect(contract.helpers.scripts).not.toContain("prepare-handoff.sh");
    expect(contract.helpers.scripts).toContain("verify-sprint.sh");
    expect(contract.helpers.scripts).toContain("acceptance-receipt.ts");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain('"check:brain": "repo-harness brain check"');
    expect(sharedLib).toContain('"sync:brain": "repo-harness brain sync"');
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(content).toContain("mkdir -p .ai/context");
    expect(content).toContain(".ai/harness/policy.json");
    expect(content).toContain(".ai/context/context-map.json");
    expect(contract.helpers.scripts).toContain("maintenance-triage.sh");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.helpers.scripts).toContain("verification-plan.ts");
    expect(contract.helpers.scripts).toContain("acceptance-receipt.ts");
    expect(contract.helpers.scripts).not.toContain("context-budget.ts");
    expect(contract.helpers.scripts).not.toContain("architecture-queue.sh");
    expect(contract.helpers.scripts).not.toContain("archive-architecture-request.sh");
    expect(contract.helpers.scripts).not.toContain("context-contract-sync.sh");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("ship-worktrees.sh");
    expect(contract.helpers.scripts).toContain("harness-trace-grade.sh");
    expect(contract.externalTooling.codexAutomationProfile.requiredSkills).toEqual(["health", "check", "mermaid"]);
    expect(contract.externalTooling.codexAutomationProfile.vendoringPolicy).toBe("do-not-vendor-skill-body");
    expect(contract.externalTooling.diagramDesign.vendoringPolicy).toBe("do-not-vendor");
    expect(contract.documentation.referenceConfigs.source).toBe("user-level-runtime-docs");
    expect(contract.documentation.referenceConfigs.repoStubDirectory).toBe("docs/reference-configs");
    expect(contract.documentation.referenceConfigs.packageDirectory).toBe("assets/reference-configs");
    expect(contract.documentation.referenceConfigs.resolverCommand).toBe("repo-harness docs path <doc-id>");
    expect(contract.documentation.referenceConfigs.stubMarker).toBe("<!-- repo-harness: reference-config-stub v1 -->");
    expect(contract.helpers.scripts).not.toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).not.toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("check-agent-tooling.sh");
    expect(contract.helpers.scripts).not.toContain("check-architecture-sync.sh");
    expect(contract.helpers.scripts).not.toContain("check-brain-manifest.sh");
    expect(contract.helpers.scripts).not.toContain("sync-brain-docs.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(contract.helpers.scripts).not.toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(sharedLib).not.toContain("skill-factory-create.sh");
    expect(sharedLib).not.toContain("skill-factory-check.sh");
    expect(sharedLib).not.toContain("pi_install_workflow_contract");
    expect(sharedLib).not.toContain("check:task-sync");
    expect(sharedLib).not.toContain('pkg.scripts["check:architecture-sync"] = ');
    expect(sharedLib).toContain('delete pkg.scripts["check:task-workflow"]');
    expect(sharedLib).not.toContain("contract.template.md");
    expect(sharedLib).not.toContain("implementation-notes.template.md");
    expect(sharedLib).not.toContain("PI_TEMPLATE_PLAN");
    expect(sharedLib).toContain("docs/prds/prd.template.md");
    expect(content).toContain("pi_install_reference_configs");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".claude/templates/implementation-notes.template.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".claude/templates/plan.template.md");
    expect(content).not.toContain("install_workflow_contract");
    expect(content).toContain("pi_install_hook_assets");
    expect(content).not.toContain("pi_install_hook_adapters");
    expect(content).toContain("pi_print_codex_hook_trust_notice");
    expect(sharedLib).toContain('local hooks_dir="$target_dir/.ai/hooks"');
    expect(content).not.toContain("mkdir -p .codex");
    expect(sharedLib).not.toContain("pi_retire_project_hook_adapter");
    expect(sharedLib).not.toContain("pi_prune_repo_local_hook_runtime");
    expect(contract.helpers.scripts).toContain("capability-resolver.ts");
    expect(contract.helpers.scripts).not.toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/contract-worktree.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/ship-worktrees.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/refresh-current-status.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/sync-brain-docs.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("tasks/current.md");
    expect(contract.artifacts.runtimeFiles).not.toContain("tasks/current.md");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/handoff/current.md");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/capability-config.ts");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/workflow-contract.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capability-source-map.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/capability-context/");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/active-plan");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/triage/inbox.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/architecture/events.jsonl");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/external-tooling.md");
    expect(contract.artifacts.requiredFiles).not.toContain("docs/reference-configs/sprint-contracts.md");
    expect(contract.artifacts.requiredFiles).not.toContain("docs/reference-configs/handoff-protocol.md");
    expect(contract.artifacts.requiredDirectories).not.toContain("docs/architecture/domains");
    expect(contract.artifacts.requiredDirectories).not.toContain("docs/architecture/snapshots");
    expect(contract.migrations.upgrade.strategyVersion).toBe(1);
    expect(contract.migrations.upgrade.safety.removeOnlyOwnership).toBe("known_generated");
    const retiredDrift = contract.migrations.upgrade.actions.find(
      (action: { id?: string; paths?: string[] }) => action.id === "legacy-architecture-drift-helper"
    );
    expect(retiredDrift?.paths).toContain("assets/templates/helpers/architecture-drift.sh");
    const legacyRootHelpers = contract.migrations.upgrade.actions.find(
      (action: { id?: string; cleanupMode?: string; paths?: string[] }) => action.id === "legacy-root-helper-runtime"
    );
    expect(legacyRootHelpers?.cleanupMode).toBe("generated_helper");
    expect(legacyRootHelpers?.paths).toContain("scripts/architecture-drift.sh");
    expect(legacyRootHelpers?.paths).toContain("scripts/check-task-workflow.sh");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/workstreams");
    expect(contract.artifacts.requiredDirectories).toContain("docs/prds");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
    expect(contract.agenticDevelopment.routing.productDiscovery).toBe("parent-agent:geju");
    expect(sharedLib).not.toContain(".skill-factory-state.json");
    expect(sharedLib).not.toContain(".memory-context.json");
    expect(sharedLib).not.toContain(".memory-snapshot.json");
    expect(content).not.toContain("install_skill_factory_files");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/contracts");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/reviews");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/notes");
    expect(content).not.toContain("# Deferred Goal Ledger");
    expect(content).not.toContain("PROJECT_SETTINGS_EOF");
    expect(content).not.toContain("\"$TOOL_INPUT\"");
    expect(content).not.toContain("\"$PROMPT\"");
  });

  test("init-project should scaffold tasks primary workflow", () => {
    const content = read("scripts/init-project.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const contract = JSON.parse(read("assets/workflow-contract.v1.json"));

    expect(content).toContain("create_contract_directories");
    expect(content).not.toContain("cat > tasks/todos.md");
    expect(content).toContain('"adoptionTemplates.files.lessonsLog.lines" > tasks/lessons.md');
    expect(content).toContain("docs/researches/README.md");
    expect(content).not.toContain("docs/TODO.md");
    expect(content).toContain("pi_install_helpers");
    expect(content).toContain("pi_install_templates");
    expect(content).not.toContain("install_workflow_contract");
    expect(sharedLib).not.toContain("contract.template.md");
    expect(sharedLib).not.toContain("implementation-notes.template.md");
    expect(sharedLib).not.toContain("PI_TEMPLATE_PLAN");
    expect(sharedLib).toContain("docs/prds/prd.template.md");
    expect(sharedLib).toContain("pi_install_helpers requires contract helper inventory");
    expect(contract.helpers.scripts).toContain("verify-sprint.sh");
    expect(contract.helpers.scripts).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(content).toContain(".ai/context");
    expect(content).toContain(".ai/harness/policy.json");
    expect(content).toContain(".ai/context/context-map.json");
    expect(contract.helpers.scripts).toContain("maintenance-triage.sh");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.helpers.scripts).toContain("verification-plan.ts");
    expect(contract.helpers.scripts).toContain("acceptance-receipt.ts");
    expect(contract.helpers.scripts).not.toContain("context-budget.ts");
    expect(contract.helpers.scripts).not.toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).not.toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("check-agent-tooling.sh");
    expect(contract.helpers.scripts).not.toContain("check-architecture-sync.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(contract.helpers.scripts).not.toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.helpers.scripts).toContain("harness-trace-grade.sh");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).not.toContain(".claude/templates/implementation-notes.template.md");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/workstreams");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
    expect(contract.agenticDevelopment.routing.postImplementationReview).toBe("waza:check");
    expect(contract.externalTooling.codexAutomationProfile.routes.architectureDiagram).toBe("mermaid");
    expect(content).not.toContain("pi_install_skill_factory");
    expect(sharedLib).not.toContain("skill-factory-create.sh");
    expect(sharedLib).not.toContain("skill-factory-check.sh");
    expect(sharedLib).toContain("pi_workflow_contract_query_lines");
    expect(sharedLib).not.toContain("check:task-sync");
    expect(sharedLib).not.toContain('pkg.scripts["check:architecture-sync"] = ');
    expect(sharedLib).toContain('delete pkg.scripts["check:task-workflow"]');
    expect(content).toContain("pi_install_reference_configs");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
    expect(content).not.toContain("pi_install_hook_adapters");
    expect(content).toContain("pi_print_codex_hook_trust_notice");
    expect(content).toContain("pi_install_hook_assets");
    expect(sharedLib).not.toContain("pi_retire_project_hook_adapter");
    expect(sharedLib).not.toContain("pi_prune_repo_local_hook_runtime");
    expect(sharedLib).not.toContain("pi_repo_pins_hook_source");
    expect(sharedLib).toContain("pi_write_hook_runtime_readme");
    expect(sharedLib).toContain("pi_install_hook_assets");
    expect(sharedLib).toContain('local hooks_dir="$target_dir/.ai/hooks"');
    expect(content).not.toContain("mkdir -p .codex");
    expect(sharedLib).not.toContain(".skill-factory-state.json");
    expect(sharedLib).not.toContain(".memory-context.json");
    expect(sharedLib).not.toContain(".memory-snapshot.json");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/contracts");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/reviews");
    expect(contract.artifacts.requiredDirectories).not.toContain("tasks/notes");
    expect(content).not.toContain("# Deferred Goal Ledger");
    expect(content).not.toContain(".*/");
    expect(content).toContain("ensure_runtime_gitignore_block");
    expect(content).toContain("install_hook_settings_template");
    expect(content).not.toContain("\"$TOOL_INPUT\"");
    expect(content).not.toContain("\"$PROMPT\"");
    expect(content).not.toContain("cp \"$ASSETS_REF_DIR\"/*.md docs/reference-configs/");
    expect(content).toContain("pi_print_external_tooling_report");
  });

  test("typed hook runtime owns host events", () => {
    const runtime = read("src/cli/hook/runtime.ts");
    const hookInput = read("src/cli/hook/hook-input.ts");

    expect(runtime).toContain("getHandlerForRoute");
    expect(runtime).toContain("runHook");
    expect(runtime).not.toContain("route.scripts");
    expect(hookInput).toContain("export function parseHookPayload");
  });

  // SSD-06 migration: the two live shell-embedded provider skills
  // (assets/skills/{claude-review,codex-review}) are deleted; their
  // deterministic scope-capture mechanics (branch/staged/unstaged/untracked
  // diff, exact-base binding) moved to code
  // Shared subject capture and current generic review remain the runtime owners;
  // retired advisory code is not reimplemented as Skill Markdown.
  test("repo-harness-cross-review routes to merged Herdr review", () => {
    const skill = read("assets/skills/repo-harness-cross-review/SKILL.md");
    const generic = read("assets/skills/repo-harness-cross-review/references/generic-review.md");
    expect(skill).toContain("references/generic-review.md");
    expect(skill).toContain("deep-reasoner");
    expect(generic).toContain("repo-harness review round");
    expect(generic).toContain("generic-review");
  });

  test("hook docs and scripts should use ToolUse event names", () => {
    const skill = read("SKILL.md");
    const plugins = read("references/plugins-core.md");
    const legacyPre = `PreTool${"Call"}`;
    const legacyPost = `PostTool${"Call"}`;

    expect(skill).not.toContain(legacyPre);
    expect(skill).not.toContain(legacyPost);
    expect(plugins).not.toContain(legacyPre);
    expect(plugins).not.toContain(legacyPost);
  });
});
