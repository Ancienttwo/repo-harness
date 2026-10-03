import { defaultPolicy } from "../src/core/adoption/standard-plan";
import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * `.ai/harness/policy.json#external_tooling.herdr` is the single herdr runtime
 * pin. These are drift checks for its readers: CI, the readiness script, and the
 * downstream policy seed must derive the floor, URL, and checksum from that key
 * instead of restating them.
 */
const ROOT = join(import.meta.dir, "..");
const POLICY_PATH = join(ROOT, ".ai/harness/policy.json");
const CI_PATH = join(ROOT, ".github/workflows/ci.yml");
const SCRIPT_PATH = join(ROOT, "scripts/check-agent-tooling.sh");
const SEED_PATHS = [
  join(ROOT, "scripts/lib/project-init-lib.sh"),
];

function readPolicy() {
  return JSON.parse(readFileSync(POLICY_PATH, "utf8"));
}

function herdrInstallStep() {
  const workflow = Bun.YAML.parse(readFileSync(CI_PATH, "utf8")) as {
    jobs: { test: { steps: Array<{ name?: string; run?: string }> } };
  };
  const step = workflow.jobs.test.steps.find(entry => entry.name === 'Install pinned Herdr runtime');
  expect(step?.run).toBeDefined();
  return step!.run!;
}

describe("herdr runtime pin has one source of truth", () => {
  test("the pin parses and its release URL embeds the pinned version", () => {
    const herdr = readPolicy().external_tooling?.herdr;
    expect(herdr).toBeDefined();
    expect(herdr.min_version).toMatch(/^\d+\.\d+\.\d+$/);
    const asset = herdr.release_assets?.["linux-x86_64"];
    expect(asset?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(asset?.url).toContain(`/v${herdr.min_version}/`);
  });

  test("the CI install step reads the pin instead of restating it", () => {
    const step = herdrInstallStep();
    expect(step).toContain(".ai/harness/policy.json");
    expect(step).toContain(".external_tooling.herdr.min_version");
    expect(step).toContain("sha256sum --check");
    expect(step).toContain("herdr --version");
    // No hardcoded version, release tag, or checksum may survive in the step.
    expect(step).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(step).not.toMatch(/[0-9a-f]{64}/);
  });

  test("check-agent-tooling.sh carries no hand-coded herdr version floor", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    expect(script).toContain('".ai/harness/policy.json#external_tooling.herdr"');
    expect(script).toContain("external_tooling?.herdr?.min_version");
    const herdrLines = script.split("\n").filter((line) => /herdr/i.test(line));
    expect(herdrLines.length).toBeGreaterThan(0);
    for (const line of herdrLines) {
      expect(line).not.toMatch(/\d+\.\d+\.\d+/);
      expect(line).not.toMatch(/minor\s*[<>]=?\s*\d|\[2\]\)\s*[<>]/);
    }
  });

  test("the downstream policy seed projects the same pin", () => {
    const herdr = readPolicy().external_tooling.herdr;
    expect((defaultPolicy("minimal-agentic", "en").external_tooling as Record<string, unknown>).herdr).toEqual(herdr);
    const expected = JSON.stringify(herdr, null, 2)
      .split("\n")
      .map((line) => line.trim());
    for (const seedPath of SEED_PATHS) {
      const seed = readFileSync(seedPath, "utf8");
      const start = seed.indexOf('    "herdr": {');
      expect(start, seedPath).toBeGreaterThanOrEqual(0);
      const block = seed
        .slice(start, seed.indexOf("\n    }\n", start) + "\n    }".length)
        .split("\n")
        .map((line) => line.trim());
      expect(block.slice(1), seedPath).toEqual(expected.slice(1));
    }
  });
});
