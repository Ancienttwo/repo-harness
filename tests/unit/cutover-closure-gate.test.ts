import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { canonicalJson, evaluateCutoverClosure, parseCutoverContract, parseCutoverContractText } from "../../scripts/cutover-closure";

const ROOT = join(import.meta.dir, "..", "..");
const FIXTURE = join(ROOT, "tests/fixtures/cutover-closure/pr-230.contract.md");
const HEAD = "4f7cb37e0edf74a8d0b334a8a24370ac48807f86";
const BASE = "aef4edff1fd21ca97643e0d13cf5fd29ba746d69";

describe("cutover closure gate", () => {
  test("resolves the historical proof objects", () => {
    for (const sha of [HEAD, BASE]) expect(spawnSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: ROOT }).status).toBe(0);
  });
  test("parses exact selector coverage and six categories", async () => {
    const parsed = parseCutoverContract(FIXTURE);
    expect(parsed.killList).toHaveLength(7);
    expect(parsed.closure.entries).toHaveLength(6);
    expect(parsed.closure.entries.find((entry) => entry.category === "old_implementation")?.selectors).not.toContainEqual({ kind: "symbol", value: "ProviderThreadEffectIntentV1" });
    expect(parsed.closure.entries.find((entry) => entry.category === "docs_and_projections")?.selectors).toContainEqual({ kind: "symbol", value: "ProviderThreadEffectIntentV1" });
    const broken = (await Bun.file(FIXTURE).text()).replace('{"category":"fallback","disposition":"not_applicable","selectors":[],"reason":null,"expiry":null},', "");
    expect(() => parseCutoverContractText(broken, "broken.md")).toThrow("refactor_closure_incomplete");
    const offsetExpiry = (await Bun.file(FIXTURE).text()).replace("2027-08-31T00:00:00Z", "2027-08-31T08:00:00+08:00");
    expect(() => parseCutoverContractText(offsetExpiry, "offset.md")).not.toThrow();
  });
  test("proves head closure, base residue, and canonical digest", () => {
    const closed = evaluateCutoverClosure({ repo: ROOT, contract: FIXTURE, head: HEAD, locator: ".ai/harness/checks/pr-230-cutover-closure.v1.json" });
    expect(closed.status).toBe("closed");
    expect(closed.residues).toEqual([]);
    const { closureSha256: _, errorCode: __, ...basis } = closed;
    expect(closed.closureSha256).toBe(createHash("sha256").update(canonicalJson(basis)).digest("hex"));
    const residue = evaluateCutoverClosure({ repo: ROOT, contract: FIXTURE, head: BASE, locator: "result.json" });
    expect(residue.status).toBe("residue");
    expect(residue.errorCode).toBe("refactor_closure_residue");
    expect(residue.residues.length).toBeGreaterThan(0);
  });
  test("CLI distinguishes missing required from not applicable", () => {
    const dir = mkdtempSync(join(tmpdir(), "cutover-missing-"));
    try {
      const contract = join(dir, "contract.md");
      writeFileSync(contract, "# no kill list\n\nThis prose mentions ## Refactor Kill List inline.\n");
      for (const command of [["init", "-b", "main"], ["config", "user.name", "Fixture"], ["config", "user.email", "fixture@example.com"], ["add", "contract.md"], ["commit", "-m", "fixture"]]) expect(spawnSync("git", command, { cwd: dir }).status).toBe(0);
      const common = [join(ROOT, "scripts/cutover-closure.ts"), "verify", "--repo", dir, "--contract", "contract.md", "--head", "HEAD"];
      const optional = spawnSync("bun", common, { encoding: "utf8" });
      expect(optional.status).toBe(0);
      expect(JSON.parse(optional.stdout).status).toBe("not_applicable");
      const required = spawnSync("bun", [...common, "--require-cutover-closure"], { encoding: "utf8" });
      expect(required.status).toBe(1);
      expect(required.stderr).toContain("refactor_closure_missing");
      expect(JSON.parse(required.stdout)).toMatchObject({ status: "incomplete", entries: [], residues: [], errorCode: "refactor_closure_missing" });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test("rejects contract and output symlink escapes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cutover-symlink-"));
    const outside = mkdtempSync(join(tmpdir(), "cutover-outside-"));
    try {
      const fixture = await Bun.file(FIXTURE).text();
      writeFileSync(join(dir, "contract.md"), fixture);
      for (const command of [["init", "-b", "main"], ["config", "user.name", "Fixture"], ["config", "user.email", "fixture@example.com"], ["add", "contract.md"], ["commit", "-m", "fixture"]]) expect(spawnSync("git", command, { cwd: dir }).status).toBe(0);
      writeFileSync(join(outside, "contract.md"), fixture);
      symlinkSync(join(outside, "contract.md"), join(dir, "escaped-contract.md"));
      const helper = join(ROOT, "scripts/cutover-closure.ts");
      const escapedContract = spawnSync("bun", [helper, "verify", "--repo", dir, "--contract", "escaped-contract.md", "--head", "HEAD"], { encoding: "utf8" });
      expect(escapedContract.status).toBe(1);
      expect(escapedContract.stderr).toContain("refactor_closure_incomplete");
      mkdirSync(join(dir, ".ai/harness/checks"), { recursive: true });
      const outsideOutput = join(outside, "result.json");
      writeFileSync(outsideOutput, "unchanged\n");
      symlinkSync(outsideOutput, join(dir, ".ai/harness/checks/result.json"));
      const escapedOutput = spawnSync("bun", [helper, "verify", "--repo", dir, "--contract", "contract.md", "--head", "HEAD", "--output", ".ai/harness/checks/result.json"], { encoding: "utf8" });
      expect(escapedOutput.status).toBe(1);
      expect(escapedOutput.stderr).toContain("refactor_closure_incomplete");
      expect(await Bun.file(outsideOutput).text()).toBe("unchanged\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
