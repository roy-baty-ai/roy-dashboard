import {digest,stableId} from './intake.mjs';
import {canonicalJSON} from './store.mjs';
const fail=code=>{throw Object.assign(Error(code),{code});};
const secretPattern=/-----BEGIN .*PRIVATE KEY-----|\bBearer\s+\S+|\b(refresh_token|access_token|id_token|client_secret)\s*[:=]/i;
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max&&!secretPattern.test(v);
export function validateWorkResult(event){
 const keys=['schemaVersion','eventId','caseId','progress','nextAction','completedAt','receivedAt','evidence'];
 if(!event||Array.isArray(event)||Object.keys(event).some(k=>!keys.includes(k))||event.schemaVersion!==1||!stableId(event.caseId)||!text(event.eventId,100)||!/^[a-zA-Z0-9._:-]+$/.test(event.eventId)||!text(event.progress,500)||!text(event.nextAction,2000))fail('invalid-argument');
 if(event.completedAt!==null&&!globalThis.OutboundModel.validDate(event.completedAt))fail('invalid-argument');
 if(!globalThis.OutboundModel.validDate(event.receivedAt)||!Array.isArray(event.evidence)||event.evidence.length<1||event.evidence.length>5||event.evidence.some(e=>!text(e,500)))fail('invalid-argument');
 if(event.completedAt&&Date.parse(event.completedAt)>Date.parse(event.receivedAt))fail('invalid-argument');
 return structuredClone(event);
}
const prefix='ROY_WORK_RESULT ';
export async function workResultPatch(old,input){
 const event=validateWorkResult(input),hash=await digest(event);
 const note=old.payload.internal_note;
 if(typeof note!=='string')fail('failed-precondition');
 let latest=null;
 const retained=[];
 for(const line of note.split('\n')){
  if(!line.startsWith(prefix)){retained.push(line);continue;}
  let saved;try{saved=JSON.parse(line.slice(prefix.length));}catch{fail('failed-precondition');}
  if(saved.eventId===event.eventId){if(saved.hash!==hash)fail('failed-precondition');return {unchanged:true,operationId:hash};}
  if(globalThis.OutboundModel.validDate(saved.receivedAt)&&(!latest||Date.parse(saved.receivedAt)>Date.parse(latest)))latest=saved.receivedAt;
 }
 if(latest&&Date.parse(event.receivedAt)<=Date.parse(latest))return {replayLookup:true,operationId:hash};
 const receipt={eventId:event.eventId,hash,progress:event.progress,completedAt:event.completedAt,receivedAt:event.receivedAt,evidence:event.evidence};
 const patch={next_action:event.nextAction,internal_note:[retained.join('\n'),prefix+canonicalJSON(receipt)].filter(Boolean).join('\n')};
 if(patch.internal_note.length>4000)fail('resource-exhausted');
 // Only an actual supplied completion/check time can update business freshness.
 // Coordinator receipt time never substitutes for missing completion time.
 if(event.completedAt){
  const previous=old.payload.last_checked_at;
  if(globalThis.OutboundModel.validDate(previous)&&Date.parse(event.completedAt)<Date.parse(previous))fail('failed-precondition');
  patch.last_checked_at=event.completedAt;
 }
 return {unchanged:false,operationId:hash,patch};
}
export function findWorkReceipt(record,eventId){
 if(typeof record?.payload?.internal_note!=='string')return null;
 for(const line of record.payload.internal_note.split('\n')){
  if(!line.startsWith(prefix))continue;
  try{const saved=JSON.parse(line.slice(prefix.length));if(saved.eventId===eventId)return saved;}catch{fail('failed-precondition');}
 }
 return null;
}
export function containsWorkResult(record,eventId,hash){
 return typeof record?.payload?.internal_note==='string'&&record.payload.internal_note.split('\n').some(line=>{
  if(!line.startsWith(prefix))return false;
  try{const v=JSON.parse(line.slice(prefix.length));return v.eventId===eventId&&v.hash===hash;}catch{return false;}
 });
}
export function createWorkResultConsumer(store,{caseIds,onStatus=()=>{}}){
 if(!Array.isArray(caseIds)||!caseIds.length||caseIds.some(id=>!stableId(id))||new Set(caseIds).size!==caseIds.length)fail('invalid-argument');
 const allowed=new Set(caseIds);let queue=Promise.resolve();
 return event=>{
  const execute=async()=>{
   let normalized;try{normalized=validateWorkResult(event);if(!allowed.has(normalized.caseId))fail('permission-denied');
    onStatus({state:'saving'});const result=await store.saveWorkResult(normalized);onStatus({state:'verified',revision:result.revision,unchanged:result.unchanged});return result;
   }catch(error){const codes=new Set(['invalid-argument','permission-denied','unauthenticated','failed-precondition','resource-exhausted','unavailable','aborted']);const code=codes.has(error?.code)?error.code:'local-error';onStatus({state:'failed',code});throw Object.assign(Error(code),{code});}
  };
  const next=queue.then(execute);queue=next.catch(()=>{});return next;
 };
}
