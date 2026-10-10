import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync } from 'fs';
import { dirname, isAbsolute, join, relative, sep } from 'path';
import { PmError } from '../../core/pm/protocol';
import { repoHarnessHome } from '../repo-registry';
import { validateHerdrEndpoint, type HerdrEndpoint } from '../terminal/herdr';
import { assertCodingHostAdmission, type CodingHostAdmission } from '../terminal/coding-session';

export interface PmHostConfiguration {
  protocol: 1;
  endpoint: HerdrEndpoint;
  parent_pane: string;
  admission: CodingHostAdmission;
  max_requests: number;
}
export const PM_ADMISSION_REMEDIATION = 'Use the existing fleet acquire and operator setup to bind and approve a linked worktree. The PM cannot create a worktree or approve its write permission.';

/** The operator file is outside every admitted execution worktree. */
export function readPmHostConfiguration(env: NodeJS.ProcessEnv = process.env): PmHostConfiguration {
  const path = join(repoHarnessHome(env), 'pm-host.json');
  let fd: number | undefined;
  try {
    for (const entry of [dirname(path), path]) {
      const stat = lstatSync(entry);
      if (stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o022) !== 0
        || (entry === path ? !stat.isFile() : !stat.isDirectory())) throw new PmError('pm_host_configuration_unsafe');
    }
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(fd);
    const published = lstatSync(path);
    if (opened.dev !== published.dev || opened.ino !== published.ino || opened.size > 64 * 1024
      || opened.uid !== process.getuid?.() || (opened.mode & 0o022) !== 0) throw new PmError('pm_host_configuration_unsafe');
    const value = JSON.parse(readFileSync(fd, 'utf8')) as PmHostConfiguration;
    if (!value || Object.keys(value).sort().join(',') !== 'admission,endpoint,max_requests,parent_pane,protocol'
      || value.protocol !== 1 || typeof value.parent_pane !== 'string' || !value.parent_pane.trim() || value.parent_pane.length > 128 || /[\r\n\0]/.test(value.parent_pane)
      || !Number.isSafeInteger(value.max_requests) || value.max_requests < 1 || value.max_requests > 100
      || !value.admission || !value.endpoint || Object.keys(value.endpoint).some(key => !['session', 'configPath', 'home'].includes(key))) {
      throw new PmError('pm_host_configuration_invalid');
    }
    validateHerdrEndpoint(value.endpoint);
    assertCodingHostAdmission(value.admission.execution_root, value.admission);
    const rest = relative(value.admission.execution_root, realpathSync(path));
    if (rest === '' || (!isAbsolute(rest) && rest !== '..' && !rest.startsWith(`..${sep}`))) throw new PmError('pm_host_configuration_unsafe');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new PmError('pm_acquisition_not_admitted', PM_ADMISSION_REMEDIATION);
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
