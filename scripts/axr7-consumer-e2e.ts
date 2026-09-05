#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const VERSION = "0.5.7";
const REPO_HARNESS_VERSION = "0.17.0";
const repoRoot = resolve(import.meta.dir, "..");
const archContextRoot = resolve(flag("--arch-context-root") ?? join(repoRoot, "..", "arch-context"));
const revision = flag("--arch-context-revision") ?? git(archContextRoot, ["rev-parse", "HEAD"]);
const keep = process.argv.includes("--keep-temp");
const workspace = mkdtempSync(join(tmpdir(), "repo-harness-axr7-e2e-"));
let installedArchctx: string | null = null;
let fixtureRoot: string | null = null;

try {
  const producer = join(workspace, "arch-context");
  const artifacts = join(workspace, "artifacts");
  const consumer = join(workspace, "consumer");
  const fixture = join(workspace, "fixture");
  const isolatedUserHome = join(workspace, "user-home");
  for (const path of [producer, artifacts, consumer, fixture, isolatedUserHome]) mkdirSync(path, { recursive: true });

  extractRevision(producer);
  prepareReleaseVersion(producer);
  linkBuildDependencies(producer);
  const contracts = packContracts(producer, artifacts);
  const archctx = packArchctx(producer, artifacts);
  const repoHarness = packRepoHarness(artifacts);

  writeFileSync(join(consumer, "package.json"), `${JSON.stringify({
    private: true,
    dependencies: {
      archctx: `file:${archctx.tarball}`,
      "archctx-contracts": `file:${contracts.tarball}`,
      "repo-harness": `file:${repoHarness.tarball}`,
      "@colbymchenry/codegraph": "1.5.0",
    },
  }, null, 2)}\n`);
  run("npm", ["install", "--omit=dev"], consumer, { timeoutMs: 240_000 });

  const installedRoots = {
    archctx: realpathSync(join(consumer, "node_modules", "archctx")),
    contracts: realpathSync(join(consumer, "node_modules", "archctx-contracts")),
    repoHarness: realpathSync(join(consumer, "node_modules", "repo-harness")),
  };
  for (const [name, path] of Object.entries(installedRoots)) {
    if (!inside(path, realpathSync(consumer))) throw new Error(`${name} did not resolve inside the disposable consumer: ${path}`);
    if (inside(path, realpathSync(repoRoot)) || inside(path, realpathSync(archContextRoot))) {
      throw new Error(`${name} resolved through a sibling checkout: ${path}`);
    }
  }

  initializeFixture(fixture);
  const binDir = join(consumer, "node_modules", ".bin");
  const repoHarnessCli = join(binDir, "repo-harness");
  const repoHarnessHook = join(binDir, "repo-harness-hook");
  const archctxCli = join(binDir, "archctx");
  const codegraphCli = join(binDir, "codegraph");
  installedArchctx = archctxCli;
  fixtureRoot = fixture;
  const childEnv = {
    ...process.env,
    HOME: isolatedUserHome,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    HOOK_HOST: "codex",
    HOOK_REPO_ROOT: fixture,
    REPO_HARNESS_WORKFLOW_PROFILE: "lite",
  };

  run(codegraphCli, ["init"], fixture, { env: childEnv, timeoutMs: 120_000 });
  run(codegraphCli, ["sync"], fixture, { env: childEnv, timeoutMs: 120_000 });
  run(archctxCli, ["daemon", "upgrade"], fixture, { env: childEnv, timeoutMs: 120_000 });
  const baselineApply = envelope(run(archctxCli, ["docs", "apply", "--approved", "--profile", "repo-harness/v1", "--json"], fixture, {
    env: childEnv,
    timeoutMs: 120_000,
  }).stdout);
  if (!baselineApply.ok) throw new Error(`baseline ArchContext apply failed: ${JSON.stringify(baselineApply.error)}`);
  run("git", ["add", "."], fixture);
  run("git", ["commit", "-m", "stabilize projected architecture baseline"], fixture);
  run(codegraphCli, ["sync"], fixture, { env: childEnv, timeoutMs: 120_000 });

  const selectors = capabilityEntrypoints(fixture);
  const cycles = [
    runCycle({ name: "clean", paths: ["README.md"], mutate: false }),
    runCycle({ name: "single-capability-dirty", paths: [selectors[0]!], mutate: true }),
    runCycle({ name: "multi-capability-dirty", paths: selectors.slice(1, 3), mutate: true }),
  ];

  process.stdout.write(`${JSON.stringify({
    schemaVersion: "repo-harness.axr7-consumer-e2e/v1",
    status: "verified",
    source: { archContextRevision: revision, dirtyProducerSourceUsed: false },
    packages: {
      contracts: { name: "archctx-contracts", version: VERSION, file: basename(contracts.tarball), integrity: contracts.integrity },
      archctx: { name: "archctx", version: VERSION, file: basename(archctx.tarball), integrity: archctx.integrity },
      repoHarness: { name: "repo-harness", version: REPO_HARNESS_VERSION, file: basename(repoHarness.tarball), integrity: repoHarness.integrity },
    },
    consumer: { root: "disposable", installedRootsInsideConsumer: true, siblingCheckoutResolution: false },
    diagrams: { format: "mermaid", htmlArtifacts: 0 },
    cycles,
  }, null, 2)}\n`);

  function runCycle(input: { name: string; paths: string[]; mutate: boolean }) {
    const beforeReceipts = receiptFiles(fixture);
    const preimages = new Map(input.paths.map((path) => [path, readFileSync(join(fixture, path))]));
    input.paths.forEach((path, index) => appendFileSync(join(fixture, path), `\n// AXR7 ${input.name} ${index + 1}\n`));
    for (const path of input.paths) {
      run(repoHarnessHook, ["PostToolUse", "--route", "edit"], fixture, {
        env: childEnv,
        input: `${JSON.stringify({ session_id: `axr7-${input.name}`, tool_input: { file_path: join(fixture, path) } })}\n`,
        timeoutMs: 30_000,
      });
    }
    if (!input.mutate) {
      for (const [path, preimage] of preimages) writeFileSync(join(fixture, path), preimage);
    }
    run(repoHarnessHook, ["Stop", "--route", "default"], fixture, {
      env: childEnv,
      input: `${JSON.stringify({ session_id: `axr7-${input.name}`, run_id: `axr7-${input.name}`, stop_hook_active: false })}\n`,
      timeoutMs: 150_000,
    });
    const afterReceipts = receiptFiles(fixture);
    const created = afterReceipts.filter((path) => !beforeReceipts.includes(path));
    if (created.length !== 1) throw new Error(`${input.name} expected one durable projection receipt, got ${created.length}`);
    const receipt = JSON.parse(readFileSync(join(fixture, ".ai", "harness", "architecture-projection", "receipts", created[0]!), "utf8")) as any;
    const beforeNoop = architectureDigest(fixture);
    const rerun = JSON.parse(run(repoHarnessCli, ["architecture-projection", "apply", "--json"], fixture, {
      env: childEnv,
      timeoutMs: 120_000,
    }).stdout) as any;
    const afterNoop = architectureDigest(fixture);
    if (beforeNoop !== afterNoop || (rerun.files?.length ?? -1) !== 0 || (rerun.humanActions?.length ?? -1) !== 0) {
      throw new Error(`${input.name} second apply was not a byte-noop: ${JSON.stringify({ beforeNoop, afterNoop, status: rerun.status, files: rerun.files?.length, humanActions: rerun.humanActions?.length })}`);
    }
    return {
      name: input.name,
      changedPaths: [...input.paths].sort(),
      receipt: { jobId: receipt.jobId, digest: receipt.result?.receiptDigest, status: receipt.result?.status },
      refreshReceiptDigests: receipt.refreshReceiptDigests ?? [],
      rerun: { status: rerun.status, files: rerun.files.length, humanActions: rerun.humanActions.length, byteNoop: true },
    };
  }
} finally {
  if (installedArchctx && fixtureRoot) spawnSync(installedArchctx, ["daemon", "stop"], { cwd: fixtureRoot, encoding: "utf8", stdio: "ignore" });
  if (!keep) rmSync(workspace, { recursive: true, force: true });
  else process.stderr.write(`[AXR7] preserved disposable workspace: ${workspace}\n`);
}

