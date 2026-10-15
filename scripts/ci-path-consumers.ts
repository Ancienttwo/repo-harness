import { createHash } from 'node:crypto';
import { API } from 'typescript/unstable/async';
import { createVirtualFileSystem } from 'typescript/unstable/fs';
import { isCallExpression, isNewExpression, isStringLiteralLikeNode } from 'typescript/unstable/ast';
import { createPathEvaluator } from './lib/path-values';

export type PathReference = { path: string; operation: 'data' | 'execute' | 'literal' };
const cache = new Map<string, PathReference[]>();
const root = '/__repo_harness_ci__';
const pathOperations = new Set(['join', 'resolve', 'URL', 'dirname', 'fileURLToPath']);
const readers = new Set(['readFileSync', 'readFile', 'readdirSync', 'readdir', 'existsSync', 'statSync', 'lstatSync', 'copyFileSync', 'cpSync', 'file']);
const launchers = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'execSync', 'exec']);
export const sourceKey = (file: string, source: string) => file + ':' + createHash('sha256').update(source).digest('hex');

/** Parse immutable source strings, including deleted versions, without running repository code. */
export async function discoverPathReferences(entries: readonly (readonly [string, string])[]): Promise<ReadonlyMap<string, PathReference[]>> {
  const missing = [...new Map(entries
    .filter(([file]) => /\.[cm]?[jt]sx?$/.test(file))
    .map(([file, source]) => [sourceKey(file, source), { file, source }])).entries()]
    .filter(([key]) => !cache.has(key));
  if (!missing.length) return cache;
  const virtual: Record<string, string> = {};
  const names = missing.map(([, entry], index) => {
    const name = `${index}.${entry.file.endsWith('x') ? 'tsx' : 'ts'}`;
    virtual[`${root}/${name}`] = entry.source;
    return name;
  });
  virtual[`${root}/tsconfig.json`] = JSON.stringify({ compilerOptions: { noLib: true, noResolve: true, jsx: 'preserve' }, files: names });
  const api = new API({ fs: createVirtualFileSystem(virtual) });
  let snapshot;
  try {
    snapshot = await api.updateSnapshot({ openProjects: [`${root}/tsconfig.json`] });
    const project = snapshot.getProjects()[0];
    if (!project) throw new Error('Path discovery requires a TypeScript project');
    for (let index = 0; index < missing.length; index++) {
      const [key, { file }] = missing[index]!;
      const source = await project.program.getSourceFile(`${root}/${names[index]}`);
      if (!source) throw new Error(`Path discovery could not parse ${file}`);
      const product = file.startsWith('src/');
      const { nodes, op, values } = createPathEvaluator(source, root, file, product ? '/__target_repository__' : root);
      const found = new Map<string, PathReference>();
      const add = (value: string, operation: PathReference['operation']) => {
        value = value.replaceAll('\\', '/');
        if (product && !value.startsWith(root + '/')) return;
        if (value.startsWith(root + '/')) value = value.slice(root.length + 1);
        else if (value.startsWith('/')) return;
        value = value.replace(/^(?:\.\/|\*\/)+/, '').replace(/\/$/, '');
        if (!value || value === '*' || value === '.' || value.startsWith('../') || value.includes('\n')) return;
        const reference = { path: value, operation };
        found.set(operation + ':' + value, reference);
      };
      for (const node of nodes) {
        if (isCallExpression(node) || isNewExpression(node)) {
          const operation = op(node.expression);
          if (pathOperations.has(operation)) for (const value of values(node)) add(value, 'data');
          if (readers.has(operation)) for (const value of values(node.arguments?.[0])) add(value, 'data');
          if (launchers.has(operation)) for (const arg of node.arguments ?? []) for (const value of values(arg)) add(value, 'execute');
        }
        if (!product && isStringLiteralLikeNode(node) && (/[\/\\]/.test(node.text) || /^[\w.-]+\.[\w]+$/.test(node.text))) add(node.text, 'literal');
      }
      cache.set(key, [...found.values()]);
    }
  } finally {
    if (snapshot) await snapshot.dispose();
    await api.close();
  }
  return cache;
}
