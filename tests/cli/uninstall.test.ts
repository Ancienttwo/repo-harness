import { createHash } from 'crypto';
import { PROFILE_COMPONENTS } from '../../src/cli/installer/install-profile';
import { test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { runUserUninstall } from '../../src/cli/installer/uninstall';
import { configurationReceiptPath, writeOwnedConfiguration } from '../../src/cli/installer/configuration-ownership';
import { buildManagedHooks } from '../../src/cli/installer/managed-entries';
const CLI = join(import.meta.dir, '../../src/cli/index.ts');
function fixture(run: (home: string, env: NodeJS.ProcessEnv) => void) {
 const home = mkdtempSync(join(tmpdir(), 'user-uninstall-'));
 try { run(home, { ...process.env, HOME: home }); } finally { rmSync(home, { recursive: true, force: true }); }
}
function put(home: string, path: string, content: string) { const absolute = join(home, path); mkdirSync(join(absolute, '..'), {recursive:true}); writeFileSync(absolute,content); }
function tree(home: string): string { return readdirSync(home, {recursive:true}).sort().map(String).map(p => {try{return `${p}:${readFileSync(join(home,p),'utf8')}`;}catch{return p;}}).join('\n'); }
test('restores original config, preserves siblings and archives, dry run is byte-identical', () => fixture((home, env) => {
 put(home,'.codex/config.toml','default_mode_request_user_input = false\nmodel = "user"\n');
 writeOwnedConfiguration(join(home,'.codex/config.toml'),'default_mode_request_user_input = true\nmodel = "user"\n',env);
 put(home,'.claude/settings.json',JSON.stringify({theme:'dark',hooks:{...buildManagedHooks('claude'),UserPromptSubmit:[{hooks:[{type:'command',command:'user-hook'}]}]}}));
 put(home,'.repo-harness/config.json',JSON.stringify({brainRoot:join(home,'vault'),refactor_recommendations:{enabled:true},architecture:{projection_provider:'archctx',projection_apply:'manual'},custom:42}));
 put(home,'vault/archive.md','keep'); put(home,'.repo-harness/history/log','keep');
 const before=tree(home);
 const preview=runUserUninstall({target:'both',dryRun:true,env});
 expect(preview.status).toBe('complete'); expect(tree(home)).toBe(before);
 const result=runUserUninstall({target:'both',env}); expect(result.status).toBe('complete');
 expect(readFileSync(join(home,'.codex/config.toml'),'utf8')).toBe('default_mode_request_user_input = false\nmodel = "user"\n');
 expect(JSON.parse(readFileSync(join(home,'.claude/settings.json'),'utf8')).hooks.UserPromptSubmit[0].hooks[0].command).toBe('user-hook');
 expect(JSON.parse(readFileSync(join(home,'.repo-harness/config.json'),'utf8'))).toEqual({custom:42});
 expect(readFileSync(join(home,'vault/archive.md'),'utf8')).toBe('keep');
 expect(runUserUninstall({target:'both',env}).status).toBe('complete');
 expect(existsSync(configurationReceiptPath(env))).toBe(true);
}));
test('user edits are preserved and return partial, with receipt retained', () => fixture((home,env)=>{
 writeOwnedConfiguration(join(home,'.codex/config.toml'),'default_mode_request_user_input = true\n',env);
 put(home,'.codex/config.toml','default_mode_request_user_input = false\n');
 const result=runUserUninstall({target:'both',env});expect(result.status).toBe('partial');
 expect(readFileSync(join(home,'.codex/config.toml'),'utf8')).toContain('false');expect(existsSync(configurationReceiptPath(env))).toBe(true);
}));
test('fresh adapter-only uninstall is idempotent',()=>fixture((home,env)=>{
 writeOwnedConfiguration(join(home,'.codex/config.toml'),'default_mode_request_user_input = true\n',env);
 put(home,'.codex/hooks.json',JSON.stringify({hooks:buildManagedHooks('codex')}));
 expect(runUserUninstall({target:'both',env}).exitCode).toBe(0);
 expect(existsSync(join(home,'.codex/hooks.json'))).toBe(false);
 const after=tree(home);expect(runUserUninstall({target:'both',env}).exitCode).toBe(0);expect(tree(home)).toBe(after);
}));
test('target codex retains Claude and shared brain configuration',()=>fixture((home,env)=>{
 writeOwnedConfiguration(join(home,'.codex/config.toml'),'default_mode_request_user_input = true\n',env);
 put(home,'.claude/settings.json',JSON.stringify({hooks:buildManagedHooks('claude')}));
 put(home,'.repo-harness/config.json','{"brainRoot":"/archive"}');
 const claude=readFileSync(join(home,'.claude/settings.json'),'utf8');
 expect(runUserUninstall({target:'codex',env}).exitCode).toBe(0);
 expect(readFileSync(join(home,'.claude/settings.json'),'utf8')).toBe(claude);expect(existsSync(join(home,'.repo-harness/config.json'))).toBe(true);
}));
test('old unreceipted TOML and opaque trust state produce explicit unresolved output',()=>fixture((home,env)=>{
 put(home,'.codex/config.toml','default_mode_request_user_input = true\n[hooks.state]\nopaque = true\n');
 const result=runUserUninstall({target:'both',env});expect(result.exitCode).toBe(1);expect(result.lines.join('\n')).toContain('no installation provenance');expect(result.lines.join('\n')).toContain('no verified command mapping');
}));
test('CLI dry-run JSON creates no lock, receipt or directories',()=>fixture((home,env)=>{
 const before=tree(home);const result=spawnSync('bun',[CLI,'uninstall','--dry-run','--json'],{env:{...env,BUN_RUNTIME_TRANSPILER_CACHE_PATH:'0'},encoding:'utf8'});
 expect(result.status).toBe(0);expect(JSON.parse(result.stdout).dryRun).toBe(true);expect(tree(home)).toBe(before);
}));
test('malformed receipt prevents all mutation',()=>fixture((home,env)=>{
 put(home,'.repo-harness/configuration-restore.json','{"protocol":999}');
 put(home,'.codex/hooks.json',JSON.stringify({hooks:buildManagedHooks('codex')}));
 const before=tree(home);expect(runUserUninstall({target:'both',env}).exitCode).toBe(1);expect(tree(home)).toBe(before);
}));
test('symlinked host root is never traversed for cleanup',()=>fixture((home,env)=>{
 put(home,'outside/hooks.json',JSON.stringify({hooks:buildManagedHooks('codex')}));symlinkSync(join(home,'outside'),join(home,'.codex'));
 const before=readFileSync(join(home,'outside/hooks.json'),'utf8');expect(runUserUninstall({target:'both',env}).exitCode).toBe(1);expect(readFileSync(join(home,'outside/hooks.json'),'utf8')).toBe(before);
}));

test('restores existing MCP config without deleting sibling registrations or permissions',()=>fixture((home,env)=>{
 const path=join(home,'.claude.json');
 put(home,'.claude.json',JSON.stringify({mcpServers:{codegraph:{command:'original'},user:{command:'keep'}},allowedTools:['user-tool']}));
 writeOwnedConfiguration(path,JSON.stringify({mcpServers:{codegraph:{command:'new'},user:{command:'keep'}},allowedTools:['user-tool','mcp__codegraph__*']}),env);
 const result=runUserUninstall({target:'claude',env});expect(result.status,result.lines.join('\n')).toBe('complete');
 expect(JSON.parse(readFileSync(path,'utf8'))).toEqual({mcpServers:{codegraph:{command:'original'},user:{command:'keep'}},allowedTools:['user-tool']});
 expect(runUserUninstall({target:'claude',env}).status).toBe('complete');
}));
test('restores Codex MCP section while preserving other TOML tables',()=>fixture((home,env)=>{
 const path=join(home,'.codex/config.toml');
 put(home,'.codex/config.toml','model = "user"\n[mcp_servers.other]\ncommand = "keep"\n');
 writeOwnedConfiguration(path,'model = "user"\n[mcp_servers.other]\ncommand = "keep"\n[mcp_servers.codegraph]\ncommand = "cg"\n',env);
 expect(runUserUninstall({target:'codex',env}).status).toBe('complete');
 expect(readFileSync(path,'utf8')).toBe('model = "user"\n[mcp_servers.other]\ncommand = "keep"\n');
}));

function profile(home: string, entries: any[]) {
 put(home,'.repo-harness/install-state.json',JSON.stringify({protocol:2,profile:'minimal',components:PROFILE_COMPONENTS.minimal,transaction_id:'fixture',applied_at:new Date().toISOString(),ownership_manifest:entries,previous:null}));
}
function ownedFile(path: string, content: string) { return {components:['planning-integrations'],authority:'repo-harness-install-transaction',removal:'managed-surfaces-only',path,type:'managed-file',content_hash:`sha256:${createHash('sha256').update(content).digest('hex')}`,managed_marker:'transaction-created-file',symlink_target:null}; }
test('removes profile-owned rules and retires profile but preserves user files',()=>fixture((home,env)=>{
 const path=join(home,'.codex/rules/anti-patterns.md');put(home,'.codex/rules/anti-patterns.md','owned');put(home,'.codex/rules/user.md','user');
 profile(home,[ownedFile(path,'owned')]);
 expect(runUserUninstall({target:'both',env}).status).toBe('complete');expect(existsSync(path)).toBe(false);
 expect(readFileSync(join(home,'.codex/rules/user.md'),'utf8')).toBe('user');expect(existsSync(join(home,'.repo-harness/install-state.json'))).toBe(false);
}));
test('modified profile-owned rule remains retryable with ownership retained',()=>fixture((home,env)=>{
 const path=join(home,'.codex/rules/anti-patterns.md');put(home,'.codex/rules/anti-patterns.md','user-edited');profile(home,[ownedFile(path,'owned')]);
 expect(runUserUninstall({target:'both',env}).status).toBe('partial');expect(readFileSync(path,'utf8')).toBe('user-edited');expect(existsSync(join(home,'.repo-harness/install-state.json'))).toBe(true);
}));
test('owned symlink removal never follows the skill source',()=>fixture((home,env)=>{
 put(home,'source/SKILL.md','keep');mkdirSync(join(home,'.codex/skills'),{recursive:true});const path=join(home,'.codex/skills/check');symlinkSync(join(home,'source'),path);
 profile(home,[{...ownedFile(path,''),type:'symlink',content_hash:null,managed_marker:null,symlink_target:join(home,'source')}]);
 expect(runUserUninstall({target:'both',env}).status).toBe('complete');expect(existsSync(path)).toBe(false);expect(readFileSync(join(home,'source/SKILL.md'),'utf8')).toBe('keep');
}));
test('managed context block cleanup keeps user prose',()=>fixture((home,env)=>{
 put(home,'.codex/AGENTS.md','user-before\n<!-- BEGIN: repo-harness global-working-rules -->\nmanaged\n<!-- END: repo-harness global-working-rules -->\nuser-after\n');
 expect(runUserUninstall({target:'codex',env}).status).toBe('complete');expect(readFileSync(join(home,'.codex/AGENTS.md'),'utf8')).toBe('user-before\n\nuser-after\n');
}));

test('old transaction-owned MCP projection composes with hook removal',()=>fixture((home,env)=>{
 const path=join(home,'.claude/settings.json');
 const server={command:'cg'};const allowedTools=['user-tool','mcp__codegraph__*'];
 put(home,'.claude/settings.json',JSON.stringify({mcpServers:{codegraph:server,user:{command:'keep'}},allowedTools,hooks:buildManagedHooks('claude')}));
 const projection=JSON.stringify({server,allowedTools:['mcp__codegraph__*']});
 profile(home,[{...ownedFile(path,''),components:['codegraph-conditional'],managed_marker:'codegraph-config-projection',content_hash:`sha256:${createHash('sha256').update(projection).digest('hex')}`}]);
 const result=runUserUninstall({target:'both',env});expect(result.status,result.lines.join('\n')).toBe('complete');
 expect(JSON.parse(readFileSync(path,'utf8'))).toEqual({mcpServers:{user:{command:'keep'}},allowedTools:['user-tool']});
}));
test('historical receipt cannot delete a user same-value setting after no-op reinstall',()=>fixture((home,env)=>{
 const path=join(home,'.codex/config.toml');
 writeOwnedConfiguration(path,'default_mode_request_user_input = true\n',env);
 expect(runUserUninstall({target:'codex',env}).status).toBe('complete');
 put(home,'.codex/config.toml','default_mode_request_user_input = true\n');
 // A no-op writer must not acquire a new installation ownership epoch.
 writeOwnedConfiguration(path,'default_mode_request_user_input = true\n',env);
 const result=runUserUninstall({target:'codex',env});
 expect(readFileSync(path,'utf8')).toContain('true');expect(result.status).toBe('partial');
}));
