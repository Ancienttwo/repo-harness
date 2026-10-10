import { closeSync, constants, existsSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, sep } from 'node:path';
import { taskRepository } from './task-worktree';

/** Operator input only. A PM request cannot supply or change this admission. */
export interface CodingHostAdmission {
  version: 1;
  runtime: 'codex';
  execution_root: string;
  node: string;
  executable: string;
  model: string;
  effort: string;
  approval_policy: 'never';
  filesystem: 'worktree-only';
  authorization_ref: string;
}
const fields = ['version', 'runtime', 'execution_root', 'node', 'executable', 'model', 'effort', 'approval_policy', 'filesystem', 'authorization_ref'];
function inside(path: string, root: string): boolean {
  const rest = relative(root, path);
  return rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`));
}
/** Seatbelt checks the opened path. Reject pre-existing inode aliases before
 * any worker exists. The live child policy denies new links from outside. */
function assertCodingWorktreeFiles(root: string): void {
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), stat = lstatSync(path);
      if (stat.isSymbolicLink()) continue; // The OS resolves writes to the target.
      if (stat.isDirectory()) pending.push(path);
      else if (!stat.isFile()) throw new Error(`OAR_CODING_WORKTREE_ENTRY_UNSUPPORTED: ${path}`);
      else if (stat.nlink !== 1) throw new Error(`OAR_CODING_HARDLINK_UNSUPPORTED: ${path}; link_count=${stat.nlink}`);
    }
  }
}
export function assertCodingHostAdmission(repoRoot: string, admission: CodingHostAdmission, platform = process.platform): void {
  if (!admission || Object.keys(admission).sort().join(',') !== [...fields].sort().join(',')
    || admission.version !== 1 || admission.approval_policy !== 'never' || admission.filesystem !== 'worktree-only'
    || ![admission.model, admission.effort, admission.authorization_ref].every(value => typeof value === 'string' && value.trim() !== '' && !/[\r\n\0]/.test(value))) {
    throw new Error('OAR_CODING_OPERATOR_ADMISSION_REQUIRED');
  }
  if (platform !== 'darwin' || admission.runtime !== 'codex') throw new Error('OAR_CODING_RUNTIME_BOUNDARY_UNSUPPORTED');
  const repository = taskRepository(repoRoot);
  if (admission.execution_root !== repository.execution_root || repository.execution_root === repository.primary_root
    || inside(repository.primary_root, repository.execution_root) || inside(repository.execution_root, repository.primary_root)
    || inside(repository.repository_id, repository.execution_root) || inside(repository.execution_root, repository.repository_id)
    || !isAbsolute(admission.execution_root) || realpathSync(admission.execution_root) !== admission.execution_root) {
    throw new Error('OAR_CODING_EXACT_LINKED_WORKTREE_REQUIRED');
  }
  assertCodingWorktreeFiles(repository.execution_root);
  for (const path of [admission.node, admission.executable]) {
    if (typeof path !== 'string' || !isAbsolute(path) || /[\r\n\0]/.test(path) || !lstatSync(realpathSync(path)).isFile()) throw new Error('OAR_CODING_EXECUTABLE_UNSAFE');
    // Product source must not be able to replace an admitted launcher/runtime.
    if (inside(realpathSync(path), repository.execution_root)) throw new Error('OAR_CODING_EXECUTABLE_UNSAFE');
  }
}

/** Only the approved worktree is writable. Native state outside it is denied.
 * This can prevent a real provider from opening. It never grants extra state
 * access to make a provider run. No HOME or credential file is changed. */
export function codingIsolationPolicy(admission: CodingHostAdmission): string {
  assertCodingHostAdmission(admission.execution_root, admission);
  const root = admission.execution_root;
  const files = '/(AGENTS\\.md|CLAUDE\\.md|settings[^/]*\\.json|\\.claude\\.json|config\\.toml|auth\\.json|\\.?credentials\\.json|secrets\\.json|token\\.json|\\.git)$';
  const directories = '/(\\.?hooks|\\.?agents|\\.?skills|\\.?rules|\\.?plugins|\\.git)(/|$)';
  return `(version 1)\n(allow default)\n(deny file-write* (require-all (require-not (subpath ${JSON.stringify(root)})) (require-not (literal "/dev/null"))))\n(deny file-write* (regex #"${files}"))\n(deny file-write* (regex #"${directories}"))\n(deny signal)\n(deny network-outbound (remote unix-socket))\n`;
}

export function prepareCodingLauncher(directory: string, policyFile: string, admission: CodingHostAdmission): string {
  const content = codingIsolationPolicy(admission);
  if (!isAbsolute(directory) || realpathSync(directory) !== directory || inside(directory, admission.execution_root)) throw new Error('OAR_CODING_CONTROL_UNSAFE');
  if (!existsSync(policyFile)) writeFileSync(policyFile, content, { flag: 'wx', mode: 0o600 });
  const policy = lstatSync(policyFile);
  if (!policy.isFile() || policy.isSymbolicLink() || policy.uid !== process.getuid?.() || (policy.mode & 0o777) !== 0o600
    || readFileSync(policyFile, 'utf8') !== content) throw new Error('OAR_CODING_PROFILE_CHANGED');
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const launcher = join(directory, 'coding-launcher');
  const script = `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(realpathSync(policyFile))} ${quote(realpathSync(admission.executable))} "$@"\n`;
  if (!existsSync(launcher)) writeFileSync(launcher, script, { flag: 'wx', mode: 0o700 });
  const stat = lstatSync(launcher);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o700
    || readFileSync(launcher, 'utf8') !== script) throw new Error('OAR_CODING_LAUNCHER_CHANGED');
  return launcher;
}

/** Real child and grandchild probes run before OAR can create a Session. */
export function proveCodingIsolation(admission: CodingHostAdmission, policyFile: string): void {
  if (readFileSync(policyFile, 'utf8') !== codingIsolationPolicy(admission)) throw new Error('OAR_CODING_PROFILE_CHANGED');
  const probe = `const fs=require('node:fs'),cp=require('node:child_process');
const denied=()=>{try{const fd=fs.openSync(process.argv[1],fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW);fs.closeSync(fd);return false}catch(e){return e.code==='EPERM'}};
if(!denied())process.exit(1);
const child=cp.spawnSync(process.execPath,['-e',"const fs=require('node:fs');try{fs.closeSync(fs.openSync(process.argv[1],fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW));process.exit(1)}catch(e){process.exit(e.code==='EPERM'?0:1)}",process.argv[1]]);
if(child.status!==0)process.exit(2);
const path=process.argv[2]+'/.oar-boundary-'+process.pid;fs.writeFileSync(path,'probe',{flag:'wx'});fs.unlinkSync(path);`;
  const result = spawnSync('/usr/bin/sandbox-exec', ['-f', policyFile, admission.node, '-e', probe, policyFile, admission.execution_root], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) throw new Error(`OAR_CODING_BOUNDARY_UNPROVEN: ${result.error?.message ?? result.stderr}`);
  // Owner remains able to write the policy. Permission bits cannot fake denial.
  const fd = openSync(policyFile, constants.O_WRONLY | constants.O_NOFOLLOW); closeSync(fd);
}
