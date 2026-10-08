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
  assert.equal(summary.confirmedRevenueUsd, 0); assert.equal(summary.readyCount, 0); assert.equal(summary.candidateCount, summary.preparingCount + summary.sentCount);
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
