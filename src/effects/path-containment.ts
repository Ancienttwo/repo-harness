import { isAbsolute, relative, sep } from 'path';

/** True when `child` equals `parent` or lies below it, by lexical path relation. */
export function isPathInside(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return relation === '' || (
    relation !== '..' &&
    !relation.startsWith(`..${sep}`) &&
    !isAbsolute(relation)
  );
}
