// Compile a review-only Rules candidate; never deploy or change permissions.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function operationsRules(){
 let base=await readFile(new URL('../firebase/firestore-finalized.rules',import.meta.url),'utf8');
 let fragment=await readFile(new URL('../firebase/operations-policy.rules',import.meta.url),'utf8');
 const guard='spaceOK(space) && admin()';
 if(!base.includes(guard))throw Error('Base policy changed');
 // Only per-case paths use this guard. Legacy privatePipeline and owner admin
 // access remain unchanged. Every existing shape/history/control check remains.
 const actor="(request.auth != null && (request.auth.uid == 'roy-results-writer-v1' ? writer(space) : admin()))";
 base=base.replaceAll(guard,'spaceOK(space) && '+actor);
 fragment=fragment.replaceAll('(admin() || writer(space))',actor);
 const manual="b.changeKind == 'manual' ? manual(a,b) : sourceUpdate(space,caseId,a,b)";
 if(!base.includes(manual))throw Error('Manual guard changed');
 base=base.replace(manual,"b.changeKind == 'manual' ? ((request.auth.uid == 'roy-results-writer-v1' ? b.payload.diff(a.payload).affectedKeys().hasOnly(['next_action','internal_note','last_checked_at']) : true) && manual(a,b)) : sourceUpdate(space,caseId,a,b)");
 // Explicit conditional stages keep rejected batches under Rules' expression budget.
 base=base.replace('d.revision == 1 && d.source.version == 1 && sourceShape(space,caseId,d)\n     && record(d,caseId) && evidence(space,caseId,d) && historyMatches(space,caseId,d)',
  '(d.revision == 1 && d.source.version == 1 && sourceShape(space,caseId,d)) ? (record(d,caseId) ? (evidence(space,caseId,d) ? historyMatches(space,caseId,d) : false) : false) : false');
 const end='  match /{document=**} { allow read, write: if false; }';
 if(!base.includes(end))throw Error('Deny-all missing');return base.replace(end,()=>fragment+'\n'+end);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2])throw Error('Output path required');await writeFile(process.argv[2],await operationsRules(),{flag:'wx'});}
