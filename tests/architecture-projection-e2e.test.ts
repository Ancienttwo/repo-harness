import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

    expect(capabilities).toHaveLength(27);
    expect(components).toHaveLength(29);
    // C4 declared the collaboration -> delegated-runs relation and the
    // delegated-contribution flow; C6 adds the collaboration -> bound-task-freezes
    // relation its read-time succession proof crosses, and the context-delivery
    // flow. Both counts are inventory pins: a legitimate model addition is a red
    // test until the pin moves with it, which is the point. Multiple flows per
    // capability was already the norm.
    expect(relations).toHaveLength(58);
    expect(flows).toHaveLength(35);
    expect(flows.every((flow) => flow.schemaVersion === "archcontext.flow/v1")).toBe(true);
    expect(flows.every((flow) => flow.applicability === "required")).toBe(true);
    expect(new Set(flows.map((flow) => flow.capabilityId))).toEqual(new Set(capabilities.map((node) => node.id)));
  });

  test("projects twenty-seven Mermaid-only capability documents and no HTML architecture artifact", () => {
    const architectureRoot = join(ROOT, "docs", "architecture");
    const moduleDocs = filesUnder(join(architectureRoot, "modules")).filter((path) => path.endsWith(".md"));
    const html = filesUnder(architectureRoot).filter((path) => path.endsWith(".html"));

    expect(moduleDocs).toHaveLength(27);
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
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      profile?: string;
      targetCount?: number;
      provenance?: {
        rendererVersion?: string;
        layoutVersion?: string;
        indexedWorktreeDigest?: string | null;
        projectionInputDigest?: string;
        generatedFrom?: { codeGraphVersion?: string; codeGraphStatus?: string };
      };
    };
    expect(manifest.profile).toBe("repo-harness/v1");
    expect(manifest.targetCount).toBe(33);
    expect(manifest.provenance?.rendererVersion).toBe("archcontext.docs-renderer/v4");
    expect(manifest.provenance?.layoutVersion).toBe("archcontext.docs-layout/v1");
    expect(manifest.provenance?.generatedFrom).toMatchObject({ codeGraphVersion: "1.5.0", codeGraphStatus: "ready" });
    expect(manifest.provenance?.indexedWorktreeDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(manifest.provenance?.projectionInputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("keeps the self-hosted consumer in automatic apply with strict gates", () => {
    const policy = JSON.parse(readFileSync(join(ROOT, ".ai", "harness", "policy.json"), "utf8"));
    expect(policy.context.capability_source).toBe("archcontext");
    expect(policy.architecture.projection_provider).toBe("archctx");
    expect(policy.architecture.projection_apply).toBe("automatic");
    expect(policy.architecture.projection_failure_gate).toBe("strict");
    expect(policy.architecture.freshness_gate).toBe("strict");
    expect(policy.architecture.diagram_skill).toBe("mermaid");
    expect(policy.architecture.vendoring_policy).toBe("do-not-vendor-diagram-skill-assets");
  });
});
