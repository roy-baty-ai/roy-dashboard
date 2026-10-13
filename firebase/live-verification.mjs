// Only the synthetic-mode UI invokes this after publication approval.
// Writes are limited to malformed synthetic case/history attempts. Never write admins or controls.
import {ROY_UID,digest} from './intake.mjs';
export async function probeSyntheticDenials(sdk,app,auth,{space,testOnly,onResult=()=>{}}={}){
 if(space!=='synthetic'||testOnly!==true)throw Error('Synthetic mode required');
 const startingUid=auth.currentUser?.uid;if(!startingUid)throw Error('Existing signed-in session required');
 const base='privateRoy/synthetic',db=sdk.getFirestore(app),ref=p=>sdk.doc(db,p),results=[];
 const report=r=>{results.push(r);onResult(r);};
 async function denied(check,fn){
  if(auth.currentUser?.uid!==startingUid)throw Error('Session changed; verification stopped');
  try{await fn();}catch(e){if(e.code==='permission-denied'){report({check,result:'PASS',code:e.code});return;}report({check,result:'ERROR',code:e.code||'unknown'});throw e;}
  report({check,result:'FAIL',code:'UNEXPECTED_ALLOW'});throw Error(`${check}: unexpectedly allowed; STOP`);
 }
 const read=(database,path)=>sdk.runTransaction(database,tx=>tx.get(sdk.doc(database,path)));
 if(startingUid!==ROY_UID){
  for(const path of [`${base}/cases/roy-web-0001`,`${base}/cases/roy-web-0001/history/1`,`${base}/registry/current`])await denied(`signed-in non-admin GET ${path}`,()=>read(db,path));
  report({check:'synthetic malformed writes',result:'NOTRUN',code:'ROY_SESSION_REQUIRED'});
  return {results,writeAttempts:0};
 }
 const current=await sdk.runTransaction(db,async tx=>{const control=await tx.get(ref(`${base}/control/state`));if(control.data()?.mode!=='active')throw Error('Synthetic control must be active before write-denial verification');const s=await tx.get(ref(`${base}/cases/roy-web-0001`));if(!s.exists())throw Error('First import the synthetic fixture');return s.data();});
 const next={...current,revision:current.revision+1,changeKind:'manual',operationId:await digest({probe:'missing-history',revision:current.revision}),payload:{...current.payload,next_action:'synthetic denial probe'},updatedAt:sdk.serverTimestamp(),updatedBy:ROY_UID};
 await denied('case update without atomic history',()=>sdk.runTransaction(db,async tx=>{await tx.get(ref(`${base}/cases/roy-web-0001`));tx.set(ref(`${base}/cases/roy-web-0001`),next);}));
 const tamper={...next,payload:{...next.payload,email:{body:'forged synthetic source body'}}};
 await denied('manual source/email mutation even with history',()=>sdk.runTransaction(db,async tx=>{await tx.get(ref(`${base}/cases/roy-web-0001`));tx.set(ref(`${base}/cases/roy-web-0001`),tamper);tx.set(ref(`${base}/cases/roy-web-0001/history/${tamper.revision}`),{record:tamper});}));
 const anon=sdk.initializeApp(app.options,`roy-denial-${Date.now()}`),anonAuth=sdk.getAuth(anon);await sdk.setPersistence(anonAuth,sdk.inMemoryPersistence);const adb=sdk.initializeFirestore(anon,{localCache:sdk.memoryLocalCache()});
 for(const path of [`${base}/cases/roy-web-0001`,`${base}/cases/roy-web-0001/history/${current.revision}`,`${base}/intakes/${current.source.intakeId}`])await denied(`anonymous GET ${path}`,()=>read(adb,path));
 if(auth.currentUser?.uid!==startingUid)throw Error('Session changed; verification stopped');
 const after=await read(db,`${base}/cases/roy-web-0001`);if(after.data().revision!==current.revision)throw Error('Denial probes changed data');
 report({check:'synthetic revision unchanged',result:'PASS'});
 report({check:'signed-in non-admin GET',result:'NOTRUN',code:'USE_EXISTING_NON_ADMIN_SESSION'});
 return {results,revisionUnchanged:true};
}
