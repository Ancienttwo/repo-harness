import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { decodePipelineBoard, unavailableBoard, type PipelineBoardV2 } from '../../core/pipeline/projection';
const run=promisify(execFile);
export interface PipelineStatusReadInput {env?:NodeJS.ProcessEnv}
// A failed refresh retains the last good CLI snapshot and its original times.
export function createPipelineStatusReader() {
  let last:PipelineBoardV2|null=null;
  return async (input:PipelineStatusReadInput={}):Promise<PipelineBoardV2>=>{
    try {
      const {stdout}=await run('repo-harness',['pipeline','list','--json','--projection','board'],{env:{...process.env,...input.env},encoding:'utf8',timeout:10000,maxBuffer:8*1024*1024});
      const board=decodePipelineBoard(JSON.parse(stdout));
      if(board.status==='unavailable')return last?{...last,status:'unavailable'}:board;
      last=board;return board;
    }catch{return last?{...last,status:'unavailable'}:unavailableBoard();}
  };
}
export const readPipelineStatus=createPipelineStatusReader();
