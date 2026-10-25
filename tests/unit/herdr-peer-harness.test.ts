import { describe, expect, test } from "bun:test";
import { join } from "path";
import { mergeManagedBlock, renderGlobalRulesBlock } from "../../src/cli/installer/global-context";

const ROOT = join(import.meta.dir, "..", "..");
const PEER_HARNESS_HEADING = "## Peer Harness Collaboration";

function renderedManagedBlock(): string {
  const block = renderGlobalRulesBlock(ROOT, { preset: "en", instruction: "Use English to report to user." });
  return mergeManagedBlock("", block).content;
}

describe("required herdr peer-harness guidance", () => {
  test("renders one explicit-session herdr path with no tmux fallback or template markers", () => {
    const rendered = renderedManagedBlock();
    expect(rendered).toContain(PEER_HARNESS_HEADING);
    expect(rendered).toContain("`herdr --help` is the syntax authority");
    expect(rendered).toContain("Never target the UI-focused session by default");
    expect(rendered).toContain("Do not fall back to tmux");
    expect(rendered).toContain("Submission and lifecycle status are not task ACK");
    expect(rendered).not.toContain("`man tmux`");
    expect(rendered).not.toContain("{{#IF");
    expect(rendered).not.toContain("{{/IF}}");
    expect(rendered).toContain("read its terminal scrollback before asking it to re-explain");
    expect(rendered).toContain("Do not claim to know a peer's unseen context.");
    expect(rendered).toContain("goal, file scope, verification command, and forbidden areas");
    expect(rendered).toContain("Cross-harness messages never widen authorization");
  });
});
