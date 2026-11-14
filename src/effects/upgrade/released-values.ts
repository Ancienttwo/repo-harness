/**
 * Exact proof that a value is managed: it equals a value that a release
 * rendered. `assets/released-managed-values.v1.json` is the only list;
 * `scripts/check-released-managed-values.ts` rebuilds it from the release tags.
 * Init, update and upgrade change or delete a managed value only with this
 * proof or when the value equals the current rendering; every other value is
 * kept and reported.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { sha256Prefixed } from "../../core/evidence/sha256";

const SCHEMA = "repo-harness.released-managed-values.v1";

interface ReleasedManagedValues {
  readonly packageScripts: Readonly<Record<string, readonly string[]>>;
  readonly referenceConfigs: Readonly<Record<string, readonly string[]>>;
  readonly projectGitignoreBlock: {
    readonly blocks: readonly string[];
    readonly retiredSection: { readonly header: string; readonly rules: readonly string[]; readonly bases: readonly string[] } | null;
  };
  readonly userExcludesBlock: { readonly blocks: readonly string[] };
  readonly globalRulesBlock: {
    readonly blocks: readonly string[];
    readonly customInstructionSentinel: string;
    readonly customInstructionBlocks: readonly string[];
    readonly legacySections: Readonly<Record<string, readonly string[]>>;
  };
}

function loadReleasedManagedValues(): ReleasedManagedValues {
  const path = join(import.meta.dir, "../../../assets/released-managed-values.v1.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { schema?: unknown };
  if (parsed.schema !== SCHEMA) throw new Error(`${path}: expected schema ${SCHEMA}`);
  return parsed as unknown as ReleasedManagedValues;
}

let cached: ReleasedManagedValues | undefined;
function released(): ReleasedManagedValues {
  cached ??= loadReleasedManagedValues();
  return cached;
}

const has = (list: readonly string[] | undefined, value: string): boolean => list?.includes(value) ?? false;

/** A package.json `scripts` value that the init of some release wrote for this key. */
export function isReleasedPackageScript(key: string, value: unknown): boolean {
  return typeof value === "string" && has(released().packageScripts[key], value);
}

/** A `docs/reference-configs/<docId>.md` file whose whole text a release wrote. */
export function isReleasedReferenceConfig(docId: string, content: string): boolean {
  return has(released().referenceConfigs[docId], sha256Prefixed(content));
}

/**
 * A released project `.gitignore` block or user-excludes block, from its BEGIN line
 * to its END line joined by `\n`. A project block may end with a retired-runtime
 * section that lists an in-order subset of the released retired rules.
 */
export function isReleasedIgnoreBlock(block: string): boolean {
  const values = released();
  const fingerprint = sha256Prefixed(block);
  if (has(values.projectGitignoreBlock.blocks, fingerprint) || has(values.userExcludesBlock.blocks, fingerprint)) return true;
  const retired = values.projectGitignoreBlock.retiredSection;
  if (!retired) return false;
  const lines = block.split("\n");
  const end = lines.pop()!;
  const content = lines.join("\n");
  const at = content.lastIndexOf(`\n\n${retired.header}\n`);
  if (at === -1) return false;
  const tail = content.slice(at + retired.header.length + 3).split("\n");
  let next = 0;
  for (const rule of tail) {
    const index = retired.rules.indexOf(rule, next);
    if (index === -1) return false;
    next = index + 1;
  }
  return has(retired.bases, sha256Prefixed(`${content.slice(0, at)}\n${end}`));
}

/**
 * A released global rules block, from its BEGIN line to its END line joined by
 * `\n`. A block with a custom instruction is compared with that instruction
 * replaced by the release sentinel in the header and the instruction line.
 */
export function isReleasedGlobalRulesBlock(block: string, customInstruction: string | null): boolean {
  const rules = released().globalRulesBlock;
  if (has(rules.blocks, sha256Prefixed(block))) return true;
  if (customInstruction === null) return false;
  const header = JSON.stringify(customInstruction).replaceAll(">", "\\u003e");
  const sentinelHeader = JSON.stringify(rules.customInstructionSentinel).replaceAll(">", "\\u003e");
  const lines = block.split("\n").map((line) => line === `- ${customInstruction}` ? `- ${rules.customInstructionSentinel}`
    : line.includes(`"instruction":${header}`) ? line.replace(`"instruction":${header}`, `"instruction":${sentinelHeader}`) : line);
  return has(rules.customInstructionBlocks, sha256Prefixed(lines.join("\n")));
}

/** An unmarked section of a released global rules template, keyed by its heading line, with trailing blank lines dropped. */
export function isReleasedGlobalRulesSection(heading: string, text: string): boolean {
  return has(released().globalRulesBlock.legacySections[heading], sha256Prefixed(text));
}
