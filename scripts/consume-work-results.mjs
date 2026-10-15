// Auth is supplied by an explicitly approved runtime adapter, never obtained here.
// Stream input is private NDJSON; output contains only safe operational states.
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {createWorkResultConsumer} from '../firebase/work-results.mjs';
export async function consumeWorkResults(lines,{store,caseIds,onStatus=()=>{}}){
 const save=createWorkResultConsumer(store,{caseIds,onStatus});
 for await(const line of lines){
  if(!line.trim())continue;
  if(line.length>8000)throw Object.assign(Error('invalid-argument'),{code:'invalid-argument'});
  let event;try{event=JSON.parse(line);}catch{throw Object.assign(Error('invalid-argument'),{code:'invalid-argument'});}
  await save(event);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const output=value=>process.stdout.write(JSON.stringify(value)+'\n');
 try{
  const adapterPath=process.argv[2];if(!adapterPath)throw Object.assign(Error('authentication-adapter-required'),{code:'authentication-adapter-required'});
  const adapter=await import(pathToFileURL(adapterPath).href);
  const connection=await adapter.connectApprovedStore();
  await consumeWorkResults(createInterface({input:process.stdin,crlfDelay:Infinity}),{...connection,onStatus:output});
 }catch{output({state:'stopped',code:'connection-or-update-unconfirmed'});process.exitCode=1;}
}
