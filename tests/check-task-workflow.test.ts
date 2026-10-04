import { expect, test } from 'bun:test';
import { existsSync,mkdirSync,rmSync,writeFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './helpers/helper-script-fixture';
import { run,tmpWorkspace } from './helpers/repo-fixture';
test('workflow inspection reports missing/invalid data without creating artifacts or blocking work',()=>{
 const root=tmpWorkspace('workflow-observer');try {
 mkdirSync(join(root,'.ai/harness'),{recursive:true});writeFileSync(join(root,'.ai/harness/policy.json'),'{invalid');
 const result=run('bash',[join(ROOT,'scripts/check-task-workflow.sh')],root);
 expect(result.status).toBe(0);expect(result.stdout).toContain('diagnostic issues=2');
 expect(existsSync(join(root,'plans'))).toBe(false);expect(existsSync(join(root,'tasks'))).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
