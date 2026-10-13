import {canonicalJSON} from './store.mjs';

// These private, immutable documents are preparation only: they never publish a case.
// Each part is a separate bounded Rules request; the certificate verifies all eight.
export function evidenceDocuments(space,intakeId,caseId,payload){
 if(!['real','synthetic'].includes(space)||!/^[0-9a-f]{64}$/.test(intakeId)||!/^roy-web-[0-9]{4}$/.test(caseId))throw Error('Invalid evidence identity');
 const base=`privateRoy/${space}/validation/${intakeId}/cases/${caseId}`;
 const value=(confirmed,missing,restrictions)=>({confirmed,missing,restrictions,confirmedCodes:confirmed.map(g=>g.code),missingCodes:missing.map(g=>g.code)});
 const docs=Array.from({length:8},(_,i)=>({path:`${base}/parts/${i}`,data:value(payload.confirmed_gates.slice(i*4,i*4+4),payload.missing_gates.slice(i*2,i*2+2),payload.restrictions.slice(i*4,i*4+4))}));
 docs.push({path:base,data:value(payload.confirmed_gates,payload.missing_gates,payload.restrictions)});
 return docs;
}

export async function stageEvidence(sdk,db,space,intakeId,entry){
 for(const {path,data} of evidenceDocuments(space,intakeId,entry.caseId,entry.payload)){
  await sdk.runTransaction(db,async tx=>{
   const ref=sdk.doc(db,path);
   const [existing,control]=await Promise.all([tx.get(ref),tx.get(sdk.doc(db,`privateRoy/${space}/control/state`))]);
   if(control.data()?.mode!=='active'||control.data()?.allowSourceIngest!==true)throw Error('Source ingestion paused');
   if(existing.exists()){
    if(canonicalJSON(existing.data())!==canonicalJSON(data))throw Error('Evidence validation collision');
   }else tx.set(ref,data);
  });
 }
}
