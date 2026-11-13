import { Command } from 'commander';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export interface RuntimeDocEntry {
  id: string;
  fileName: string;
  path: string;
  title: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const DOCS_ROOT = join(SOURCE_ROOT, 'assets', 'reference-configs');
const TEMPLATES_ROOT = join(SOURCE_ROOT, 'assets', 'templates');

function normalizeDocId(value: string): string {
  return value.endsWith('.md') ? value.slice(0, -3) : value;
}

function titleFromContent(path: string, fallback: string): string {
  try {
    const firstHeading = readFileSync(path, 'utf-8')
      .split(/\r?\n/)
      .find((line) => line.startsWith('# '));
    return firstHeading ? firstHeading.replace(/^#\s+/, '').trim() : fallback;
  } catch (_error) {
    return fallback;
  }
}

function docEntries(root: string, suffix: string): RuntimeDocEntry[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((fileName) => fileName.endsWith(suffix))
    .sort()
    .map((fileName) => {
      const id = normalizeDocId(fileName);
      const path = join(root, fileName);
      return {
        id,
        fileName,
        path,
        title: titleFromContent(path, id),
      };
    });
}

/** Reference documents and the workflow templates. A skill reads a template from the package, not a repository copy. */
export function listRuntimeDocs(): RuntimeDocEntry[] {
  return [...docEntries(DOCS_ROOT, '.md'), ...docEntries(TEMPLATES_ROOT, '.template.md')];
}

export function resolveRuntimeDoc(docId: string): RuntimeDocEntry | null {
  const normalized = normalizeDocId(docId);
  return listRuntimeDocs().find((entry) => entry.id === normalized || entry.fileName === docId) ?? null;
}

function formatList(entries: RuntimeDocEntry[], asJson = false): string {
  if (asJson) return JSON.stringify({ docs: entries }, null, 2);
  if (entries.length === 0) return 'No runtime docs found.';
  return entries.map((entry) => `${entry.id}\t${entry.title}`).join('\n');
}

export function buildDocsCommand(): Command {
  const docs = new Command('docs').description('Resolve bundled repo-harness runtime documentation');

  docs
    .command('list')
    .description('List bundled runtime documentation ids')
    .option('--json', 'Output JSON instead of text')
    .action((rawOpts: { json?: boolean }) => {
      console.log(formatList(listRuntimeDocs(), rawOpts.json === true));
      process.exit(0);
    });

  docs
    .command('path')
    .description('Print the bundled path for a runtime documentation id')
    .argument('<doc-id>', 'Documentation id, for example harness-overview')
    .action((docId: string) => {
      const entry = resolveRuntimeDoc(docId);
      if (!entry) {
        console.error(`rh docs path: unknown doc "${docId}"`);
        process.exit(2);
      }
      console.log(entry.path);
      process.exit(0);
    });

  docs
    .command('show')
    .description('Print a bundled runtime documentation file')
    .argument('<doc-id>', 'Documentation id, for example harness-overview')
    .action((docId: string) => {
      const entry = resolveRuntimeDoc(docId);
      if (!entry) {
        console.error(`rh docs show: unknown doc "${docId}"`);
        process.exit(2);
      }
      console.log(readFileSync(entry.path, 'utf-8').trimEnd());
      process.exit(0);
    });

  return docs;
}
