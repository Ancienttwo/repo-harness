import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("install script contracts", () => {
  test("macOS/Linux installer is syntax-valid and Bun-owned", () => {
    const script = read("install.sh");
    const syntax = spawnSync("bash", ["-n", "install.sh"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(syntax.status).toBe(0);
    expect(script).toContain("REPO_HARNESS_VERSION");
    expect(script).toContain("https://bun.sh/install");
    expect(script).toContain('MIN_BUN_VERSION="1.1.35"');
    expect(script).toContain('bun_version_at_least "$current_bun_version"');
    expect(script).toContain("bun add -g \"$package_spec\"");
    expect(script).toContain("repo-harness --version");
    expect(script).not.toMatch(/\bnpm\b/);
    expect(script).not.toMatch(/\bnpx\b/);
    expect(script).not.toMatch(/\bnode\b/);
  }, 30_000);

  test("Windows installer is Bun-owned and version-pinnable", () => {
    const script = read("install.ps1");

    expect(script).toContain("REPO_HARNESS_VERSION");
    expect(script).toContain("https://bun.sh/install.ps1");
    expect(script).toContain('$MinimumBunVersion = [Version]"1.1.35"');
    expect(script).toContain('$BunVersion -lt $MinimumBunVersion');
    expect(script).toContain("& bun add -g $PackageSpec");
    expect(script).toContain("repo-harness --version");
    expect(script).not.toMatch(/\bnpm\b/i);
    expect(script).not.toMatch(/\bnpx\b/i);
    expect(script).not.toMatch(/\bnode\b/i);
  });

  // Scope: the shell-installer surface only. The bunx / bun add -g / npx command
  // pins live in tests/readme-dx.test.ts against the First 5 Minutes section;
  // repeating them here at whole-README scope added no coverage.
  test("README documents the no-Node installer and its Bun version floor", () => {
    const readme = read("README.md");
    const zhReadme = read("README.zh-CN.md");
    const pkg = JSON.parse(read("package.json"));

    expect(readme).toContain("curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh");
    expect(readme).toContain("irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex");
    // SSD-xx: the README's Bun-floor sentence reworded from "If Bun >= 1.1.35
    // is already on PATH, you can skip the shell installer." to "With Bun >=
    // 1.1.35 already on PATH, skip the shell installer." Pin the version
    // string shared with install.sh's MIN_BUN_VERSION invariant, not the
    // exact prose.
    expect(readme).toContain("1.1.35");
    expect(readme).not.toContain("npm install -g repo-harness");
    expect(zhReadme).toContain("curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh");
    expect(zhReadme).toContain("irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex");
    expect(zhReadme).toContain("bunx repo-harness@latest install");
    expect(zhReadme).toContain("npx -y repo-harness@latest install");
    expect(pkg.files).toContain("install.sh");
    expect(pkg.files).toContain("install.ps1");
  });

  test("localized READMEs pin the npx install fallback to @latest", () => {
    const localizedReadmes = ["README.es.md", "README.ja.md", "README.fr.md"];

    for (const file of localizedReadmes) {
      expect(read(file)).toContain("npx -y repo-harness@latest install");
    }
  });
});
