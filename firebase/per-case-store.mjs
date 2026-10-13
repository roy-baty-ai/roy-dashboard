import {aggregate,canonicalJSON} from './store.mjs';
import {verifyIntake,intakeReceipt,sourceRecord,manualRecord,digest,ROY_UID,stableId,validatePayload} from './intake.mjs';
export function createPerCaseStore(sdk,app,auth,parse,{space='synthetic'}={}){
 if(!['real','synthetic'].includes(space))throw Error('Invalid namespace');
 const db=sdk.initializeFirestore(app,{localCache:sdk.memoryLocalCache()}),base=`privateRoy/${space}`;
 const ref=p=>sdk.doc(db,p),fresh=s=>!s.metadata.fromCache&&!s.metadata.hasPendingWrites;
 const watch=(path,next,error)=>sdk.onSnapshot(ref(path),{includeMetadataChanges:true},s=>next(fresh(s)&&s.exists()?s.data():null),error);
 const uid=()=>{if(auth.currentUser?.uid!==ROY_UID)throw Error('Verified Roy session required');return auth.currentUser.uid;};
 let viewRecords=new Map();
 const api={
  onAuth:fn=>sdk.onIdTokenChanged(auth,fn),
  watchAccess:(id,next,error)=>watch(`admins/${id}`,a=>next(id===ROY_UID&&a?.enabled===true),error),
  watchControl:(next,error)=>watch(`${base}/control/state`,v=>next(v?.mode==='active'?{...v,mode:'firestore'}:v),error),
  watchPublic:next=>{next(null);return()=>{};},
  watchPrivate(next,error){
   let generation=0,stops=[],stopped=false;
   const clear=()=>{generation++;stops.forEach(s=>s());stops=[];viewRecords.clear();next(null);};
   const stop=watch(`${base}/registry/current`,index=>{
    if(stopped)return;clear();if(!index)return;
    if(!Array.isArray(index.caseIds)||index.caseIds.length>50||index.caseIds.some(id=>!stableId(id))||new Set(index.caseIds).size!==index.caseIds.length){error(Error('Invalid case registry'));return;}
    const token=generation,records=new Map();
    const publish=()=>{if(records.size!==index.caseIds.length)return;viewRecords=new Map(records);const cases=index.caseIds.map(id=>records.get(id).payload);const payload={schema_version:1,cases,summary:{operating_revenue_usd_last_recorded:cases.reduce((sum,c)=>sum+c.confirmed_revenue_usd,0)}};const counts=aggregate(payload,parse);Object.assign(payload.summary,{case_count:cases.length,ready_for_human_go:counts.readyCount,not_ready_unsent_count:counts.preparingCount,sent_cases_in_this_view:counts.sentCount});next({payload,revision:index.caseIds.map(id=>`${id}:${records.get(id).revision}`).join(',')||'empty'});};
    if(!index.caseIds.length)publish();
    for(const id of index.caseIds)stops.push(watch(`${base}/cases/${id}`,record=>{if(stopped||token!==generation)return;if(!record){records.delete(id);viewRecords.clear();next(null);return;}records.set(id,record);publish();},e=>{if(stopped||token!==generation)return;clear();error(e);}));
   },e=>{if(!stopped){clear();error(e);}});
   return()=>{stopped=true;stop();clear();};
  },
  logout:()=>{viewRecords.clear();return sdk.signOut(auth);},
  async save(id,patch,revision){
   const user=uid(),visible=viewRecords.get(id);if(!visible||!revision.split(',').includes(`${id}:${visible.revision}`))throw Error('Fresh case required');
   const operationId=await digest({kind:'manual',caseId:id,revision:visible.revision,patch});
   return sdk.runTransaction(db,async tx=>{
    const [control,snap]=await Promise.all([tx.get(ref(`${base}/control/state`)),tx.get(ref(`${base}/cases/${id}`))]);
    if(control.data()?.mode!=='active'||!snap.exists())throw Error('Writes paused');
    const result=manualRecord(snap.data(),patch,visible.revision,operationId);if(result.unchanged)return;
    const record={...result.record,updatedBy:user,updatedAt:sdk.serverTimestamp()};
    tx.set(ref(`${base}/cases/${id}`),record);tx.set(ref(`${base}/cases/${id}/history/${record.revision}`),{record});
   });
  },
  async ingest(input,{onStage=()=>{}}={}){
   onStage('session-check');const user=uid();onStage('manifest-check');const m=await verifyIntake(input,{space}),receipt=intakeReceipt(m);
   // One bounded transaction per case. A partial intake is resumable; it is never reported as fully imported.
   const outcomes=[];
   for(const e of m.entries){onStage('transaction-start');outcomes.push(await sdk.runTransaction(db,async tx=>{
    onStage('transaction-read');
    const [control,index,intake,current]=await Promise.all([tx.get(ref(`${base}/control/state`)),tx.get(ref(`${base}/registry/current`)),tx.get(ref(`${base}/intakes/${m.manifestHash}`)),tx.get(ref(`${base}/cases/${e.caseId}`))]);
    onStage('transaction-validate');
    if(control.data()?.mode!=='active'||control.data()?.allowSourceIngest!==true)throw Error('Source ingestion paused');
    if(intake.exists()&&canonicalJSON(intake.data())!==canonicalJSON(receipt))throw Error('Intake receipt collision');
    const result=sourceRecord(current.exists()?current.data():null,e,m);
    if(result.unchanged)return {caseId:e.caseId,status:'unchanged',revision:current.data().revision};
    const ids=index.exists()?[...index.data().caseIds]:[];if(!ids.includes(e.caseId))ids.push(e.caseId);if(ids.length>50)throw Error('Case registry limit');
    onStage('transaction-build');
    if(!intake.exists())tx.set(ref(`${base}/intakes/${m.manifestHash}`),receipt);
    if(!index.exists()||ids.length!==index.data().caseIds.length)tx.set(ref(`${base}/registry/current`),{caseIds:ids,revision:(index.data()?.revision||0)+1,intakeId:m.manifestHash,updatedBy:user,updatedAt:sdk.serverTimestamp()});
    const record={...result.record,updatedBy:user,updatedAt:sdk.serverTimestamp()};
    tx.set(ref(`${base}/cases/${e.caseId}`),record);tx.set(ref(`${base}/cases/${e.caseId}/history/${record.revision}`),{record});
    onStage('transaction-commit');return {caseId:e.caseId,status:'written',revision:record.revision};
   }));}
   return {manifestHash:m.manifestHash,outcomes,readbackRequired:true};
  },
  async inspectSynthetic(input){
   if(space!=='synthetic')throw Error('Synthetic mode required');
   uid();const m=await verifyIntake(input,{space});
   return sdk.runTransaction(db,async tx=>{
    const [control,index,intake]=await Promise.all([tx.get(ref(`${base}/control/state`)),tx.get(ref(`${base}/registry/current`)),tx.get(ref(`${base}/intakes/${m.manifestHash}`))]);
    const cases=[];
    for(const e of m.entries){
     const snap=await tx.get(ref(`${base}/cases/${e.caseId}`));
     if(!snap.exists()){cases.push({caseId:e.caseId,exists:false});continue;}
     const r=snap.data(),revision=Number.isSafeInteger(r.revision)&&r.revision>0&&r.revision<=1000000?r.revision:null;
     const h=revision===null?null:await tx.get(ref(`${base}/cases/${e.caseId}/history/${revision}`));
     cases.push({caseId:e.caseId,exists:true,revision,historyExists:h?.exists()===true,sourceMatches:r.source?.intakeId===m.manifestHash&&r.source?.hash===e.sourceHash&&r.source?.version===e.sourceVersion});
    }
    return {controlExists:control.exists(),controlActive:control.data()?.mode==='active',sourceIngestAllowed:control.data()?.allowSourceIngest===true,registryExists:index.exists(),registryIncludesCases:Array.isArray(index.data()?.caseIds)&&m.entries.every(e=>index.data().caseIds.includes(e.caseId)),receiptExists:intake.exists(),receiptMatches:intake.exists()&&canonicalJSON(intake.data())===canonicalJSON(intakeReceipt(m)),cases};
   });
  },
  async readback(input){
   uid();const m=await verifyIntake(input,{space});
   // Read-only transaction obtains server documents, independent of the view cache.
   return sdk.runTransaction(db,async tx=>{
    const [index,intake]=await Promise.all([tx.get(ref(`${base}/registry/current`)),tx.get(ref(`${base}/intakes/${m.manifestHash}`))]);
    if(!index.exists()||!Array.isArray(index.data().caseIds)||index.data().caseIds.length>50||index.data().caseIds.some(id=>!stableId(id))||new Set(index.data().caseIds).size!==index.data().caseIds.length||!intake.exists()||canonicalJSON(intake.data())!==canonicalJSON(intakeReceipt(m)))throw Error('Registry/receipt readback mismatch');
    const rows=[];for(const e of m.entries){const s=await tx.get(ref(`${base}/cases/${e.caseId}`));if(!s.exists())throw Error('Missing case');const r=s.data();const h=await tx.get(ref(`${base}/cases/${e.caseId}/history/${r.revision}`));const expectedSource={repo:m.sourceRepo,commit:m.sourceCommit,path:e.sourcePath,key:e.sourceKey,version:e.sourceVersion,hash:e.sourceHash,intakeId:m.manifestHash};validatePayload(r.payload,e.caseId);if(!index.data().caseIds.includes(e.caseId)||canonicalJSON(r.source)!==canonicalJSON(expectedSource)||r.revision<e.expectedRevision+1||r.updatedBy!==ROY_UID||await digest(r.sourceData)!==e.sourceHash||!h.exists()||canonicalJSON(h.data().record)!==canonicalJSON(r))throw Error('Readback mismatch');rows.push({caseId:e.caseId,revision:r.revision,sourceVersion:r.source.version,status:r.payload.status});}return rows;
   });
  }
 };
 return api;
}
