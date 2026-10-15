// Run by the existing worker after a verified result. Private local files only.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateWorkResult} from '../firebase/work-results.mjs';
import {verifyIntake,digest} from '../firebase/intake.mjs';
const fail=()=>{throw Error('private-feed-input-or-path-invalid');};
async function privatePath(file){
 const parent=await fs.realpath(path.dirname(path.resolve(file)));
 for(let dir=parent;;dir=path.dirname(dir)){
  try{await fs.stat(path.join(dir,'.git'));fail();}catch(e){if(e.code!=='ENOENT')throw e;}
  if(dir===path.dirname(dir))break;
 }
 const resolved=path.join(parent,path.basename(file));
 try{if((await fs.lstat(resolved)).isSymbolicLink())fail();}catch(e){if(e.code!=='ENOENT')throw e;}
 return resolved;
}
export async function publishResult({inputPath,feedPath,kind,space}){
 if(!['real','synthetic'].includes(space)||!['work-result','intake'].includes(kind))fail();
 inputPath=await privatePath(inputPath);feedPath=await privatePath(feedPath);if(inputPath===feedPath)fail();
 const input=await fs.readFile(inputPath,'utf8');if(Buffer.byteLength(input)>1000000)fail();
 const value=kind==='work-result'?validateWorkResult(JSON.parse(input)):await verifyIntake(JSON.parse(input),{space});
 let feed={schemaVersion:1,space,items:[]};
 // Exclusive lock prevents two worker results from overwriting each other.
 const lock=await fs.open(feedPath+'.lock','wx',0o600);let temporary;
 try{
  try{feed=JSON.parse(await fs.readFile(feedPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(feed.schemaVersion!==1||feed.space!==space||!Array.isArray(feed.items)||feed.items.length>100||Object.keys(feed).some(k=>!['schemaVersion','space','items'].includes(k)))fail();
  const item={kind,value},hash=await digest(item);
  if((await Promise.all(feed.items.map(digest))).includes(hash))return {state:'already-queued'};
  if(feed.items.length===100)throw Error('feed-full-verify-and-rotate');
  feed.items.push(item);const content=JSON.stringify(feed)+'\n';if(Buffer.byteLength(content)>1000000)fail();
  temporary=feedPath+'.'+process.pid+'.tmp';await fs.writeFile(temporary,content,{mode:0o600,flag:'wx'});await fs.rename(temporary,feedPath);temporary=null;
  return {state:'queued',items:feed.items.length,dbVerified:false};
 }finally{if(temporary)await fs.unlink(temporary).catch(()=>{});await lock.close();await fs.unlink(feedPath+'.lock');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [inputPath,feedPath,kind,space]=process.argv.slice(2);
 try{console.log(JSON.stringify(await publishResult({inputPath,feedPath,kind,space})));}
 catch{console.error(JSON.stringify({state:'not-queued',code:'check-private-input-path-lock-or-capacity'}));process.exitCode=1;}
}
