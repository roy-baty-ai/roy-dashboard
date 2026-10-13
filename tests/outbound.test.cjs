const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, safeUrl } = require('../outbound-model.js');
const ready = { businessName: '検証用事業者', status: 'READY_FOR_HUMAN_GO', remainingChecks: [], readiness: { published: true, qa: true, gmail: true }, previewUrl: 'https://example.com/sample', lastVerifiedAt: '2026-10-08T09:00:00+09:00' };
test('READY requires explicit state and all verified gates', () => {
  assert.equal(parse([ready])[0].state, 'ready');
  for (const field of ['published', 'qa', 'gmail']) assert.equal(parse([{ ...ready, readiness: { ...ready.readiness, [field]: false } }])[0].state, 'preparing');
  for (const override of [{ lastVerifiedAt: null }, { previewUrl: 'javascript:alert(1)' }, { remainingChecks: ['QA待ち'] }, { remainingChecks: undefined }, { remainingChecks: [false] }, { status: 'unknown' }]) assert.equal(parse([{ ...ready, ...override }])[0].state, 'preparing');
});
test('sent is separate from ready and missing facts remain visible', () => {
  const c = parse([{ businessName: '検証用', status: 'SENT' }])[0];
  assert.equal(c.state, 'sent'); assert.equal(c.verifiedAt, null); assert.ok(c.remaining.length >= 5);
});
test('unknown canonical schemas fail visibly without guessing', () => {
  assert.throws(() => parse({ leads: [ready] })); assert.throws(() => parse([{}])); assert.throws(() => parse([null])); assert.deepEqual(parse({ cases: [] }), []);
});
test('external links reject unsafe schemes and credentials', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,a', 'file:///secret', '/internal', 'https://user:password@example.com']) assert.equal(safeUrl(url), null);
  assert.equal(safeUrl('https://example.com'), 'https://example.com/');
});
test('public summary is aggregate-only and counts are consistent', () => {
  const summary = require('../outbound-summary.json');
  assert.deepEqual(Object.keys(summary).sort(), ['version','candidateCount','readyCount','preparingCount','sentCount','targetCount','confirmedRevenueUsd','verifiedAt','note'].sort());
  assert.equal(summary.confirmedRevenueUsd, 0); assert.equal(summary.readyCount, 1); assert.equal(summary.candidateCount, summary.readyCount + summary.preparingCount + summary.sentCount);
});
test('snapshot schema preserves gates, image references, supplemental origin and sent history', () => {
  const snapshot = { schema_version: 1, cases: [
    { business_name: '検証A', classification: 'Owned Presence', status: 'SENT_WAITING', sent: true, readiness: 'SENT_NOT_IN_READY_QUEUE', preview_url: 'https://example.com', sales_image: { library_file_id: 'libfile_test', filename: 'test.png' }, missing_gates: [], confirmed_gates: [{ label: '送信済み記録' }], email: { body: '履歴本文', subject: '件名' }, last_checked_at: '2026-10-07T13:00:00+09:00', canonical: { included_at_commit: true } },
    { business_name: '検証B', status: 'NOT_READY', sent: false, missing_gates: [{ code: 'public_preview', label: 'Preview未公開' }, { code: 'gmail_current_history', label: 'Gmail未確認' }], confirmed_gates: [], preview_url: null, sales_image: null, canonical: { included_at_commit: false } }
  ] };
  const [sent, prep] = parse(snapshot);
  assert.equal(sent.state, 'sent'); assert.equal(sent.imageUrl, null); assert.equal(sent.imageRef, 'libfile_test'); assert.equal(sent.body, '履歴本文');
  assert.equal(prep.state, 'preparing'); assert.equal(prep.previewUrl, null); assert.ok(prep.remaining.includes('Gmail未確認')); assert.match(prep.canonicalNote, /未収録/);
});
test('sales evidence separates interested, declined, contracted and paid without inferring revenue',()=>{
 const base={business_name:'架空検証',sent:true,status:'SENT_WAITING',email:{},missing_gates:[],confirmed_gates:[],confirmed_revenue_usd:0};
 const one=patch=>parse({schema_version:1,cases:[{...base,...patch}]})[0];
 for(const stage of ['interested','declined','contracted']){const c=one({sales:{stage,evidence:'架空の確認証拠'}});assert.equal(c.salesStage,stage);assert.equal(c.state,'sent');assert.equal(c.confirmedRevenueUsd,0);}
 assert.equal(one({sales:{stage:'paid',evidence:'架空の確認証拠'}}).salesStage,'sent');
 assert.equal(one({sales:{stage:'paid',evidence:'架空の確認証拠'},confirmed_revenue_usd:100}).salesStage,'paid');
 assert.equal(one({sales:{stage:'contracted'}}).salesStage,'sent');
 assert.equal(one({confirmed_revenue_usd:undefined,offer:{amount:99999}}).confirmedRevenueUsd,null);
 assert.equal(one({sent:false,status:'NOT_READY',sales:{stage:'hold',evidence:'適合確認待ち'}}).salesStage,'hold');
 assert.equal(one({sent:false,status:'NOT_READY',sales:{stage:'paid',evidence:'矛盾した証拠'},confirmed_revenue_usd:10}).salesStage,'candidate');
 const {matches}=require('../outbound-model.js');assert.equal(matches(one({sales:{stage:'interested',evidence:'確認'}}),'sales:interested'),true);assert.equal(matches(one({sales:{stage:'interested',evidence:'確認'}}),'sent'),true);
});

