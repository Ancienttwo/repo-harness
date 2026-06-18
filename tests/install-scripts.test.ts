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
    expect(script).toContain("bun add -g \"$package_spec\"");
    expect(script).toContain("repo-harness --version");
    expect(script).not.toMatch(/\bnpm\b/);
    expect(script).not.toMatch(/\bnpx\b/);
    expect(script).not.toMatch(/\bnode\b/);
  });

  test("Windows installer is Bun-owned and version-pinnable", () => {
    const script = read("install.ps1");

    expect(script).toContain("REPO_HARNESS_VERSION");
    expect(script).toContain("https://bun.sh/install.ps1");
    expect(script).toContain("& bun add -g $PackageSpec");
    expect(script).toContain("repo-harness --version");
    expect(script).not.toMatch(/\bnpm\b/i);
    expect(script).not.toMatch(/\bnpx\b/i);
    expect(script).not.toMatch(/\bnode\b/i);
  });

  test("README front-loads the no-Node installer and Bun package-manager fallback", () => {
    const readme = read("README.md");
    const zhReadme = read("README.zh-CN.md");
    const pkg = JSON.parse(read("package.json"));

    expect(readme).toContain("curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh");
    expect(readme).toContain("irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex");
    expect(readme).toContain("<summary>Already have Bun? Use Bun directly, or npx as a fallback</summary>");
    expect(readme).toContain("bun add -g repo-harness");
    expect(readme).toContain("npx -y repo-harness install");
    expect(readme).not.toContain("npm install -g repo-harness");
    expect(zhReadme).toContain("curl -fsSL https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.sh | sh");
    expect(zhReadme).toContain("irm https://raw.githubusercontent.com/Ancienttwo/repo-harness/main/install.ps1 | iex");
    expect(pkg.files).toContain("install.sh");
    expect(pkg.files).toContain("install.ps1");
  });
});
