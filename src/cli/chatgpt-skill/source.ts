import { existsSync, lstatSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export const CHATGPT_CANONICAL_SKILL_NAME = 'repo-harness-chatgpt';

const REQUIRED_REFERENCES = [
  'setup.md',
  'consult.md',
  'continue.md',
  'read-back.md',
  'bridge.md',
  'delegate.md',
  'orchestrate.md',
] as const;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');

export function canonicalChatgptSkillRoot(): string {
  const sourceRoot = process.env.REPO_HARNESS_SOURCE_ROOT?.trim();
  if (sourceRoot) {
    if (!isAbsolute(sourceRoot)) throw new Error('REPO_HARNESS_SOURCE_ROOT must be an absolute path');
    return join(sourceRoot, 'assets', 'skills', CHATGPT_CANONICAL_SKILL_NAME);
  }
  return join(PACKAGE_ROOT, 'assets', 'skills', CHATGPT_CANONICAL_SKILL_NAME);
}

export function validateCanonicalChatgptSkillRoot(): string {
  const root = canonicalChatgptSkillRoot();
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new Error(`canonical ChatGPT Skill package is missing or not a directory: ${root}`);
  }
  const skillPath = join(root, 'SKILL.md');
  if (!existsSync(skillPath) || !lstatSync(skillPath).isFile()) {
    throw new Error(`canonical ChatGPT Skill package is missing SKILL.md: ${skillPath}`);
  }
  const skill = readFileSync(skillPath, 'utf-8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
  if (!new RegExp(`^name:\\s*${CHATGPT_CANONICAL_SKILL_NAME}$`, 'm').test(frontmatter)) {
    throw new Error(`canonical ChatGPT Skill package has invalid frontmatter: ${skillPath}`);
  }
  for (const reference of REQUIRED_REFERENCES) {
    const path = join(root, 'references', reference);
    if (!existsSync(path) || !lstatSync(path).isFile()) {
      throw new Error(`canonical ChatGPT Skill package is missing reference: ${path}`);
    }
  }
  return root;
}

export function readCanonicalChatgptReference(reference: (typeof REQUIRED_REFERENCES)[number]): string {
  const root = canonicalChatgptSkillRoot();
  const path = join(root, 'references', reference);
  try {
    return readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(`could not read canonical ChatGPT Skill reference ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
