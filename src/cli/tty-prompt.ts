/**
 * Minimal shared readline/promises confirm prompt.
 *
 * Used by both the repo-local interactive planner
 * (`commands/init.ts` `runInteractiveInit`) and the global runtime
 * bootstrap's optional-dependency prompts (`index.ts`
 * `runGlobalRuntimeBootstrap`). This is intentionally just the one
 * confirm shape both call sites need, not a general prompt framework.
 */
import type { createInterface } from "readline/promises";

export function writeLine(output: NodeJS.WritableStream, line = ""): void {
  output.write(`${line}\n`);
}

export async function askConfirm(
  rl: ReturnType<typeof createInterface>,
  output: NodeJS.WritableStream,
  question: string,
): Promise<boolean> {
  while (true) {
    const answer = (await rl.question(`${question} [Y/n]: `)).trim().toLowerCase();
    writeLine(output);
    if (!answer || answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    writeLine(output, "Enter y or n.");
  }
}
