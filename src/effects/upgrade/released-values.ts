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
const RELEASED_MANAGED_VALUES_FILE = join(import.meta.dir, "../../../assets/released-managed-values.v1.json");

type Fingerprints = readonly string[];

interface ReleasedManagedValues {
  readonly packageScripts: Readonly<Record<string, readonly string[]>>;
  readonly referenceConfigs: Readonly<Record<string, Fingerprints>>;
  readonly projectGitignoreBlock: {
    readonly blocks: Fingerprints;
    readonly retiredSection: { readonly header: string; readonly rules: readonly string[]; readonly bases: Fingerprints } | null;
  };
  readonly userExcludesBlock: { readonly blocks: Fingerprints };
  readonly globalRulesBlock: {
    readonly blocks: Fingerprints;
    readonly customInstructionSentinel: string;
    readonly customInstructionBlocks: Fingerprints;
    readonly legacySections: Readonly<Record<string, Fingerprints>>;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/;

/** The asset with every field checked: a missing file or a missing or malformed field fails before any proof uses the list. */
export function readReleasedManagedValues(file: string): ReleasedManagedValues {
  const text = readFileSync(file, "utf8");
  const fail = (path: string, expected: string): never => { throw new Error(`${file}: ${path} must be ${expected}`); };
  const object = (value: unknown, path: string): Record<string, unknown> => isRecord(value) ? value : fail(path, "an object");
  const string = (value: unknown, path: string): string => typeof value === "string" ? value : fail(path, "a string");
  const strings = (value: unknown, path: string, pattern?: RegExp): readonly string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string" && (!pattern || pattern.test(item)))
      ? value as string[] : fail(path, pattern ? "an array of sha256 fingerprints" : "an array of strings");
  const lists = (value: unknown, path: string, pattern?: RegExp): Record<string, readonly string[]> =>
    Object.fromEntries(Object.entries(object(value, path)).map(([key, item]) => [key, strings(item, `${path}.${key}`, pattern)]));
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (error) { throw new Error(`${file}: invalid JSON: ${(error as Error).message}`); }
  const root = object(parsed, "$");
  if (root.schema !== SCHEMA) fail("$.schema", JSON.stringify(SCHEMA));
  strings(root.releases, "$.releases");
  const project = object(root.projectGitignoreBlock, "$.projectGitignoreBlock");
  const retired = project.retiredSection === null ? null : object(project.retiredSection, "$.projectGitignoreBlock.retiredSection");
  const rules = object(root.globalRulesBlock, "$.globalRulesBlock");
  return {
    packageScripts: lists(root.packageScripts, "$.packageScripts"),
    referenceConfigs: lists(root.referenceConfigs, "$.referenceConfigs", FINGERPRINT),
    projectGitignoreBlock: {
      blocks: strings(project.blocks, "$.projectGitignoreBlock.blocks", FINGERPRINT),
      retiredSection: retired && {
        header: string(retired.header, "$.projectGitignoreBlock.retiredSection.header"),
        rules: strings(retired.rules, "$.projectGitignoreBlock.retiredSection.rules"),
        bases: strings(retired.bases, "$.projectGitignoreBlock.retiredSection.bases", FINGERPRINT),
      },
    },
    userExcludesBlock: { blocks: strings(object(root.userExcludesBlock, "$.userExcludesBlock").blocks, "$.userExcludesBlock.blocks", FINGERPRINT) },
    globalRulesBlock: {
      blocks: strings(rules.blocks, "$.globalRulesBlock.blocks", FINGERPRINT),
      customInstructionSentinel: string(rules.customInstructionSentinel, "$.globalRulesBlock.customInstructionSentinel"),
      customInstructionBlocks: strings(rules.customInstructionBlocks, "$.globalRulesBlock.customInstructionBlocks", FINGERPRINT),
      legacySections: lists(rules.legacySections, "$.globalRulesBlock.legacySections", FINGERPRINT),
    },
  };
}

let cached: ReleasedManagedValues | undefined;
function released(): ReleasedManagedValues {
  cached ??= readReleasedManagedValues(RELEASED_MANAGED_VALUES_FILE);
  return cached;
}

const has = (list: readonly string[] | undefined, value: string): boolean => list?.includes(value) ?? false;
const own = (record: Readonly<Record<string, readonly string[]>>, key: string): readonly string[] | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** A package.json `scripts` value that the init of some release wrote for this key. */
export function isReleasedPackageScript(key: string, value: unknown): boolean {
  return typeof value === "string" && has(own(released().packageScripts, key), value);
}

/**
 * A `docs/reference-configs/<docId>.md` file whose whole text a release wrote.
 * A Windows checkout converts LF to CRLF, so the comparison reads CRLF as LF.
 */
export function isReleasedReferenceConfig(docId: string, content: string): boolean {
  return has(own(released().referenceConfigs, docId), sha256Prefixed(content.replaceAll("\r\n", "\n")));
}

/**
 * `section` is the text between the base content and the rest of the block: empty,
 * or "\n\n" + header + one line per rule of a non-empty, in-order subset of `rules`.
 */
export function isRetiredRuleSection(section: string, header: string, rules: readonly string[]): boolean {
  if (section === "") return true;
  if (!section.startsWith(`\n\n${header}\n`)) return false;
  let next = 0;
  for (const rule of section.slice(header.length + 3).split("\n")) {
    const index = rules.indexOf(rule, next);
    if (index === -1) return false;
    next = index + 1;
  }
  return true;
}

/**
 * A released project `.gitignore` block, from its BEGIN line to its END line joined
 * by `\n`. A released renderer puts the retired-rule section directly before the END line.
 */
export function isReleasedProjectIgnoreBlock(block: string): boolean {
  const values = released().projectGitignoreBlock;
  if (has(values.blocks, sha256Prefixed(block))) return true;
  const retired = values.retiredSection;
  if (!retired) return false;
  const lines = block.split("\n");
  const end = lines.pop()!;
  const content = lines.join("\n");
  const at = content.lastIndexOf(`\n\n${retired.header}\n`);
  return at !== -1 && isRetiredRuleSection(content.slice(at), retired.header, retired.rules)
    && has(retired.bases, sha256Prefixed(`${content.slice(0, at)}\n${end}`));
}

/** A released user-level Git excludes block, from its BEGIN line to its END line joined by `\n`. */
export function isReleasedUserExcludesBlock(block: string): boolean {
  return has(released().userExcludesBlock.blocks, sha256Prefixed(block));
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
  return has(own(released().globalRulesBlock.legacySections, heading), sha256Prefixed(text));
}