test('missing or unrecognized stage is unknown, not a confirmed candidate',()=>{
 for(const status of [undefined,'MISSING_SOURCE'])assert.equal(parse([{businessName:'架空',status}])[0].salesStage,'unknown');
 assert.equal(parse([{businessName:'架空',status:'NOT_READY'}])[0].salesStage,'candidate');
});


test('minute-precision sent evidence retains source precision without weakening READY dates',()=>{
 const base={business_name:'架空の送信記録',sent:true,status:'SENT_WAITING',confirmed_gates:[],missing_gates:[]};
 const parsed=email=>parse({schema_version:1,cases:[{...base,email}]} )[0];
 const raw='2026-10-13T15:22+09:00',c=parsed({sent_at:raw,sent_at_precision:'minute'});
 assert.equal(c.sentAt,raw);assert.equal(c.sentAtPrecision,'minute');
 assert.equal(require('../outbound-model.js').validDate(raw),false);
 for(const bad of ['2026-02-30T15:22+09:00','2026-10-13T25:22+09:00','2026-10-13T15:22-00:00'])assert.equal(parsed({sent_at:bad,sent_at_precision:'minute'}).sentAt,null);
 assert.equal(parsed({sent_at:raw}).sentAt,null);
 assert.equal(parsed({sent_at:'2026-10-13T15:22:19+09:00'}).sentAtPrecision,'second');
});


test('rejected sales evidence cannot masquerade as a reply or payment record',()=>{
 const one=sales=>parse({schema_version:1,cases:[{business_name:'架空',sent:true,status:'SENT_WAITING',sales,confirmed_revenue_usd:0}]})[0];
 for(const stage of ['paid','hold','unrecognized']){
  const c=one({stage,evidence:'REJECTED_FACT',checked_at:'2026-10-13T00:00:00Z'});
  assert.equal(c.salesStage,'sent');assert.equal(c.salesEvidence,'');assert.equal(c.salesCheckedAt,null);
  assert.equal(c.hasFollowupEvidence,false);assert.doesNotMatch(c.replyNote,/REJECTED_FACT/);
 }
 assert.equal(one({stage:'sent',evidence:'送信の証跡のみ'}).hasFollowupEvidence,false);
 assert.equal(one({stage:'interested',evidence:'関心返信の証跡'}).hasFollowupEvidence,true);
});
