import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { writeGlobalContextFiles } from "../src/cli/commands/init";
import {
  inspectGlobalContext,
  mergeManagedBlock,
  renderGlobalRulesBlock,
  SHIPPED_GLOBAL_RULES_H1,
  SHIPPED_GLOBAL_RULES_SECTIONS,
  type ReportingLanguagePreset,
} from "../src/cli/installer/global-context";

const ROOT = join(import.meta.dir, "..");
const ASSETS_TEMPLATE = join(ROOT, "assets/reference-configs/global-working-rules.md");
const STANDARD_PLAN = join(ROOT, "src/core/adoption/standard-plan.ts");

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

describe("global working rules distribution", () => {
  test("the two previously duplicated completion-summary sentences are deduplicated to one occurrence each", () => {
    const raw = readFileSync(ASSETS_TEMPLATE, "utf-8");
    expect(countOccurrences(raw, "include a short `Next cut` section")).toBe(1);
    expect(
      countOccurrences(
        raw,
        "It must be one concrete, bounded next slice derived from verified state: active plan, todo, handoff, failing checks, review gaps, deployment state, unresolved risk, or observed system behavior.",
      ),
    ).toBe(1);
  });

  /**
   * The managed block is English except for the completion-summary label, which
   * a Chinese-reporting user reads as a literal section title. Rendering is
   * driven by the init reporting preset, so both directions are pinned here.
   */
  function renderedManagedBlock(preset: ReportingLanguagePreset, instruction: string): string {
    const home = mkdtempSync(join(tmpdir(), "repo-harness-global-rules-"));
    try {
      const result = writeGlobalContextFiles(
        ROOT,
        "codex",
        { reportLanguageInstruction: instruction, reportLanguagePreset: preset },
        { ...process.env, HOME: home },
      );
      expect(result.status).toBe("ok");
      return readFileSync(join(home, ".codex", "AGENTS.md"), "utf-8");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }

  test("the default rendering keeps the English completion-summary label", () => {
    const rendered = renderedManagedBlock("en", "Use English to report to user.");
    expect(countOccurrences(rendered, "include a short `Next cut` section")).toBe(1);
    expect(rendered).toContain(
      "Use `Next cut: <direction>. Reason: <open loop>. Entry: <path/command/verification surface>.`",
    );
    expect(rendered).not.toContain("下一刀");
  });

  test("the managed block carries the Herdr side-by-side pane layout rule", () => {
    const rendered = renderedManagedBlock("en", "Use English to report to user.");
    expect(rendered).toContain("put at most 3 panes side by side in one tab");
    expect(rendered).toContain("never split down");
  });

  test("the zh-CN rendering substitutes the completion-summary label once per mention", () => {
    const rendered = renderedManagedBlock("zh-CN", "Use Chinese to report to user.");
    expect(countOccurrences(rendered, "include a short `下一刀` section")).toBe(1);
    expect(rendered).toContain("Use `下一刀: <direction>. Reason: <open loop>. Entry: <path/command/verification surface>.`");
    expect(rendered).not.toContain("Next cut");
  });

  // Sync replaces legacy copies only by exact shipped title. A template
  // section missing from the list would be kept as user content forever.
  test("the shipped section title list covers every heading of the managed template", () => {
    const raw = readFileSync(ASSETS_TEMPLATE, "utf-8");
    const template = raw.match(/```md\n([\s\S]*?)\n```/)?.[1] ?? "";
    const h1 = [...template.matchAll(/^# (.+?)\s*$/gm)].map((match) => match[1]);
    const h2 = [...template.matchAll(/^## (.+?)\s*$/gm)].map((match) => match[1]);
    expect(h1).toEqual([SHIPPED_GLOBAL_RULES_H1]);
    expect(h2.length).toBeGreaterThan(0);
    for (const title of h2) expect(SHIPPED_GLOBAL_RULES_SECTIONS).toContain(title);
  });

  test("a heading inside a fence is not a section, and only the same fence closes it", () => {
    const content = ["## Mine", "```", "~~~", "## Reporting", "```", "end", ""].join("\n");
    expect(inspectGlobalContext(content, ROOT).state).toBe("no-rules");
    const block = renderGlobalRulesBlock(ROOT, { preset: "en", instruction: "Use English to report to user." });
    const merged = mergeManagedBlock(content, block);
    expect(merged.replaced).toEqual([]);
    expect(merged.content).toBe(`${content.trimEnd()}\n\n${block}`);
  });

  test("the rendered block records its reporting-language inputs", () => {
    const rendered = renderedManagedBlock("zh-CN", "Use Chinese to report to user.");
    expect(rendered).toContain(
      '<!-- repo-harness reporting-language: {"preset":"zh-CN","instruction":"Use Chinese to report to user."} -->',
    );
  });

  test("the global rules template and the generated root context carry the code optimization constraints", () => {
    const rules = readFileSync(ASSETS_TEMPLATE, "utf-8");
    expect(rules).toContain("Keep one source of truth for each datum");
    expect(rules).toContain("serves at least two real consumers");
    expect(rules).toContain(
      "do not convert a single-package repository into a monorepo without a second independently released or deployed consumer",
    );
    expect(rules).toContain("Forbid steady-state compatibility behavior");

    const rootContext = readFileSync(STANDARD_PLAN, "utf-8");
    expect(rootContext).toContain("one source of truth, and no steady-state compatibility paths");
  });
});
