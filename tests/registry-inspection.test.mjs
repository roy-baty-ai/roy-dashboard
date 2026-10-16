import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registryObservation} from '../firebase/registry-inspection.mjs';
test('registry observation uses actual revisions/source metadata and excludes private payload content',()=>{
 const record={revision:7,source:{version:3,commit:'a'.repeat(40),path:'business/outbound.json',key:'synthetic-only'},payload:{id:'synthetic-case',email:{body:'must not be exposed'},confirmed_revenue_usd:123,internal_note:'must not be exposed'}};
 const result=registryObservation([record],'2026-10-16T00:00:00Z');
 assert.deepEqual(result,{receivedAt:'2026-10-16T00:00:00Z',cases:[{caseId:'synthetic-case',revision:7,sourceVersion:3,sourceCommit:'a'.repeat(40),sourcePath:'business/outbound.json',sourceKey:'synthetic-only'}]});
 assert.ok(!JSON.stringify(result).includes('must not be exposed'));
});
test('missing source provenance stays unknown rather than guessed from record revision',()=>{
 const result=registryObservation([{revision:12,payload:{id:'synthetic-case'}}]);
 assert.equal(result.cases[0].sourceVersion,null);assert.equal(result.cases[0].sourceCommit,null);
 assert.deepEqual(registryObservation([]).cases,[]);
});
