import { describe, test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_DIR = join(ROOT, "assets/reference-configs");
const PROJECTION_DIR = join(ROOT, "docs/reference-configs");

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

describe("reference-configs projection", () => {
  // This loop replaces the scattered per-file equality assertions that used to live in
  // readme-dx / ux-feature-guardrail / global-working-rules-distribution / sprint-backlog.
  // It reads the filesystem directly rather than importing scripts/sync-reference-configs.ts,
  // so it stays an independent guard instead of restating the tool's own logic.
  test("every assets/reference-configs doc has a byte-identical docs/reference-configs projection", () => {
    const sources = markdownFiles(SOURCE_DIR);
    expect(sources.length).toBeGreaterThan(0);

    const drift: string[] = [];
    for (const name of sources) {
      const projectionPath = join(PROJECTION_DIR, name);
      if (!existsSync(projectionPath)) {
        drift.push(`missing projection: docs/reference-configs/${name}`);
        continue;
      }
      if (!readFileSync(projectionPath).equals(readFileSync(join(SOURCE_DIR, name)))) {
        drift.push(`content drift: docs/reference-configs/${name}`);
      }
    }

    expect(
      drift,
      "assets/reference-configs is the source; run bun run sync:reference-configs after editing it",
    ).toEqual([]);
  });

  // #1227 retired six duplicated flow documents. The projection accepts
  // docs-only files, so a retired document that returns to docs/ would not
  // fail the mirror test above. This list makes the retirement explicit.
  const RETIRED_FLOW_DOCS = [
    "handoff-protocol.md",
    "workflow-orchestration.md",
    "development-protocol.md",
    "sprint-contracts.md",
    "contract-brief-example.md",
    "contract-brief-example-bugfix.md",
  ];

  test("retired flow docs stay out of both mirrors", () => {
    const present: string[] = [];
    for (const dir of [SOURCE_DIR, PROJECTION_DIR]) {
      for (const name of RETIRED_FLOW_DOCS) {
        if (existsSync(join(dir, name))) present.push(`${dir}/${name}`);
      }
    }
    expect(present).toEqual([]);
  });

  // docs/reference-configs additionally carries docs-only material (install profiles,
  // MCP guides) that never ships in assets. Those are outside the mirror by design, so
  // the projection is one-directional and must not delete them.
  test("docs-only reference configs stay outside the mirror", () => {
    const sources = new Set(markdownFiles(SOURCE_DIR));
    const docsOnly = markdownFiles(PROJECTION_DIR).filter((name) => !sources.has(name));
    expect(docsOnly.length).toBeGreaterThan(0);
    for (const name of docsOnly) {
      expect(existsSync(join(SOURCE_DIR, name))).toBe(false);
    }
  });
});

const FLOW_DOC = "agentic-development-flow.md";
const HAZARD_ANCHOR = "#change-hazards";
const CHECK_REF = join(ROOT, "assets/skill-commands/repo-harness-check/references/pr-verification.md");

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = markdown.slice(start + heading.length);
  const end = rest.search(/\n#{2,3} /);
  return rest.slice(0, end < 0 ? undefined : end);
}

describe("change hazard list", () => {
  test("both flow mirrors hold one list with each hazard class", () => {
    for (const dir of [SOURCE_DIR, PROJECTION_DIR]) {
      const doc = readFileSync(join(dir, FLOW_DOC), "utf-8");
      expect(doc.split("### Change hazards").length - 1).toBe(1);
      const hazards = section(doc, "### Change hazards");
      for (const marker of [
        "`.github/`",
        "release, publish, update or install script",
        "`Dockerfile`",
        "network address",
        "telemetry",
        "credentials",
        "dependency or a lockfile entry",
        "binary",
        "encoded or opaque blob",
      ]) {
        expect(hazards, marker).toContain(marker);
      }
    }
  });

  test("Review by risk and the external protocol link the shared list", () => {
    const flow = readFileSync(join(PROJECTION_DIR, FLOW_DOC), "utf-8");
    const highRow = flow.split("\n").find((line) => line.startsWith("| High |"));
    expect(highRow).toContain(`(${HAZARD_ANCHOR})`);
    expect(section(flow, "### External PR flow")).toContain(`(${HAZARD_ANCHOR})`);

    const check = readFileSync(CHECK_REF, "utf-8");
    expect(check).toContain(`(docs/reference-configs/${FLOW_DOC}${HAZARD_ANCHOR})`);
  });

  test("the external protocol keeps its stop behavior and holds no second list", () => {
    const check = readFileSync(CHECK_REF, "utf-8");
    expect(check).toContain("On a stop, report each triggering `file:line`");
    expect(check).toContain("Escalate to the repository owner");
    for (const marker of ["- changes `.github/`", "adds a network endpoint", "adds an encoded or opaque blob"]) {
      expect(check).not.toContain(marker);
    }
  });
});
