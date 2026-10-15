// No deploy, provisioning or persistent auth. A private CI worker invokes this
// after WIF, dedicated writer Rules and the kill switch are separately approved.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,setPersistence,inMemoryPersistence,signInWithCustomToken,signOut} from 'firebase/auth';
import * as sdk from 'firebase/firestore';
import {createPerCaseStore} from '../firebase/per-case-store.mjs';
import {createOperationsStore,validateOperation} from '../firebase/operations.mjs';
import {validateWorkResult} from '../firebase/work-results.mjs';
import {verifyIntake} from '../firebase/intake.mjs';
import {ingestAndVerify} from '../firebase/intake-diagnostics.mjs';
import {assertApprovedJob,mintWriterToken,WRITER_UID} from './writer-auth.mjs';
export async function runBatch(input,{cases,operations}){
 try{
 if(input?.schemaVersion!==1||input.space!=='real'||!Array.isArray(input.items)||input.items.length>100||Object.keys(input).some(k=>!['schemaVersion','space','items'].includes(k)))throw Error('Invalid batch');
 const items=[],targets=new Set();
 for(const item of input.items){
  if(!item||Object.keys(item).some(k=>!['kind','value'].includes(k)))throw Error('Invalid item');
  const value=item.kind==='business'?validateOperation(item.value):item.kind==='work-result'?validateWorkResult(item.value):item.kind==='intake'?await verifyIntake(item.value,{space:'real'}):null;
  if(!value)throw Error('Invalid item');const target=item.kind==='business'?'business:'+value.businessId:item.kind==='work-result'?'case:'+value.caseId:null;
  const keys=target?[target]:value.entries.map(e=>'case:'+e.caseId);for(const key of keys){if(targets.has(key))throw Error('One result per entity per job');targets.add(key);}
  items.push({kind:item.kind,value});
 }
  for(const item of items){
   if(item.kind==='business')await operations.saveOperation(item.value);
   else if(item.kind==='work-result')await cases.saveWorkResult(item.value);
   else {const result=await ingestAndVerify(cases,item.value);if(!result.ok)throw Object.assign(Error(),{code:result.code});}
  }
  await operations.saveSync('ok');return {state:'verified',items:items.length};
 }catch(error){
  const code=error?.code==='aborted'?'conflict':['permission-denied','unavailable'].includes(error?.code)?error.code:'validation';
  await operations.saveSync('failed',code).catch(()=>{});throw Object.assign(Error('result-job-failed'),{code});
 }
}
export async function runApprovedJob({config,input,getClient,env=process.env}){
 assertApprovedJob(env);
 if(config?.projectId!=='roy-dashboard-20261008')throw Error('Wrong project');
 const app=initializeApp(config,'roy-results-worker'),auth=getAuth(app);let db;
 try{
  await setPersistence(auth,inMemoryPersistence);
  const token=await mintWriterToken(await getClient());await signInWithCustomToken(auth,token);
  if(auth.currentUser?.uid!==WRITER_UID)throw Error('Wrong writer');
  const cases=createPerCaseStore(sdk,app,auth,globalThis.OutboundModel.parse,{space:'real',writerUid:WRITER_UID});db=sdk.getFirestore(app);
  const operations=createOperationsStore(sdk,db,auth,{space:'real'});return await runBatch(input,{cases,operations});
 }finally{await signOut(auth).catch(()=>{});if(db)await sdk.terminate(db).catch(()=>{});await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  // CI dependencies must explicitly include google-auth-library; no automatic
  // install, ADC login or fallback credential search/provisioning here.
  assertApprovedJob(process.env);
  if(!process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('WIF config required');
  const credentials=JSON.parse(await fs.readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
  if(credentials.type!=='external_account'||credentials.credential_source?.file)throw Error('Only approved runner WIF URL configuration is supported');
  const inputBytes=await fs.readFile(process.argv[2],'utf8');if(Buffer.byteLength(inputBytes)>1000000)throw Error('Batch too large');
  const config=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
  const {GoogleAuth}=await import('google-auth-library');
  console.log(JSON.stringify(await runApprovedJob({config,input:JSON.parse(inputBytes),getClient:()=>new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient()})));
 }catch{console.error(JSON.stringify({state:'failed',code:'job-not-verified-check-private-source-and-auth'}));process.exitCode=1;}
}