function initializeFixture(target: string): void {
  for (const path of ["src", "scripts", "assets", ".archcontext", "docs/architecture"]) {
    cpSync(join(repoRoot, path), join(target, path), { recursive: true });
  }
  for (const path of ["AGENTS.md", "CLAUDE.md", "README.md", "package.json"]) cpSync(join(repoRoot, path), join(target, path));
  mkdirSync(join(target, ".ai", "harness"), { recursive: true });
  cpSync(join(repoRoot, ".ai", "harness", "policy.json"), join(target, ".ai", "harness", "policy.json"));
  cpSync(join(repoRoot, "assets", "workflow-contract.v1.json"), join(target, ".ai", "harness", "workflow-contract.json"));
  const html = filesUnder(join(target, "docs", "architecture")).filter((path) => path.endsWith(".html"));
  if (html.length > 0) throw new Error(`fixture contains HTML architecture artifacts: ${html.map((path) => relative(target, path)).join(", ")}`);
  run("git", ["init"], target);
  run("git", ["config", "user.email", "axr7@example.invalid"], target);
  run("git", ["config", "user.name", "AXR7 Consumer E2E"], target);
  run("git", ["add", "."], target);
  run("git", ["commit", "-m", "AXR7 clean-room fixture"], target);
}

function capabilityEntrypoints(root: string): string[] {
  return filesUnder(join(root, ".archcontext", "model", "nodes"))
    .filter((path) => basename(path).startsWith("capability.") && path.endsWith(".yaml"))
    .map((path) => Bun.YAML.parse(readFileSync(path, "utf8")) as any)
    .map((node) => node.source?.entrypoints?.[0]?.path)
    .filter((path): path is string => typeof path === "string" && existsSync(join(root, path)))
    .sort();
}

