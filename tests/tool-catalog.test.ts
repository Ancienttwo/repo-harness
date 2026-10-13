import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import catalogJson from "../assets/tool-catalog.v1.json";
import { decodeToolCatalog, TOOL_CATALOG, toolStatus } from "../src/core/tools/catalog";
import { renderToolCatalogRegion } from "../scripts/sync-reference-configs";

const ROOT = join(import.meta.dir, "..");
const DOC = readFileSync(join(ROOT, "assets/reference-configs/external-tooling.md"), "utf8");

/** A deep copy of the packaged catalog with one tool changed. */
function withTool(index: number, change: (tool: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(catalogJson) as { tools: Record<string, unknown>[] };
  change(copy.tools[index]!);
  return copy;
}

const RESOURCE = catalogJson.tools.findIndex((tool) => tool.kind === "resource");
const LOCAL = catalogJson.tools.findIndex((tool) => tool.kind === "local_tool");

describe("tool catalog decode", () => {
  test("the packaged catalog decodes and holds the P0 entries", () => {
    expect(decodeToolCatalog(catalogJson)).toEqual(TOOL_CATALOG);
    const entries = TOOL_CATALOG.tools.map((tool) => [tool.id, tool.kind, tool.detector]);
    expect(entries).toEqual([
      ["waza", "local_tool", "waza"],
      ["codegraph", "local_tool", "codegraph"],
      ["herdr-skill", "local_tool", "herdr_skill"],
      ["hai-stack", "local_tool", null],
      ["shaders", "resource", null],
      ["awesome-design-md", "resource", null],
    ]);
  });

  test("an extra or missing key fails", () => {
    expect(() => decodeToolCatalog(withTool(0, (tool) => { tool.install_command = "bun add x"; }))).toThrow("tool fields");
    expect(() => decodeToolCatalog(withTool(0, (tool) => { delete tool.license; }))).toThrow("tool fields");
    expect(() => decodeToolCatalog({ ...catalogJson, extra: true })).toThrow("catalog fields");
  });

  test("an unknown kind or category fails", () => {
    expect(() => decodeToolCatalog(withTool(0, (tool) => { tool.kind = "plugin"; }))).toThrow("kind");
    expect(() => decodeToolCatalog(withTool(0, (tool) => { tool.category = "testing"; }))).toThrow("category");
  });

  test("a url that is not plain https fails", () => {
    for (const url of ["http://github.com/tw93/Waza", "https://user:secret@github.com/tw93/Waza", "github.com/tw93/Waza", "https://github.com/a b"]) {
      expect(() => decodeToolCatalog(withTool(0, (tool) => { tool.url = url; }))).toThrow("url");
    }
  });

  test("a resource with a detector fails; a local tool may have none", () => {
    expect(() => decodeToolCatalog(withTool(RESOURCE, (tool) => { tool.detector = "waza"; }))).toThrow("detector");
    expect(() => decodeToolCatalog(withTool(LOCAL, (tool) => { tool.detector = null; }))).not.toThrow();
  });

  test("a duplicate id fails", () => {
    expect(() => decodeToolCatalog(withTool(1, (tool) => { tool.id = catalogJson.tools[0]!.id; }))).toThrow("duplicate tool id");
  });

  test("text that would break the markdown table fails", () => {
    expect(() => decodeToolCatalog(withTool(0, (tool) => { tool.summary = { en: "a | b", zh: "x" }; }))).toThrow("summary.en");
    expect(() => decodeToolCatalog(withTool(0, (tool) => { tool.name = "`Waza`"; }))).toThrow("name");
  });
});

describe("tool status", () => {
  test("a tool with a detector key is unknown; resources and tools without a detector are n/a", () => {
    const status = Object.fromEntries(TOOL_CATALOG.tools.map((tool) => [tool.id, toolStatus(tool)]));
    expect(status).toEqual({
      waza: "unknown", codegraph: "unknown", "herdr-skill": "unknown", "hai-stack": "na", shaders: "na", "awesome-design-md": "na",
    });
  });
});

describe("external-tooling.md resource table", () => {
  test("the canonical doc matches the catalog", () => {
    expect(renderToolCatalogRegion(DOC, TOOL_CATALOG)).toBe(DOC);
  });

  test("a catalog change without --write is drift", () => {
    const changed = decodeToolCatalog(withTool(RESOURCE, (tool) => { tool.license = "Apache-2.0"; }));
    expect(renderToolCatalogRegion(DOC, changed)).not.toBe(DOC);
  });

  test("a hand edit inside the region is drift", () => {
    const edited = DOC.replace("| MIT |\n<!-- tool-catalog:resources:end -->", "| BSD |\n<!-- tool-catalog:resources:end -->");
    expect(edited).not.toBe(DOC);
    expect(renderToolCatalogRegion(edited, TOOL_CATALOG)).not.toBe(edited);
  });

  test("a missing or duplicated marker fails instead of skipping the table", () => {
    expect(() => renderToolCatalogRegion(DOC.replace("<!-- tool-catalog:resources:end -->", ""), TOOL_CATALOG)).toThrow("exactly one");
    expect(() => renderToolCatalogRegion(DOC.replace("<!-- tool-catalog:resources:begin -->", ""), TOOL_CATALOG)).toThrow("exactly one");
    expect(() => renderToolCatalogRegion(`${DOC}\n<!-- tool-catalog:resources:begin -->\n`, TOOL_CATALOG)).toThrow("exactly one");
  });
});
