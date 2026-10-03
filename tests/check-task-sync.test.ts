import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './helpers/helper-script-fixture';
import { commitAll, initGitRepo, run, tmpWorkspace } from './helpers/repo-fixture';
test('task-sync records code/untracked paths without requiring task artifacts',()=>{
 const root=tmpWorkspace('task-sync-record');try {
 initGitRepo(root);writeFileSync(join(root,'README.md'),'seed');commitAll(root,'seed');
 mkdirSync(join(root,'src'));writeFileSync(join(root,'src/change.ts'),'export const change=1;');
 const result=run('bash',[join(ROOT,'scripts/check-task-sync.sh')],root);
 expect(result.status).toBe(0);expect(result.stdout).toContain('src/change.ts');expect(result.stdout).toContain('no plan, contract');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('unresolvable diff input is an incomplete observation, not a permit gate',()=>{
 const root=tmpWorkspace('task-sync-unavailable');try {
 initGitRepo(root);writeFileSync(join(root,'README.md'),'seed');commitAll(root,'seed');
 const result=run('bash',[join(ROOT,'scripts/check-task-sync.sh')],root,{REPO_HARNESS_DIFF_BASE:'missing-ref'});
 expect(result.status).toBe(0);expect(result.stdout).toContain('observation incomplete');
 }finally{rmSync(root,{recursive:true,force:true});}
});