function receiptFiles(root: string): string[] {
  const directory = join(root, ".ai", "harness", "architecture-projection", "receipts");
  return existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".json")).sort() : [];
}

function architectureDigest(root: string): string {
  const hash = createHash("sha256");
  for (const path of filesUnder(join(root, "docs", "architecture"))) {
    hash.update(relative(root, path));
    hash.update(readFileSync(path));
  }
  return `sha256:${hash.digest("hex")}`;
}

function packRepoHarness(artifacts: string): { tarball: string; integrity: string } {
  const [packed] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", artifacts], repoRoot).stdout) as Array<{ filename?: string; integrity?: string; version?: string }>;
  if (!packed?.filename || !packed.integrity || packed.version !== REPO_HARNESS_VERSION) {
    throw new Error(`repo-harness npm pack did not return ${REPO_HARNESS_VERSION} as one integrity-bound artifact`);
  }
  return { tarball: join(artifacts, packed.filename), integrity: packed.integrity };
}

function packArchctx(checkout: string, artifacts: string): { tarball: string; integrity: string } {
  const evidence = join(checkout, "axr7-archctx-pack.json");
  const release = JSON.parse(run("bun", [
    "scripts/fg6-npm-release-dry-run.ts", "run", "--artifact-dir", artifacts, "--out", evidence, "--json",
  ], checkout, { timeoutMs: 240_000 }).stdout) as any;
  if (release.ok !== true || release.package?.version !== VERSION || !release.artifact?.tarball || !release.artifact?.integrity) {
    throw new Error(`archctx pack failed: ${JSON.stringify(release.failures ?? release)}`);
  }
  return { tarball: join(artifacts, release.artifact.tarball), integrity: release.artifact.integrity };
}

function packContracts(checkout: string, artifacts: string): { tarball: string; integrity: string } {
  const stage = join(workspace, "contracts-stage");
  mkdirSync(stage, { recursive: true });
  cpSync(join(checkout, "packages", "contracts", "src"), join(stage, "src"), { recursive: true });
  cpSync(join(checkout, "packages", "contracts", "fixtures"), join(stage, "fixtures"), { recursive: true });
  cpSync(join(checkout, "schemas"), join(stage, "schemas"), { recursive: true });
  writeFileSync(join(stage, "package.json"), `${JSON.stringify({
    name: "archctx-contracts",
    version: VERSION,
    private: false,
    type: "module",
    license: "Apache-2.0",
    files: ["src", "fixtures", "schemas"],
    exports: { ".": "./src/index.ts", "./schemas/*": "./schemas/*" },
  }, null, 2)}\n`);
  const [packed] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", artifacts], stage).stdout) as Array<{ filename?: string; integrity?: string }>;
  if (!packed?.filename || !packed.integrity) throw new Error("contracts npm pack did not return one integrity-bound artifact");
  return { tarball: join(artifacts, packed.filename), integrity: packed.integrity };
}

