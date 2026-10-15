// Source: the existing private queue report, not a public endpoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest,stableId} from '../firebase/intake.mjs';
import {validateWorkResult,createWorkResultConsumer} from '../firebase/work-results.mjs';
const repo=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const fail=code=>{throw Object.assign(Error(code),{code});};
export async function queueReportEvents(report,caseMap){
 if(report?.kind!=='PRIVATE_QUEUE_RECONCILED_NEW_CASE_CANDIDATES_NOT_EXECUTABLE'||!Array.isArray(report.entries)||report.entries.length>50)fail('invalid-source');
 const events=[],blocked=[];
 for(let index=0;index<report.entries.length;index++){
  const row=report.entries[index],id=caseMap[row.privateQueueId];
  if(!stableId(id)){blocked.push({index,code:'verified-case-mapping-required'});continue;}
  if(row.qa?.status!=='private_browser_QA_passed_parent_report'){blocked.push({index,code:'unsupported-work-result'});continue;}
  const receivedAt=row.qa.parent_result_reported_at;
  if(!globalThis.OutboundModel.validDate(receivedAt)){blocked.push({index,code:'actual-result-receipt-time-required'});continue;}
  const completedAt=row.qa.completed_at;
  if(completedAt!==null&&!globalThis.OutboundModel.validDate(completedAt))fail('invalid-source');
  const evidence=['親の非公開QA完了報告。実作業をこのadapterで再実行していません。'];
  for(const [key,label] of [['cloud_thread_id','thread'],['cloud_turn_id','turn'],['library_file_id','Library'],['site_only_zip_sha256','ZIP SHA256']])if(row.qa[key])evidence.push(label+': '+row.qa[key]);
  if(evidence.length>5)fail('invalid-source');
  const work={schemaVersion:1,caseId:id,progress:'非公開見本の4幅QA完了（親の結果報告）',nextAction:'公開URL・公開後QA・メール履歴とowner確認の未完了条件を確認する。',completedAt,receivedAt,evidence};
  const eventId=await digest({privateQueueId:row.privateQueueId,...work});
  events.push(validateWorkResult({...work,eventId}));
 }
 return {events,blocked,sourceRecords:report.entries.length};
}
export async function runPrivateQueueAdapter({sourcePath,caseMap,ackPath,store,signal,once=false,intervalMs=5000,onStatus=()=>{}}){
 const outside=file=>{const abs=path.resolve(file);if(abs===repo||abs.startsWith(repo+path.sep))fail('private-path-required');return abs;};
 sourcePath=outside(sourcePath);ackPath=outside(ackPath);
 const sourceReal=await fs.realpath(sourcePath);outside(sourceReal);
 // Ack contains only processed event hashes, never credentials or task payloads.
 let seen=new Set();try{const saved=JSON.parse(await fs.readFile(ackPath,'utf8'));if(saved.version!==1||!Array.isArray(saved.verifiedEventHashes)||saved.verifiedEventHashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))fail('invalid-ack');seen=new Set(saved.verifiedEventHashes);}catch(e){if(e.code!=='ENOENT')throw e;}
 const consume=store?createWorkResultConsumer(store,{caseIds:[...new Set(Object.values(caseMap))],onStatus}):null;
 const inspect=async()=>{
  const report=JSON.parse(await fs.readFile(sourcePath,'utf8')),batch=await queueReportEvents(report,caseMap);
  onStatus({state:'source-read',sourceRecords:batch.sourceRecords,pending:batch.events.filter(e=>!seen.has(e.eventId)).length,blocked:batch.blocked.length});
  if(!consume){onStatus({state:'not-connected',code:'approved-authenticated-store-required'});return batch;}
  for(const event of batch.events){
   if(signal?.aborted)break;if(seen.has(event.eventId))continue;
   await consume(event);seen.add(event.eventId);
   await fs.mkdir(path.dirname(ackPath),{recursive:true,mode:0o700});
   const tmp=ackPath+'.tmp';await fs.writeFile(tmp,JSON.stringify({version:1,verifiedEventHashes:[...seen]})+'\n',{mode:0o600});await fs.rename(tmp,ackPath);
  }
  return batch;
 };
 let last;do{if(signal?.aborted)break;last=await inspect();if(once||!consume||signal?.aborted)break;await new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,Math.max(1000,intervalMs));signal?.addEventListener('abort',done,{once:true});});}while(!signal?.aborted);
 onStatus({state:signal?.aborted?'stopped':!consume?'source-inspected':'cycle-finished'});return last;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
 const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
 const status=v=>process.stdout.write(JSON.stringify(v)+'\n');
 try{
  const sourcePath=arg('--source'),mapPath=arg('--map'),ackPath=arg('--ack');if(!sourcePath||!mapPath||!ackPath)fail('source-map-ack-required');
  const mapping=JSON.parse(await fs.readFile(mapPath,'utf8'));if(mapping.registryVerified!==true||typeof mapping.caseMap!=='object'||Array.isArray(mapping.caseMap)||Object.values(mapping.caseMap).some(id=>!stableId(id)))fail('verified-case-mapping-required');
  let store;const connectionPath=arg('--connection');
  if(connectionPath){const connection=await import(pathToFileURL(path.resolve(connectionPath)).href);store=(await connection.connectApprovedStore()).store;}
  await runPrivateQueueAdapter({sourcePath,caseMap:mapping.caseMap,ackPath,store,signal:abort.signal,once:process.argv.includes('--once'),onStatus:status});
 }catch(error){const safe=new Set(['invalid-source','invalid-ack','private-path-required','source-map-ack-required','verified-case-mapping-required','permission-denied','unauthenticated','failed-precondition']);status({state:'stopped',code:safe.has(error?.code)?error.code:'connection-or-source-unconfirmed'});process.exitCode=1;}
}
