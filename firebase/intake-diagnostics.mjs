// Safe display values only: never expose SDK messages, tokens or document payloads.
const codes=new Set(['permission-denied','unauthenticated','unavailable','aborted','failed-precondition','invalid-argument','resource-exhausted','deadline-exceeded','not-found','internal','unknown']);
export function safeFailure(stage,error){const code=typeof error?.code==='string'?error.code.replace(/^firestore\//,''):'';return {stage,code:codes.has(code)?code:'local-error'};}
export async function ingestAndVerify(store,manifest,{onProgress=()=>{}}={}){
 let stage='session-check',completed=0;
 const report=state=>onProgress({state,completed,total:manifest.entries.length});
 try{report('importing');await store.ingest(manifest,{onStage:value=>{stage=value;if(value==='case-committed'){completed++;report(completed<manifest.entries.length?'partial':'verifying');}}});stage='readback';report('verifying');const rows=await store.readback(manifest);report('verified');return {ok:true,rows};}
 catch(error){report(completed?'partial':'failed');return {ok:false,...safeFailure(stage,error)};}
}
export async function inspectAndVerify(store,manifest){
 let stage='inspection';
 try{
  const observation=await store.inspectSynthetic(manifest);
  if(!observation.registryExists||!observation.receiptExists||observation.cases.some(c=>!c.exists||!c.historyExists))return {ok:true,verified:false,observation};
  stage='inspection-readback';const rows=await store.readback(manifest);return {ok:true,verified:true,observation,rows};
 }catch(error){return {ok:false,...safeFailure(stage,error)};}
}