function extractRevision(target: string): void {
  const archive = spawnSync("git", ["archive", "--format=tar", revision], { cwd: archContextRoot, encoding: null, maxBuffer: 100 * 1024 * 1024 });
  if (archive.status !== 0 || !archive.stdout) throw new Error(`git archive failed: ${String(archive.stderr)}`);
  const extract = spawnSync("tar", ["-xf", "-", "-C", target], { input: archive.stdout, encoding: null, maxBuffer: 100 * 1024 * 1024 });
  if (extract.status !== 0) throw new Error(`tar extract failed: ${String(extract.stderr)}`);
}

function prepareReleaseVersion(checkout: string): void {
  setPackageVersion(join(checkout, "package.json"), VERSION);
  for (const packageName of readdirSync(join(checkout, "packages"))) {
    const manifest = join(checkout, "packages", packageName, "package.json");
    if (existsSync(manifest)) setPackageVersion(manifest, VERSION);
  }
  const path = join(checkout, "packages", "contracts", "src", "product-version.ts");
  const source = readFileSync(path, "utf8");
  if (!/export const ARCHCONTEXT_PRODUCT_VERSION = "[^"]+";/.test(source)) {
    throw new Error("ArchContext product version declaration is missing");
  }
  const updated = source.replace(/export const ARCHCONTEXT_PRODUCT_VERSION = "[^"]+";/, `export const ARCHCONTEXT_PRODUCT_VERSION = "${VERSION}";`);
  writeFileSync(path, updated);
}

function linkBuildDependencies(checkout: string): void {
  const sourceModules = join(archContextRoot, "node_modules");
  const targetModules = join(checkout, "node_modules");
  mkdirSync(targetModules, { recursive: true });
  for (const name of readdirSync(sourceModules)) {
    if (name === "@archcontext") continue;
    symlinkSync(join(sourceModules, name), join(targetModules, name), "dir");
  }
  const targetScope = join(targetModules, "@archcontext");
  mkdirSync(targetScope, { recursive: true });
  const workspaces = JSON.parse(readFileSync(join(checkout, "package.json"), "utf8")).workspaces as unknown;
  if (!Array.isArray(workspaces) || workspaces.length === 0) throw new Error("producer declares no workspaces");
  const checkoutRoot = realpathSync(checkout);
  for (const workspaceDir of workspaces) {
    if (typeof workspaceDir !== "string") throw new Error(`workspace entry is not a string: ${String(workspaceDir)}`);
    const packageDir = realpathSync(join(checkout, workspaceDir));
    if (!inside(packageDir, checkoutRoot)) throw new Error(`workspace package escapes producer root: ${workspaceDir}`);
    const packageName = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).name as unknown;
    if (typeof packageName !== "string" || !packageName.startsWith("@archcontext/")) {
      throw new Error(`unexpected producer workspace package name: ${String(packageName)}`);
    }
    symlinkSync(packageDir, join(targetScope, packageName.slice("@archcontext/".length)), "dir");
  }
}

function setPackageVersion(path: string, version: string): void {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
}

function filesUnder(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((name) => join(root, name))
    .flatMap((path) => statSync(path).isDirectory() ? filesUnder(path) : [path])
    .sort();
}

function inside(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function envelope(stdout: string): any {
  return JSON.parse(stdout);
}

function run(command: string, args: string[], cwd: string, options: { env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number } = {}): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024,
    timeout: options.timeoutMs ?? 120_000,
  });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error?.message ?? result.signal ?? result.status}; ${String(result.stderr || result.stdout).trim().slice(0, 4000)}`);
  }
  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function git(cwd: string, args: string[]): string {
  return run("git", args, cwd).stdout.trim();
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
