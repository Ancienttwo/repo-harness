import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { PipelineError, PHASES, equal, object, type Key, type Phase } from '../../core/pipeline/types';
import { newPipeline, mutatePipeline, reverifyRestoredStore } from '../../effects/pipeline/ledger';
import { ingestEvent } from '../../effects/pipeline/ingest';
import { validateOnSource, type AuthorityQuery } from '../../effects/pipeline/authority';
import { PipelineStore, exportSnapshot, storeFailure } from '../../effects/pipeline/store';
import { readPipelineSnapshot, readPipelineStatus, readPipelineListView, readPipelineHealth } from '../../effects/pipeline/read';

const payload=(path:string)=>{const bytes=readFileSync(path==='-'?0:path);if(bytes.length>8*1024*1024)throw new PipelineError('usage',2,'Payload exceeds 8 MiB');try{return JSON.parse(bytes.toString('utf8'));}catch{throw new PipelineError('usage',2,'Payload is not valid JSON');}};
const number=(value:string|undefined)=>value===undefined?undefined:Number(value);
const key=(o:any):Key=>({source_host:o.sourceHost,repository_id:o.repositoryId,task:o.task});
function scoped(c:Command):Command{return c.requiredOption('--source-host <host>').requiredOption('--repository-id <value>').requiredOption('--task <value>');}
function output(fn:()=>unknown):void {
  try{process.stdout.write(JSON.stringify(fn())+'\n');}
  catch(error){const e=storeFailure(error);process.stdout.write(JSON.stringify({error:{code:e.code,retryable:e.retryable,message:e.message}})+'\n');process.exitCode=e.exit;}
}
function write(o:any,fn:(store:PipelineStore)=>unknown):unknown {const store=new PipelineStore({wait_ms:number(o.waitMs)});try{return fn(store);}finally{store.close();}}
export function buildPipelineCommand():Command {
  const command=new Command('pipeline').description('Observer ledger. It never dispatches, merges or cleans.');
  command.command('new').requiredOption('--source-host <host>').requiredOption('--repository-id <value>')
    .option('--title <s>').option('--adopt-task <task>').option('--root <path>').option('--issue <n>').option('--brief <path>').option('--idem-key <key>').option('--backfill').option('--phase <p>').option('--note <s>').option('--json').action(o=>output(()=>write(o,s=>newPipeline(s,{source_host:o.sourceHost,repository_id:o.repositoryId,title:o.title,adopt_task:o.adoptTask,root:o.root,brief:o.brief,issue:number(o.issue),idem_key:o.idemKey,backfill:o.backfill,phase:o.phase,note:o.note}))));
  scoped(command.command('record')).requiredOption('--kind <kind>').requiredOption('--payload <file|->').option('--state-version <n>').option('--reconcile').option('--command-key <key>').option('--wait-ms <ms>').option('--json').option('--validate-only','Source-host authority channel. Payload is an AuthorityQuery. It opens no ledger.').action(o=>output(()=>{
    const value=object(payload(o.payload));
    if(o.validateOnly) {
      const query=value as unknown as AuthorityQuery;
      if(!equal(query.key,key(o))||query.kind!==o.kind)throw new PipelineError('usage',2,'Authority query must match the explicit selectors and kind');
      return validateOnSource(query);
    }
    const version=number(o.stateVersion);
    if(!Number.isSafeInteger(version)||version!<1)throw new PipelineError('usage',2,'state-version is required');
    return write(o,s=>mutatePipeline(s,key(o),{op:'record',kind:o.kind,payload:value,state_version:version!,command_key:o.commandKey,reconcile:o.reconcile}));
  }));
  scoped(command.command('advance')).requiredOption('--to <phase>').option('--reason <s>').requiredOption('--state-version <n>').option('--command-key <key>').option('--wait-ms <ms>').option('--json').action(o=>output(()=>write(o,s=>mutatePipeline(s,key(o),{op:'advance',to:o.to as Phase,reason:o.reason,state_version:Number(o.stateVersion),command_key:o.commandKey}))));
  scoped(command.command('status')).option('--events').option('--limit <n>').option('--evidence <idx>').option('--json').action(o=>output(()=>readPipelineStatus(key(o),{events:o.events,limit:number(o.limit),evidence:number(o.evidence)})));
  command.command('health').option('--json').action(()=>output(()=>readPipelineHealth()));
  command.command('list').option('--repo <id>').option('--phase <phase>').option('--summary').option('--projection <name>').option('--json').action(o=>output(()=>{
    if(o.projection!==undefined&&o.projection!=='board')throw new PipelineError('usage',2,'Only board projection is supported');
    if(!o.projection)return readPipelineListView(process.env,o.repo,o.phase);
    const board=readPipelineSnapshot();return {...board,cards:board.cards.filter(c=>(!o.repo||c.repo===o.repo)&&(!o.phase||c.phase===o.phase))};
  }));
  command.command('ingest-event').requiredOption('--payload <file|->').option('--snapshot').option('--source <s>').option('--delivery-id <id>').option('--wait-ms <ms>').option('--json').action(o=>output(()=>write(o,s=>ingestEvent(s,payload(o.payload),{source:o.source,delivery_id:o.deliveryId,snapshot:o.snapshot}))));
  command.command('export-snapshot').option('--out <path>').option('--restore-epoch', 'Mark an explicitly restored store for source re-verification').option('--reverify', 'Reverify all restored source observations').option('--json').action(o=>output(()=>write(o,s=>{if(o.restoreEpoch&&o.reverify)throw new PipelineError('usage',2,'Restore and reverify are separate operations');if(o.restoreEpoch)s.restoreEpoch();if(o.reverify)reverifyRestoredStore(s);return exportSnapshot(s,o.out);})));
  for(const child of [command,...command.commands])child.configureOutput({writeErr:str=>process.stderr.write(str)}).exitOverride(error=>{if(error.code==='commander.helpDisplayed')throw error;process.stdout.write(JSON.stringify({error:{code:'usage',retryable:false,message:error.message}})+'\n');process.exit(2);});
  return command;
}
