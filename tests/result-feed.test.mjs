import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createResultFeed} from '../firebase/result-feed.mjs';
import {freshnessText} from '../firebase/freshness.mjs';
const value={schemaVersion:1,eventId:'synthetic-1',caseId:'roy-web-0001',progress:'Checked',nextAction:'Next',completedAt:null,receivedAt:'2026-10-15T00:00:00Z',evidence:['Synthetic test']};
const envelope=items=>JSON.stringify({schemaVersion:1,space:'synthetic',items});
test('feed consumes general results, skips already verified bytes, then sees later changes',async()=>{
 let text=envelope([{kind:'work-result',value}]);const saved=[],states=[];
 const feed=createResultFeed({space:'synthetic',read:async()=>text,canWrite:()=>true,intervalMs:1000,store:{saveWorkResult:async e=>saved.push(e)},onStatus:s=>{states.push(s);if(saved.length===1)text=envelope([{kind:'work-result',value},{kind:'work-result',value:{...value,eventId:'synthetic-2'}}]);if(saved.length===2)feed.stop();}});
 await feed.start();await new Promise(r=>setTimeout(r,1100));assert.equal(saved.length,2);assert.equal(states.filter(s=>s.state==='watching').length,2);feed.stop();
});
test('invalid later item prevents all writes; failure is sanitized and terminal',async()=>{
 for(const text of [envelope([{kind:'work-result',value},{kind:'wrong',value}]),JSON.stringify({schemaVersion:1,space:'real',items:[]})]){
  let reads=0;const states=[];const feed=createResultFeed({space:'synthetic',read:async()=>{reads++;return text;},canWrite:()=>true,store:{saveWorkResult:assert.fail},onStatus:s=>states.push(s)});
  await feed.start();await feed.start();assert.equal(reads,1);assert.equal(states.at(-1).state,'failed');assert.equal(states.at(-1).code,'local-error');
 }
});
test('stop during asynchronous file read or revoked session prevents all writes',async()=>{
 let release;const states=[];const feed=createResultFeed({space:'synthetic',read:()=>new Promise(r=>release=r),canWrite:()=>true,store:{saveWorkResult:assert.fail},onStatus:s=>states.push(s)});
 const started=feed.start();feed.stop();release(envelope([{kind:'work-result',value}]));await started;assert.deepEqual(states.map(s=>s.state),['stopped']);
 const blocked=createResultFeed({space:'synthetic',read:assert.fail,canWrite:()=>false,store:{saveWorkResult:assert.fail},onStatus:s=>states.push(s)});await blocked.start();assert.equal(states.at(-1).code,'unauthenticated');
});
test('readback failure is never acknowledged; original SDK message stays private',async()=>{
 const states=[];const feed=createResultFeed({space:'synthetic',read:async()=>envelope([{kind:'work-result',value}]),canWrite:()=>true,store:{saveWorkResult:async()=>{throw Object.assign(Error('private@example.invalid'),{code:'permission-denied'});}},onStatus:s=>states.push(s)});
 await feed.start();assert.deepEqual(states.map(s=>s.state),['saving','failed']);assert.ok(!JSON.stringify(states).includes('@'));
});
test('freshness expires with time, and unobserved data is distinct from an empty registry',()=>{
 const info={caseCount:1,checkedCount:1,checked:{oldest:'2026-10-15T00:00:00Z',latest:'2026-10-15T00:00:00Z'}};
 assert.match(freshnessText(info,null,Date.parse('2026-10-15T01:00:00Z')),/24時間以内/);
 assert.match(freshnessText(info,null,Date.parse('2026-10-17T00:00:00Z')),/古い業務記録/);
 assert.match(freshnessText(null,null),/対象：未取得/);assert.match(freshnessText({caseCount:0},null),/対象：0案件/);
});

test('producer atomically queues private results, refuses repositories/symlinks and deduplicates',async()=>{
 const fs=await import('node:fs/promises'),path=await import('node:path');const {publishResult}=await import('../scripts/publish-result-feed.mjs');
 const dir=await fs.mkdtemp('/tmp/roy-private-feed-');
 try{
  const inputPath=path.join(dir,'input.json'),feedPath=path.join(dir,'feed.json');await fs.writeFile(inputPath,JSON.stringify(value));
  const args={inputPath,feedPath,kind:'work-result',space:'synthetic'};
  assert.equal((await publishResult(args)).dbVerified,false);assert.equal((await publishResult(args)).state,'already-queued');assert.equal((await fs.stat(feedPath)).mode&0o777,0o600);
  const linked=path.join(dir,'linked.json');await fs.symlink(feedPath,linked);await assert.rejects(publishResult({...args,feedPath:linked}));
  await fs.mkdir(path.join(dir,'.git'));await assert.rejects(publishResult(args));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
