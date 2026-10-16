import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loginFailureText} from '../firebase/auth-guidance.mjs';
test('popup and network failures do not incorrectly instruct permission changes',()=>{
 assert.match(loginFailureText({code:'auth/popup-blocked'}),/ポップアップ/);
 assert.match(loginFailureText({code:'auth/network-request-failed'}),/通信/);
 assert.doesNotMatch(loginFailureText({code:'auth/popup-blocked'}),/許可されていません/);
 assert.match(loginFailureText({code:'auth/unauthorized-domain'}),/ドメイン/);
});
test('unknown SDK errors never reveal their message, code or private details',()=>{
 for(const error of [{code:'private-secret',message:'private-token'},{code:'__proto__',message:'private-token'},{code:'toString'},null]){
  const output=loginFailureText(error);assert.equal(typeof output,'string');assert.match(output,/原因は未確認/);assert.doesNotMatch(output,/private-secret|private-token|__proto__|toString/);
 }
});
