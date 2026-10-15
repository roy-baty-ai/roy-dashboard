import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateOperation} from '../firebase/operations.mjs';
import {mintWriterToken,assertApprovedJob,SIGNER} from '../scripts/writer-auth.mjs';
import {runBatch} from '../scripts/run-results-job.mjs';
export const sample=()=>({schemaVersion:1,businessId:'note',expectedRevision:0,sourceCommit:'a'.repeat(40),state:'active',progress:'Synthetic progress',nextAction:'Synthetic next',observedAt:'2026-10-15T00:00:00Z',evidence:'Synthetic source reference',metrics:{published_items:{value:0,observedAt:'2026-10-15T00:00:00Z',evidence:'Synthetic observed zero'},scheduled_items:{value:null,observedAt:null,evidence:''}}});
test('business metrics distinguish observed zero, unknown and scheduled from published',()=>{
 const p=validateOperation(sample());assert.equal(p.metrics.published_items.value,0);assert.equal(p.metrics.scheduled_items.value,null);
 for(const change of [p=>p.businessId='roy-web-0001',p=>p.metrics.published_items.observedAt=null,p=>p.metrics.published_items.value=-1,p=>p.metrics.published_items.value=.5,p=>p.metrics.company_count={value:10},p=>p.metrics.scheduled_items.observedAt='2026-10-15T00:00:00Z',p=>p.observedAt=null,p=>p.observedAt='2026-02-30T00:00:00Z']){const p=sample();change(p);assert.throws(()=>validateOperation(p));}
});
test('token signer is fixed, short lived and requests only signBlob',async()=>{
 let req;const token=await mintWriterToken({request:async r=>{req=r;return {data:{signedBlob:Buffer.from('synthetic-signature').toString('base64')}};}},{now:100});
 const [header,body]=token.split('.').map(v=>Buffer.from(v,'base64url').toString());const p=JSON.parse(body);assert.equal(p.uid,'roy-results-writer-v1');assert.equal(p.exp-p.iat,3600);assert.equal(p.iss,SIGNER);assert.deepEqual(p.claims,{roy_writer:true,writer_scope:'results-v1'});assert.ok(req.url.endsWith(':signBlob'));assert.equal(JSON.parse(header).alg,'RS256');
 assert.throws(()=>assertApprovedJob({}));assert.throws(()=>assertApprovedJob({GITHUB_REPOSITORY_ID:'1400072927',GITHUB_REPOSITORY_OWNER_ID:'336551905',GITHUB_REF:'refs/pull/1/merge'}));
});
test('batch validates all input before writing and reports failed sync on write/readback error',async()=>{
 const writes=[],operations={saveOperation:async()=>writes.push('row'),saveSync:async s=>writes.push(s)};
 await assert.rejects(runBatch({schemaVersion:1,space:'real',items:[{kind:'business',value:sample()},{kind:'unexpected',value:{}}]},{operations,cases:{}}));assert.deepEqual(writes,['failed']);writes.length=0;
 operations.saveOperation=async()=>{throw Object.assign(Error('private content'),{code:'aborted'});};await assert.rejects(runBatch({schemaVersion:1,space:'real',items:[{kind:'business',value:sample()}]},{operations,cases:{}}),{code:'conflict'});assert.deepEqual(writes,['failed']);
});
