import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { run, tmpWorkspace } from "../helpers/repo-fixture";

setDefaultTimeout(30000);

const CLI = join(import.meta.dir, "..", "..", "src", "cli", "index.ts");

function brain(cwd: string, args: string[], brainRoot: string) {
  return run("bun", [CLI, "brain", ...args, "--repo", cwd], cwd, { REPO_HARNESS_BRAIN_ROOT: brainRoot });
}

describe("repo-harness brain", () => {
  test("brain sync mirrors opted-in repo docs and brain check reports drift", () => {
    const cwd = tmpWorkspace("brain-sync");
    try {
      const brainRoot = join(cwd, "brain");
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(brainRoot, { recursive: true });

      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable Doc\n\nStable project knowledge.\n");
      writeFileSync(
        join(cwd, ".ai/harness/brain-manifest.json"),
        JSON.stringify(
          {
            version: 1,
            project: "demo",
            mode: "repo-contract-external-knowledge",
            default_brain_path: "brain/demo/*",
            entries: [
              {
                id: "valuable",
                role: "repo-authored",
                repo_path: "docs/valuable.md",
                brain_path: "brain/demo/references/valuable.md",
                sync: { direction: "repo-to-brain" },
              },
            ],
          },
          null,
          2
        ) + "\n"
      );

      const syncRes = brain(cwd, ["sync"], brainRoot);
      expect(syncRes.status).toBe(0);
      expect(syncRes.stdout).toContain("Synced: 1");

      const brainFile = join(brainRoot, "demo/references/valuable.md");
      expect(readFileSync(brainFile, "utf-8")).toContain("Stable project knowledge.");

      const checkRes = brain(cwd, ["check"], brainRoot);
      expect(checkRes.status).toBe(0);
      expect(checkRes.stdout).toContain("Skipped/up-to-date: 1");

      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable Doc\n\nUpdated knowledge.\n");
      const driftRes = brain(cwd, ["check"], brainRoot);
      expect(driftRes.status).toBe(1);
      expect(driftRes.stdout).toContain("Brain file differs for valuable");

      const changedRes = brain(cwd, ["sync", "--changed", "docs/valuable.md"], brainRoot);
      expect(changedRes.status).toBe(0);
      expect(readFileSync(brainFile, "utf-8")).toContain("Updated knowledge.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("brain sync rejects repo and brain symlink escapes", () => {
    const cwd = tmpWorkspace("brain-sync-symlink");
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "brain-sync-outside-")));
    try {
      const brainRoot = join(cwd, "brain");
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(brainRoot, "demo/references"), { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, "source.md"), "# Outside\n");
      symlinkSync(join(outside, "source.md"), join(cwd, "docs/valuable.md"));
      writeFileSync(
        join(cwd, ".ai/harness/brain-manifest.json"),
        JSON.stringify(
          {
            version: 1,
            project: "demo",
            mode: "repo-contract-external-knowledge",
            default_brain_path: "brain/demo/*",
            entries: [
              {
                id: "valuable",
                role: "repo-authored",
                repo_path: "docs/valuable.md",
                brain_path: "brain/demo/references/valuable.md",
                sync: { direction: "repo-to-brain" },
              },
            ],
          },
          null,
          2
        ) + "\n"
      );

      const sourceRes = brain(cwd, ["sync"], brainRoot);
      expect(sourceRes.status).toBe(1);
      expect(sourceRes.stdout).toContain("Entry valuable source_path resolves outside repo");

      rmSync(join(cwd, "docs/valuable.md"));
      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable\n");
      writeFileSync(join(outside, "target.md"), "# Old outside target\n");
      symlinkSync(join(outside, "target.md"), join(brainRoot, "demo/references/valuable.md"));

      const targetRes = brain(cwd, ["sync"], brainRoot);
      expect(targetRes.status).toBe(1);
      expect(targetRes.stdout).toContain("brain file symlink escapes brain root");
      expect(readFileSync(join(outside, "target.md"), "utf-8")).toContain("Old outside target");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  describe("brain check validates the whole manifest", () => {
    const STUB = "# Stub\n\nMoved to brain/demo/references/stub.md\n";

    type Entry = Record<string, unknown>;

    function stubEntry(overrides: Entry = {}): Entry {
      return {
        id: "stub",
        role: "externalized",
        repo_path: "docs/stub.md",
        brain_path: "brain/demo/references/stub.md",
        max_repo_lines: 5,
        ...overrides,
      };
    }

    function checkManifest(
      entries: Entry[],
      setup: (cwd: string, brainRoot: string) => void = () => {},
      manifestOverrides: Entry = {},
    ) {
      const cwd = tmpWorkspace("brain-validate");
      try {
        const brainRoot = join(cwd, "brain");
        mkdirSync(join(cwd, "docs"), { recursive: true });
        mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
        writeFileSync(join(cwd, "docs/stub.md"), STUB);
        writeFileSync(
          join(cwd, ".ai/harness/brain-manifest.json"),
          JSON.stringify(
            {
              version: 1,
              project: "demo",
              default_brain_path: "brain/demo/*",
              entries,
              ...manifestOverrides,
            },
            null,
            2,
          ) + "\n",
        );
        setup(cwd, brainRoot);
        return brain(cwd, ["check"], brainRoot);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }

    test("accepts a valid pointer-only stub that no sync entry covers", () => {
      const res = checkManifest([stubEntry()]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("vault root unavailable");
    });

    test("rejects a repo stub over max_repo_lines", () => {
      const res = checkManifest([stubEntry({ max_repo_lines: 2 })]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Entry stub repo stub has 3 lines, max 2: docs/stub.md");
    });

    test("rejects a repo stub that does not mention its brain_path", () => {
      const res = checkManifest([stubEntry()], (cwd) => writeFileSync(join(cwd, "docs/stub.md"), "# Stub\n"));
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Entry stub repo stub does not mention brain_path");
    });

    test("rejects duplicate ids, repo_path and brain_path values", () => {
      const res = checkManifest([stubEntry(), stubEntry()]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("duplicate entry ids");
      expect(res.stdout).toContain("duplicate repo_path values");
      expect(res.stdout).toContain("duplicate brain_path values");
    });

    test("rejects a missing repo source file of an externalized entry", () => {
      const res = checkManifest([stubEntry({ repo_path: "docs/gone.md" })]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Entry stub repo_path is missing: docs/gone.md");
    });

    test("rejects an invalid or missing role", () => {
      const invalid = checkManifest([stubEntry({ role: "mirrored" })]);
      expect(invalid.status).toBe(1);
      expect(invalid.stdout).toContain("Entry stub has unsupported role: mirrored");

      const missing = checkManifest([stubEntry({ role: undefined })]);
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain("Entry stub is missing role");
    });

    test("rejects missing required manifest fields", () => {
      const res = checkManifest([stubEntry()], () => {}, { version: undefined, project: undefined });
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Brain manifest is missing version");
      expect(res.stdout).toContain("Brain manifest is missing project");
    });

    test("rejects the retired sync_direction alias and an unknown sync.direction", () => {
      const alias = checkManifest([stubEntry({ sync_direction: "repo-to-brain" })]);
      expect(alias.status).toBe(1);
      expect(alias.stdout).toContain("unsupported sync_direction");

      const unknown = checkManifest([stubEntry({ sync: { direction: "brain-to-repo" } })]);
      expect(unknown.status).toBe(1);
      expect(unknown.stdout).toContain("unsupported sync.direction: brain-to-repo");
    });

    test("rejects a brain_path outside default_brain_path", () => {
      const res = checkManifest([stubEntry({ brain_path: "brain/other/references/stub.md" })]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("brain_path is outside default_brain_path");
    });

    test("checks asset_path existence and parity with repo_path", () => {
      const missing = checkManifest([stubEntry({ asset_path: "assets/stub.md" })]);
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain("Entry stub asset_path is missing: assets/stub.md");

      const differs = checkManifest([stubEntry({ asset_path: "assets/stub.md" })], (cwd) => {
        mkdirSync(join(cwd, "assets"), { recursive: true });
        writeFileSync(join(cwd, "assets/stub.md"), "different\n");
      });
      expect(differs.status).toBe(1);
      expect(differs.stdout).toContain("repo_path and asset_path differ");

      const same = checkManifest([stubEntry({ asset_path: "assets/stub.md" })], (cwd) => {
        mkdirSync(join(cwd, "assets"), { recursive: true });
        writeFileSync(join(cwd, "assets/stub.md"), STUB);
      });
      expect(same.status).toBe(0);
    });

    test("checks a pointer-only brain file once the project vault directory exists", () => {
      const missing = checkManifest([stubEntry()], (_cwd, brainRoot) => mkdirSync(join(brainRoot, "demo"), { recursive: true }));
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain("Entry stub brain file is missing: brain/demo/references/stub.md");

      const present = checkManifest([stubEntry()], (_cwd, brainRoot) => {
        mkdirSync(join(brainRoot, "demo/references"), { recursive: true });
        writeFileSync(join(brainRoot, "demo/references/stub.md"), "x\n");
      });
      expect(present.status).toBe(0);
    });

    test("rejects policy values that disagree with the manifest", () => {
      const res = checkManifest([stubEntry()], (cwd) =>
        writeFileSync(
          join(cwd, ".ai/harness/policy.json"),
          JSON.stringify({
            information_lifecycle: {
              external_knowledge: {
                manifest_file: ".ai/harness/other.json",
                project_path: "brain/elsewhere/*",
                sync_script: "scripts/missing-sync.sh",
              },
            },
          }),
        ),
      );
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Policy external_knowledge.manifest_file points to .ai/harness/other.json");
      expect(res.stdout).toContain("Policy project_path brain/elsewhere/* does not match");
      expect(res.stdout).toContain("Policy external_knowledge.sync_script is missing: scripts/missing-sync.sh");
    });

    test("accepts the repo-harness brain sync command as the policy sync_script", () => {
      const res = checkManifest([stubEntry()], (cwd) =>
        writeFileSync(
          join(cwd, ".ai/harness/policy.json"),
          JSON.stringify({
            information_lifecycle: {
              external_knowledge: {
                manifest_file: ".ai/harness/brain-manifest.json",
                project_path: "brain/demo/*",
                sync_script: "repo-harness brain sync",
              },
            },
          }),
        ),
      );
      expect(res.status).toBe(0);
    });
  });

  test("repo-harness run fails on the retired brain helper ids", () => {
    const cwd = tmpWorkspace("brain-retired-helper");
    try {
      for (const [helper, replacement] of [
        ["check-brain-manifest", "repo-harness brain check"],
        ["sync-brain-docs", "repo-harness brain sync"],
      ]) {
        const res = run("bun", [CLI, "run", helper], cwd);
        expect(res.status).toBe(2);
        expect(res.stderr).toContain(`helper "${helper}" is retired`);
        expect(res.stderr).toContain(replacement);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
