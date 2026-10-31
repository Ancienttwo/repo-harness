import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, readFileSync } from "fs";
import { join } from "path";
import {
  formatGlobalContextWrite,
  inspectGlobalContext,
  mergeManagedBlock,
  renderGlobalRulesBlock,
  SHIPPED_GLOBAL_RULES_H1,
  SHIPPED_GLOBAL_RULES_SECTIONS,
  type ReportingLanguagePreset,
} from "../src/cli/installer/global-context";

const ROOT = join(import.meta.dir, "..");
const ASSETS_TEMPLATE = join(ROOT, "assets/reference-configs/global-working-rules.md");
const STANDARD_PLAN = join(ROOT, "src/effects/adoption/standard-plan.ts");

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
    return mergeManagedBlock("", renderGlobalRulesBlock(ROOT, { preset, instruction })).content;
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

  test("the managed block ships the test-volume budget and its exception path", () => {
    const rendered = renderedManagedBlock("en", "Use English to report to user.");
    expect(SHIPPED_GLOBAL_RULES_SECTIONS).toContain("Test Budget");
    expect(rendered).toContain("## Test Budget");
    expect(rendered).toContain("added test lines divided by added product lines must not exceed 2:1");
    expect(rendered).toContain("the PR adds at most one test file");
    expect(rendered).toContain("git diff --numstat <base>...HEAD -- tests");
    expect(rendered).toContain("git diff --numstat <base>...HEAD -- src scripts");
    expect(rendered).toContain("Test budget exception");
    expect(rendered).toContain("Remove a redundant test only when the PR names the retained test");
    expect(rendered).toContain("Never modify or delete assertions just to make a test pass");
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

  test.each(["$$", "$&", "$`", "$'"])("custom instructions preserve literal replacement token %s", (token) => {
    const instruction = `Use English. Preserve literal ${token} in code examples.`;
    const rendered = renderedManagedBlock("custom", instruction);
    expect(rendered.split("\n")).toContain(`- ${instruction}`);
    expect(countOccurrences(rendered, "# Global Working Rules")).toBe(1);
    const inspection = inspectGlobalContext(rendered, ROOT);
    expect(inspection.state).toBe("managed-current");
    expect(inspection.language).toEqual({ preset: "custom", instruction });
    expect(mergeManagedBlock(rendered, renderGlobalRulesBlock(ROOT, inspection.language!)).content).toBe(rendered);
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

  // Merge semantics moved here from init, which no longer writes host files;
  // `repo-harness update` applies the same merge inside its host transaction.
  const AGENTS_PATH = "/fixture-home/.codex/AGENTS.md";
  const zhBlock = () => renderGlobalRulesBlock(ROOT, { preset: "zh-CN", instruction: "Use Chinese to report to user." });

  test("merges the managed block beside user content and a second merge is unchanged", () => {
    const first = mergeManagedBlock("user content\n", zhBlock());
    const second = mergeManagedBlock(first.content, zhBlock());
    expect(formatGlobalContextWrite(AGENTS_PATH, "user content\n", first)).toBe(`appended:${AGENTS_PATH}`);
    expect(formatGlobalContextWrite(AGENTS_PATH, first.content, second)).toBe(`unchanged:${AGENTS_PATH}`);
    const codex = first.content;
    expect(codex).toContain("user content");
    expect(codex).toContain("<!-- BEGIN: repo-harness global-working-rules -->");
    expect(codex).toContain(
      "<!-- repo-harness manages this block; edits inside are overwritten on sync. Keep personal rules outside the markers. -->",
    );
    expect(codex).toContain("- Use Chinese to report to user.");
    expect(codex).toContain(
      '<!-- repo-harness reporting-language: {"preset":"zh-CN","instruction":"Use Chinese to report to user."} -->',
    );
    expect(inspectGlobalContext(codex, ROOT).state).toBe("managed-current");
    expect(codex).toContain("Rule 0: You may spend as much time as needed thinking.");
    expect(codex).toContain("Reasoning: Prefer first principles over pattern matching.");
    expect(codex).toContain("Generality: These are general working rules.");
  });

  test("blocks the merge when repo-harness markers are unbalanced", () => {
    const duplicated = [
      "<!-- BEGIN: repo-harness global-working-rules -->",
      "# Global Working Rules",
      "- one",
      "<!-- END: repo-harness global-working-rules -->",
      "",
      "<!-- BEGIN: repo-harness global-working-rules -->",
      "# Global Working Rules",
      "- two",
      "<!-- END: repo-harness global-working-rules -->",
      "",
    ].join("\n");
    const merged = mergeManagedBlock(duplicated, zhBlock());
    expect(merged.status).toBe("blocked-unbalanced");
    expect(merged.content).toBe(duplicated);
  });

  test("replaces a legacy unmarked rules copy with the managed block", () => {
    const existing = ["# Global Working Rules", "", "- Custom user-owned rule.", ""].join("\n");
    const merged = mergeManagedBlock(existing, zhBlock());
    expect(formatGlobalContextWrite(AGENTS_PATH, existing, merged)).toBe(
      `migrated-legacy:${AGENTS_PATH} (replaced: Global Working Rules; kept user sections: none)`,
    );
    // The H1 preamble is part of the shipped legacy span.
    expect(merged.content).not.toContain("- Custom user-owned rule.");
    expect(merged.content).toBe(zhBlock());
    expect(inspectGlobalContext(merged.content, ROOT).state).toBe("managed-current");
  });

  test("migrates a mixed legacy file and keeps a custom sentence refreshable", () => {
    const userBefore = "## CodeGraph\n\nUse codegraph first.\n\n";
    const userAfter = "## Disk hygiene\n\nKeep the disk clean.\n";
    const existing = [
      userBefore,
      "# Global Working Rules\n\nOld preamble.\n\n",
      "## Reporting\n\n- Old reporting rule.\n\n",
      userAfter,
    ].join("");
    const instruction = "Report in French --> keep code terms in English.";
    const block = renderGlobalRulesBlock(ROOT, { preset: "custom", instruction });
    const merged = mergeManagedBlock(existing, block);
    expect(formatGlobalContextWrite(AGENTS_PATH, existing, merged)).toBe(
      `migrated-legacy:${AGENTS_PATH} (replaced: Global Working Rules, Reporting; kept user sections: CodeGraph, Disk hygiene)`,
    );
    expect(merged.content).toBe(`${userBefore}${block}\n${userAfter}`);
    expect(merged.content).toContain(`- ${instruction}`);
    expect(merged.content).not.toContain('"instruction":"Report in French -->');
    const inspection = inspectGlobalContext(merged.content, ROOT);
    expect(inspection.state).toBe("managed-current");
    expect(inspection.language).toEqual({ preset: "custom", instruction });
  });
});

const RULE_FILES = ["CLAUDE.md", "AGENTS.md"] as const;
const ISSUE_FLOW_SKILL = "assets/skills/repo-harness-issue-flow/SKILL.md";
const SHARED_SECTIONS = ["Workflow", "Code Optimization Principles", "Testing", "Writing", "UI"];

function rootRules(file: (typeof RULE_FILES)[number]): string {
  return readFileSync(join(ROOT, file), "utf-8");
}

function ruleLineCount(content: string): number {
  return content.replace(/\n$/, "").split("\n").length;
}

function sectionBody(content: string, title: string): string {
  const start = content.indexOf("## " + title + "\n");
  if (start === -1) return "";
  const body = content.slice(start + title.length + 4);
  const next = body.search(/^## /m);
  return next === -1 ? body : body.slice(0, next);
}

describe("root rule invariants", () => {
  test("root rule files stay standalone regular files within the 60-line budget", () => {
    for (const file of RULE_FILES) {
      const stat = lstatSync(join(ROOT, file));
      expect(stat.isFile(), file).toBe(true);
      expect(stat.isSymbolicLink(), file).toBe(false);
      expect(ruleLineCount(rootRules(file)), file).toBeLessThanOrEqual(60);
    }
  });

  test("both root files repeat every shared invariant and keep host guidance separate", () => {
    const [claude, agents] = RULE_FILES.map(rootRules);
    const shared = (content: string) => content.split(/\n## (?:Claude Code|Codex)\n/)[0]!;
    expect(shared(claude)).toBe(shared(agents));
    for (const section of SHARED_SECTIONS) {
      expect(sectionBody(claude, section), section).not.toBe("");
      expect(sectionBody(agents, section), section).not.toBe("");
    }
    expect(claude).toContain("## Claude Code");
    expect(claude).not.toContain("## Codex\n");
    expect(agents).toContain("## Codex");
    expect(agents).not.toContain("## Claude Code\n");
    expect(claude).toContain("~/.claude/settings.json");
    expect(claude).not.toContain("~/.codex/hooks.json");
    expect(agents).toContain("~/.codex/hooks.json");
    expect(agents).not.toContain("~/.claude/settings.json");
  });

  test("the workflow line points at the issue-flow skill for every multi-agent concern", () => {
    const skill = readFileSync(join(ROOT, ISSUE_FLOW_SKILL), "utf-8");
    for (const file of RULE_FILES) {
      const content = rootRules(file);
      expect(content).toContain("`repo-harness-issue-flow` (`" + ISSUE_FLOW_SKILL + "`)");
      expect(content).toContain("roles, claims, handoff, dispatch, acceptance and merge");
      expect(content).not.toContain("docs/issue-flow.md");
      expect(content.split(ISSUE_FLOW_SKILL).length - 1, file).toBe(1);
    }
    expect(skill).toContain("## Roles and seats");
    expect(skill).toContain("## Where each fact lives");
    expect(skill).toContain("## Hard rules");
  });

  test("the architecture line points at the archimap and its capability docs", () => {
    for (const file of RULE_FILES) {
      const content = rootRules(file);
      expect(content).toContain("`docs/architecture/archimap.html` is the single architecture entry");
      expect(content).toContain("`docs/architecture/modules/`");
      expect(content).toContain("Change boundaries only through `repo-harness-architecture`");
      expect(content).not.toContain("`.archcontext/model/` owns architecture boundaries");
      expect(content).not.toContain("read `docs/architecture/` on demand");
    }
  });

  test("both root files keep the hard boundaries and the risk-tier rule", () => {
    for (const file of RULE_FILES) {
      const content = rootRules(file);
      expect(content).toContain("Keep four hard boundaries: main publication, deletion, credentials/permissions, and release/production operations.");
      expect(content).toContain("current task explicitly authorizes main publication");
      expect(content).toContain("`publication.acceptance_merge` is `on` in the policy on the PR base");
      expect(content).toContain("Deletion, credentials/permissions and release/production need user approval.");
      expect(content).toContain("[Review by risk](docs/reference-configs/agentic-development-flow.md#review-by-risk)");
      expect(content).toContain("Changing implementation and test assertions together does not raise the tier.");
    }
  });

  test("the retired multi-agent sections stay out of both root files", () => {
    const retired = [
      "## GitHub Issue Claims",
      "## Handoff",
      "Herdr Dispatch",
      "When you delegate",
      "parent agent",
      "sub-agent",
      "frontend implementation",
      "Own backend implementation",
      ".ai/harness/handoff",
      "archcontext/model/` owns",
    ];
    for (const file of RULE_FILES) {
      const content = rootRules(file);
      for (const text of retired) expect(content, file + ": " + text).not.toContain(text);
    }
  });

  test("every relative Markdown link in the root files resolves on disk", () => {
    for (const file of RULE_FILES) {
      for (const match of rootRules(file).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1]!;
        if (/^(?:https?:|mailto:|#)/.test(target)) continue;
        expect(existsSync(join(ROOT, target.split("#")[0]!)), file + ": " + target).toBe(true);
      }
    }
  });

  test("documents that linked the retired flow page now link the skill", () => {
    const spec = readFileSync(join(ROOT, "docs/spec.md"), "utf-8");
    const onboarding = readFileSync(join(ROOT, "docs/bot-onboarding.md"), "utf-8");
    expect(spec).toContain("`assets/skills/repo-harness-issue-flow/SKILL.md`");
    expect(spec).not.toContain("docs/issue-flow.md");
    expect(onboarding).toContain("(../assets/skills/repo-harness-issue-flow/SKILL.md)");
    expect(onboarding).not.toContain("(issue-flow.md)");
  });
});
