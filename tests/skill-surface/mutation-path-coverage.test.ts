import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  beginInstallHostTransaction,
  rollbackInstallHostTransaction,
} from "../../src/cli/installer/install-profile";
import { mutationPathSkillNames, type SkillSurfaceCatalog } from "../../src/core/skill-surface/catalog";

function withHome(run: (env: NodeJS.ProcessEnv) => void): void {
  const home = mkdtempSync(join(tmpdir(), "repo-harness-mutation-path-"));
  try {
    run({ ...process.env, HOME: home, BUN_INSTALL: join(home, ".bun") });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function writePath(path: string, content = ""): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

/** A minimal, self-contained synthetic catalog carrying a brand-new package that no real installer code has ever heard of. */
function catalogWithSyntheticPackage(newName: string): SkillSurfaceCatalog {
  const router = {
    name: "repo-harness",
    kind: "router" as const,
    source: ".",
    provider: null,
    hosts: ["claude", "codex"] as const,
    profiles: ["minimal", "standard"] as const,
    discoverability: "always" as const,
    component: "cli",
    requires: [],
    mutatesRepoByDefault: false,
    summary: "root router",
    retirementCandidate: null,
  };
  const newFacade = {
    name: newName,
    kind: "facade" as const,
    source: `assets/skill-commands/${newName}`,
    provider: null,
    hosts: ["claude", "codex"] as const,
    profiles: ["standard"] as const,
    discoverability: "profile-facade" as const,
    component: "adaptive-workflow",
    requires: [],
    mutatesRepoByDefault: false,
    summary: "a synthetic facade the real manifest has never declared",
    retirementCandidate: null,
  };
  return { packages: [router, newFacade] } as unknown as SkillSurfaceCatalog;
}

describe("mutation-path coverage: a synthetic new catalog package is picked up without code changes", () => {
  test("mutationPathSkillNames() includes the new package's name automatically", () => {
    const catalog = catalogWithSyntheticPackage("repo-harness-newthing");
    const { repoHarnessSkills } = mutationPathSkillNames(catalog);
    expect(repoHarnessSkills).toContain("repo-harness-newthing");
    expect(repoHarnessSkills).toContain("repo-harness");
  });

  test(
    "the new package's host-skill destinations are covered by the transaction snapshot, " +
      "and a mid-transaction failure restores original bytes on both hosts",
    () => withHome((env) => {
      const catalog = catalogWithSyntheticPackage("repo-harness-newthing");
      const { repoHarnessSkills } = mutationPathSkillNames(catalog);
      const newName = "repo-harness-newthing";
      expect(repoHarnessSkills).toContain(newName);

      // Construct the same per-host destination shape
      // installProfileHostMutationPaths() builds from its own catalog-derived
      // name lists (join(home, host, 'skills', name) for both hosts), proving
      // the generic path-construction/transaction machinery correctly covers
      // whatever names a catalog-driven selector produces -- including one
      // that did not exist when the transaction code was written.
      const home = env.HOME!;
      const destinations = [".codex", ".claude"].map((host) => join(home, host, "skills", newName));

      // Simulate a prior real install: each destination already has managed content on disk.
      const originalText = new Map<string, string>();
      for (const dest of destinations) {
        const content = `# ${newName} original at ${dest}\n`;
        writePath(join(dest, "SKILL.md"), content);
        originalText.set(dest, content);
      }

      const transaction = beginInstallHostTransaction(destinations, env);

      // Mid-transaction failure: one destination gets partially rewritten,
      // the other gets a brand-new file created under it.
      writeFileSync(join(destinations[0], "SKILL.md"), "# partially mutated\n");
      const createdUnderSecond = join(destinations[1], "NEW-FILE.md");
      writeFileSync(createdUnderSecond, "# should not survive rollback\n");

      rollbackInstallHostTransaction(transaction);

      for (const dest of destinations) {
        const expected = originalText.get(dest);
        if (!expected) throw new Error(`missing captured original bytes for ${dest}`);
        expect(readFileSync(join(dest, "SKILL.md"), "utf-8")).toBe(expected);
      }
      expect(existsSync(createdUnderSecond)).toBe(false);
    }),
  );

  test(
    "a newly-created (not pre-existing) destination for the synthetic package is removed entirely on rollback",
    () => withHome((env) => {
      const home = env.HOME!;
      const newName = "repo-harness-newthing";
      const destinations = [".codex", ".claude"].map((host) => join(home, host, "skills", newName));

      // Nothing exists yet at either destination when the transaction begins.
      const transaction = beginInstallHostTransaction(destinations, env);
      for (const dest of destinations) {
        writePath(join(dest, "SKILL.md"), "# created mid-transaction\n");
      }
      rollbackInstallHostTransaction(transaction);

      for (const dest of destinations) {
        expect(existsSync(dest)).toBe(false);
      }
    }),
  );
});
