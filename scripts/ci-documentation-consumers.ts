#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { API } from 'typescript/unstable/async';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { isImportDeclaration, isObjectLiteralExpression, isPropertyAssignment, isShorthandPropertyAssignment, isStringLiteralLikeNode, type Node, type SourceFile } from 'typescript/unstable/ast';
import { isDocumentationPath } from './select-ci-coverage';
import { createPathEvaluator, walk } from './lib/path-values';

const launchers = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'execSync', 'exec']);
const readers = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'lstatSync', 'copyFileSync', 'cpSync', 'file']);
/** Bounded lexical path flow, not arbitrary execution: unresolved rooted reads are conservative. */
export function sourceConsumesDocumentation(source: SourceFile, repoRoot: string, file: string, trackedDocuments: ReadonlySet<string>, exists: (path: string) => boolean = existsSync): boolean {
  const { nodes, calls, declarations, op, values } = createPathEvaluator(source, repoRoot, file);
  const family = (path: string) => isDocumentationPath(path.replace(/\*/g, 'document.md')) || isDocumentationPath(`${path.replace(/\/$/, '')}/document.md`);
  const literals = nodes.filter(isStringLiteralLikeNode).some(node => family(node.text));
  for (const call of calls) {
    if (!readers.has(op(call.expression))) continue;
    for (const value of values(call.arguments[0])) {
      const path = isAbsolute(value) ? relative(repoRoot, value) : value;
      if (path.startsWith('../')) continue;
      if (family(path)) return true;
      if (isAbsolute(value) && (path === '*' || path === '') && literals) return true;
    }
  }
  // checkout-root-process: a child process that runs in, or targets, the checkout root
  // can read any tracked document, for example a script that walks docs/architecture/.
  for (const call of calls) {
    if (!launchers.has(op(call.expression))) continue;
    // Whole argument values only: join(ROOT, 'src/main.ts') names a file, not the root.
    const rooted = (node: Node): boolean => isObjectLiteralExpression(node)
      ? node.properties.some(property => isPropertyAssignment(property) ? rooted(property.initializer) : isShorthandPropertyAssignment(property) && rooted(property.name))
      : values(node).some(value => isAbsolute(value) && relative(repoRoot, value) === '');
    if (call.arguments.some(rooted)) return true;
  }
  // named-checkout-document-reference: fixture/generated reads can assert a named
  // tracked docs/ guide's contract. Fixture tasks/plans ledgers do not establish
  // that guide relationship. Include these conservatively when the test also
  // resolves checkout code, without promoting arbitrary fixture docs to consumers.
  const resolvesCheckout = declarations.some(decl => values(decl.initializer).some(value =>
    isAbsolute(value) && !relative(repoRoot, value).startsWith('../') && !value.includes('*') && exists(value)));
  if (resolvesCheckout) {
    const authoredGuides = new Set<string>();
    for (const call of calls) {
      if (!['writeFile', 'writeFileSync'].includes(op(call.expression)) || !call.arguments[0]) continue;
      walk(call.arguments[0], node => {
        if (isStringLiteralLikeNode(node) && trackedDocuments.has(node.text)) authoredGuides.add(node.text);
      });
    }
    for (const call of calls) {
      if (!readers.has(op(call.expression)) || !call.arguments[0]) continue;
      let named = false;
      walk(call.arguments[0], node => {
        if (isStringLiteralLikeNode(node) && node.text.startsWith('docs/') && trackedDocuments.has(node.text) && !authoredGuides.has(node.text)) named = true;
      });
      if (named) return true;
    }
  }
  return false;
}

export async function discoverDocumentationConsumers(repoRoot = resolve(import.meta.dir, '..'), trackedDocuments?: ReadonlySet<string>, historical?: ReadonlyMap<string, string>): Promise<string[]> {
  if (historical) trackedDocuments = new Set([...historical.keys()].filter(isDocumentationPath));
  if (!trackedDocuments) {
    const result = spawnSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Documentation discovery requires tracked Git paths: ${result.stderr}`);
    trackedDocuments = new Set(result.stdout.split('\0').filter(isDocumentationPath));
  }
  const virtual = historical ? Object.fromEntries([...historical].map(([file, content]) => [resolve(repoRoot, file), content])) : undefined;
  if (virtual) virtual[resolve(repoRoot, 'tsconfig.json')] = JSON.stringify({
    compilerOptions: { noLib: true, noResolve: true, jsx: 'preserve' },
    files: [...historical!.keys()].filter(file => file.startsWith('tests/') && /\.tsx?$/.test(file) && !/^tests\/fixtures\/upgrade-/.test(file)),
  });
  const exists = historical ? (path: string) => {
    const key = relative(repoRoot, path).replaceAll('\\', '/');
    return key === '' || historical.has(key) || [...historical.keys()].some(file => file.startsWith(key + '/'));
  } : existsSync;
  const api = new API(virtual ? { fs: createVirtualFileSystem(virtual) } : undefined);
  const snapshot = await api.updateSnapshot({ openProjects: [resolve(repoRoot, 'tsconfig.json')] });
  try {
    const project = snapshot.getProjects().find(project => resolve(project.configFileName) === resolve(repoRoot, 'tsconfig.json'));
    if (!project) throw new Error('Documentation discovery requires the repository TypeScript project');
    const syntaxErrors = await project.program.getSyntacticDiagnostics();
    if (syntaxErrors.length) throw new Error(`Documentation discovery requires parseable TypeScript: ${syntaxErrors[0]!.fileName}: ${syntaxErrors[0]!.text}`);
    const files = (await project.program.getSourceFileNames())
      .map(file => relative(repoRoot, file).replaceAll('\\', '/'))
      .filter(file => file.startsWith('tests/') && /\.[cm]?tsx?$/.test(file));
    const sources = new Map<string, SourceFile>();
    for (const file of files) {
      const source = await project.program.getSourceFile(resolve(repoRoot, file));
      if (!source) throw new Error(`Documentation discovery could not parse ${file}`);
      sources.set(file, source);
    }
    const consumers = new Set([...sources].filter(([file, source]) => sourceConsumesDocumentation(source, repoRoot, file, trackedDocuments!, exists)).map(([file]) => file));
    // Propagate local test-helper dependencies without executing imports.
    for (let changed = true; changed;) {
      changed = false;
      for (const [file, source] of sources) {
        if (consumers.has(file)) continue;
        for (const statement of source.statements) {
          if (!isImportDeclaration(statement) || !isStringLiteralLikeNode(statement.moduleSpecifier) || !statement.moduleSpecifier.text.startsWith('.')) continue;
          const target = relative(repoRoot, resolve(repoRoot, dirname(file), statement.moduleSpecifier.text));
          if ([target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].some(path => consumers.has(path))) { consumers.add(file); changed = true; }
        }
      }
    }
    return [...consumers].filter(file => /\.test\.tsx?$/.test(file)).sort();
  } finally { await snapshot.dispose(); await api.close(); }
}

if (import.meta.main) {
  if (process.argv.slice(2).join(' ') !== '--list') throw new Error('Usage: bun scripts/ci-documentation-consumers.ts --list');
  console.log((await discoverDocumentationConsumers()).join('\n'));
}
