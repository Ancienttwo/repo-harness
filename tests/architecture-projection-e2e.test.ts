import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ARCHITECTURE_DOCS_PROJECTION_MANIFEST_SCHEMA_VERSION,
  ARCHITECTURE_DOCS_RENDERER_VERSION,
  architectureDocsProjectionManifestIssues,
  type ArchitectureDocsProjectionManifestV3,
} from "archctx-contracts";
import { devDependencies } from "../package.json";
import { architectureModulePathFor } from '../src/core/capabilities/registry';

const ROOT = join(import.meta.dir, "..");

function filesUnder(root: string): string[] {
  return readdirSync(root)
    .map((name) => join(root, name))
    .flatMap((path) => statSync(path).isDirectory() ? filesUnder(path) : [path])
    .sort();
}

function yamlFiles(directory: string): Record<string, unknown>[] {
  return filesUnder(directory)
    .filter((path) => path.endsWith(".yaml") || path.endsWith(".yml"))
    .map((path) => Bun.YAML.parse(readFileSync(path, "utf8")) as Record<string, unknown>);
}

describe("AXR7 repo-harness architecture consumer", () => {
  test("has one reviewed component and at least one reviewed relation/required flow for every capability", () => {
    const modelRoot = join(ROOT, ".archcontext", "model");
    const nodes = yamlFiles(join(modelRoot, "nodes"));
    const capabilities = nodes.filter((node) => node.kind === "capability");
    const components = nodes.filter((node) => node.kind === "component");
    const relations = yamlFiles(join(modelRoot, "relations"));
    const flows = yamlFiles(join(modelRoot, "flows"));

    expect(capabilities.length).toBeGreaterThan(0);
    expect(new Set(capabilities.map(node => node.id)).size).toBe(capabilities.length);
    expect(new Set(components.map(node => node.parent))).toEqual(new Set(capabilities.map(node => node.id)));
    // Structure, not inventory: a model change needs no edit here.
    for (const entries of [nodes, relations, flows]) {
      expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length);
    }
    expect(relations.length).toBeGreaterThan(0);
    expect(flows.every((flow) => flow.schemaVersion === "archcontext.flow/v1")).toBe(true);
    expect(flows.every((flow) => flow.applicability === "required")).toBe(true);
    expect(new Set(flows.map((flow) => flow.capabilityId))).toEqual(new Set(capabilities.map((node) => node.id)));
  });

  test("projects every model capability as a Mermaid-only document and no HTML architecture artifact", () => {
    const architectureRoot = join(ROOT, "docs", "architecture");
    const moduleDocs = filesUnder(join(architectureRoot, "modules")).filter((path) => path.endsWith(".md"));
    const html = filesUnder(architectureRoot).filter((path) => path.endsWith(".html"));

    const capabilities = yamlFiles(join(ROOT, ".archcontext", "model", "nodes")).filter(node => node.kind === "capability");
    const expectedPaths = capabilities.map(node => {
      const [, domain, name] = String(node.id).split('.');
      return architectureModulePathFor(domain, name);
    }).sort();
    expect(moduleDocs.map(path => relative(ROOT, path)).sort()).toEqual(expectedPaths);
    expect(html.map((path) => relative(ROOT, path))).toEqual([]);
    for (const path of moduleDocs) {
      const body = readFileSync(path, "utf8");
      expect(body.match(/^```mermaid$/gm)?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(body.match(/^flowchart (?:LR|TD)$/gm)).toHaveLength(1);
      expect(body.match(/^sequenceDiagram$/gm)?.length ?? 0).toBeGreaterThanOrEqual(1);
      expect(body).toContain('"actorTextColor":"#ffffff"');
      expect(body).toContain('"signalTextColor":"#e5e7eb"');
      expect(body).toContain("- Proof: `proven`");
      expect(body).toContain("> **Proof**: `proven`");
      expect(body).not.toContain("human-action-required");
      expect(body).not.toMatch(/<(?:html|body|style|svg|div)\b/i);
    }
  });

  test("binds the projection to exact renderer, layout, CodeGraph, and source digests", () => {
    const manifestPath = join(ROOT, "docs", "architecture", ".projection-manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ArchitectureDocsProjectionManifestV3;
    expect(architectureDocsProjectionManifestIssues(manifest)).toEqual([]);
    expect(manifest.schemaVersion).toBe(ARCHITECTURE_DOCS_PROJECTION_MANIFEST_SCHEMA_VERSION);
    expect(manifest.profile).toBe("repo-harness/v1");
    expect(manifest.rendererVersion).toBe(ARCHITECTURE_DOCS_RENDERER_VERSION);
    expect(manifest.layoutVersion).toBe("archcontext.docs-layout/v1");
    // The manifest keeps only the reproducible CodeGraph identity, not the local index state.
    expect(manifest.generatedFrom).toEqual({ codeGraphPackage: "@colbymchenry/codegraph", codeGraphVersion: devDependencies["@colbymchenry/codegraph"] });
    expect(manifest.semanticBaseline.modelDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const stamps = Object.values(manifest.targets).flatMap((target) => Object.values(target.sourceStamps ?? {}));
    expect(stamps.length).toBeGreaterThan(0);
    for (const stamp of stamps) expect(stamp).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("accepts paired runtime topology source stamps from the installed contracts", () => {
    const manifest = topologyManifest();
    expect(architectureDocsProjectionManifestIssues(manifest)).toEqual([]);
  });

  test("rejects unequal topology source stamps", () => {
    const manifest = topologyManifest();
    manifest.targets["runtime-summary"]!.sourceStamps!["process.example.worker"] = `sha256:${"b".repeat(64)}`;
    expect(architectureDocsProjectionManifestIssues(manifest).some(issue => issue.includes("must equal the sourceStamps"))).toBe(true);
  });

  test("rejects topology source stamps duplicated on an entity summary", () => {
    const manifest = topologyManifest();
    const entity = Object.values(manifest.targets).find(row => row.type === "entity-summary")!;
    entity.sourceStamps = { ...entity.sourceStamps, "process.example.worker": `sha256:${"a".repeat(64)}` };
    expect(architectureDocsProjectionManifestIssues(manifest).some(issue => issue.includes("is already stamped on"))).toBe(true);
  });

  test("rejects capability scale on runtime topology targets", () => {
    const manifest = topologyManifest();
    manifest.targets["runtime-summary"]!.scale = { fileCountBucket: { lower: 1, upper: 2 }, lineCountBucket: { lower: 10, upper: 20 } };
    expect(architectureDocsProjectionManifestIssues(manifest).some(issue => issue.includes("scale is only allowed on entity-summary"))).toBe(true);
  });

  test("authors no repository architecture policy or host projection preferences", () => {
    const policy = JSON.parse(readFileSync(join(ROOT, ".ai", "harness", "policy.json"), "utf8"));
    expect(policy.context.capability_source).toBe("archcontext");
    // Projection preferences live in ~/.repo-harness/config.json. The generated
    // repository architecture keys had no reader and adoption retires them.
    expect(policy.architecture).toBeUndefined();
  });
});

function topologyManifest(): ArchitectureDocsProjectionManifestV3 {
  const manifest = JSON.parse(readFileSync(join(ROOT, "docs", "architecture", ".projection-manifest.json"), "utf8")) as ArchitectureDocsProjectionManifestV3;
  for (const [id, type, path, format] of [
    ["runtime-diagram", "diagram-runtime-topology", "docs/architecture/runtime.mmd", "mermaid"],
    ["runtime-summary", "runtime-topology-summary", "docs/architecture/runtime.md", "markdown"],
  ] as const) {
    manifest.targets[id] = {
      type, scope: { kind: "repository" }, path, format, ownership: "generated",
      outputDigest: `sha256:${"c".repeat(64)}`,
      sourceStamps: { "process.example.worker": `sha256:${"a".repeat(64)}` },
    };
  }
  return manifest;
}
