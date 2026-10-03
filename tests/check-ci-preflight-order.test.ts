import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "..");

test("daily governance records failure without authorizing PR coverage", () => {
  const bin = mkdtempSync(join(tmpdir(), "rh-ci-preflight-bin-"));
  const testLog = join(bin, "bun-test.log");
  try {
    writeFileSync(join(bin, "bun"), `#!/bin/bash\nif [[ "$1" == "test" ]]; then echo test >> ${JSON.stringify(testLog)}; fi\nexit 0\n`);
    writeFileSync(join(bin, "npm"), "#!/bin/bash\nexit 0\n");
    writeFileSync(join(bin, "bash"), `#!/bin/bash\ncase "$1" in\n  scripts/check-deploy-sql-order.sh|scripts/check-architecture-sync.sh) exit 0 ;;\n  scripts/check-task-sync.sh) exit 19 ;;\nesac\nexec /bin/bash "$@"\n`);
    for (const name of ["bun", "npm", "bash"]) {
      spawnSync("chmod", ["+x", join(bin, name)]);
    }

    const result = spawnSync("/bin/bash", ["scripts/check-ci.sh", "governance"], {
      cwd: ROOT,
      encoding: "utf-8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    expect(result.status).toBe(19);
    expect(result.stdout).toContain("[ci] workflow checks");
    expect(result.stdout).not.toContain("[ci] tests");
    expect(() => readFileSync(testLog, "utf-8")).toThrow();
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});
