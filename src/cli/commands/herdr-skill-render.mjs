import { readFileSync } from "node:fs";

const MANUAL_HEADING = "# hc manual (herdr-core)\n";

/** Keep the hc manual verbatim under the repo-harness caller-context policy. */
export function renderHerdrSkill(upstream) {
  if (!upstream.startsWith(MANUAL_HEADING) || !upstream.includes("$HC_TERMINAL_ID")) {
    throw new Error("hc --skill did not return the hc manual");
  }
  const context = readFileSync(new URL("../../../assets/reference-configs/herdr-skill-context.md", import.meta.url), "utf8");
  return context.trimEnd() + "\n\n" + upstream;
}
