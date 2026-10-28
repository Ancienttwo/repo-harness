import { readFileSync } from "node:fs";

const CLI_SECTION = "\n## Learn the current CLI\n";

/** Keep binary command syntax while repo-harness owns caller-context policy. */
export function renderHerdrSkill(upstream) {
  const boundary = upstream.indexOf(CLI_SECTION);
  if (!upstream.startsWith("---\nname: herdr\n") || boundary < 0
    || upstream.indexOf(CLI_SECTION, boundary + 1) >= 0) {
    throw new Error("herdr --skill has an unsupported CLI section layout");
  }
  const context = readFileSync(new URL("../../../assets/reference-configs/herdr-skill-context.md", import.meta.url), "utf8");
  return context.trimEnd() + "\n\n" + upstream.slice(boundary + 1);
}
