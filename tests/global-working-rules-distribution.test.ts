import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { normalizeMinimalChangePolicy } from "../src/cli/hook/minimal-change-policy";
import { renderMinimalChangeSessionContext } from "../src/cli/hook/minimal-change-context";

const ROOT = join(import.meta.dir, "..");
const ASSETS_TEMPLATE = join(ROOT, "assets/reference-configs/global-working-rules.md");
const DOCS_MIRROR = join(ROOT, "docs/reference-configs/global-working-rules.md");
const PROJECT_INIT_LIB = join(ROOT, "scripts/lib/project-init-lib.sh");

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function extractFence(raw: string): string {
  const match = raw.match(/```md\n([\s\S]*?)\n```/);
  if (!match) throw new Error("global-working-rules.md is missing the ```md fence");
  return match[1];
}

describe("global working rules distribution", () => {
  test("assets template fence carries the No Compatibility Fallbacks section", () => {
    const fence = extractFence(readFileSync(ASSETS_TEMPLATE, "utf-8"));
    expect(fence).toContain("## No Compatibility Fallbacks in Product Code");
    expect(fence).toContain("do not re-derive the same semantic data");
  });

  test("assets template fence carries the Rule 0 reasoning and generality rules", () => {
    const fence = extractFence(readFileSync(ASSETS_TEMPLATE, "utf-8"));
    expect(fence).toContain("Rule 0: You may spend as much time as needed thinking.");
    expect(fence).toContain("Reasoning: Prefer first principles over pattern matching.");
    expect(fence).toContain("Generality: These are general working rules.");
  });

  test("assets template fence carries the code optimization authority rules", () => {
    const fence = extractFence(readFileSync(ASSETS_TEMPLATE, "utf-8"));
    expect(fence).toContain("## Code Optimization Principles");
    expect(fence).toContain("Keep one source of truth for each datum");
    expect(fence).toContain("Forbid steady-state compatibility behavior");
    expect(fence).toContain("serves at least two real consumers");
    expect(fence).toContain("do not convert a single-package repository into a monorepo");
    expect(fence).toContain("operator-invoked, fail closed");
  });

  test("the two previously duplicated 下一刀 sentences are deduplicated to one occurrence each", () => {
    const raw = readFileSync(ASSETS_TEMPLATE, "utf-8");
    expect(countOccurrences(raw, "include a short `下一刀` section")).toBe(1);
    expect(
      countOccurrences(
        raw,
        "It must be one concrete, bounded next slice derived from verified state: active plan, todo, handoff, failing checks, review gaps, deployment state, unresolved risk, or observed system behavior.",
      ),
    ).toBe(1);
  });

  test("docs/reference-configs mirror is byte-identical to the assets source", () => {
    expect(readFileSync(DOCS_MIRROR, "utf-8")).toBe(readFileSync(ASSETS_TEMPLATE, "utf-8"));
  });

  test("renderMinimalChangeSessionContext carries the no-fallback rule within budget", () => {
    const policy = normalizeMinimalChangePolicy({ mode: "advice", max_context_words: 180 });
    const context = renderMinimalChangeSessionContext(policy);
    expect(context).toContain("Reason from first principles");
    expect(context).toContain("No compatibility fallbacks");
    expect(context).toContain("one source of truth per datum");
    expect(context).toContain("at least two real consumers");
    expect(context).toContain("monorepo workspace");
    expect(context).toContain("fail closed");
  });

  test("generated root context carries the same code optimization constraints", () => {
    const source = readFileSync(PROJECT_INIT_LIB, "utf-8");
    expect(source).toContain("Keep one source of truth for each datum");
    expect(source).toContain("Do not add steady-state compatibility paths");
    expect(source).toContain("serves at least two real consumers");
    expect(source).toContain("do not create a monorepo without a second independently released or deployed consumer");
  });
});
