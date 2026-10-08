'use strict';
(function (root) {
  const str = value => typeof value === 'string' ? value : '';
  const validDate = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  function safeUrl(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
  }
  function parse(data) {
    if (data?.schema_version === 1 && Array.isArray(data.cases)) return parseSnapshot(data);
    // Deliberately explicit: unknown canonical schemas must be mapped after review.
    const rows = Array.isArray(data) ? data : data?.cases;
    if (!Array.isArray(rows) || rows.length > 500) throw new Error('配列、または cases 配列を持つJSONが必要です。正本の形式を確認してください。');
    return rows.map((row, index) => {
      if (!row || typeof row !== 'object' || !str(row.businessName).trim()) throw new Error(`${index + 1}件目の businessName がありません。正本の項目対応を確認してください。`);
      const checks = Array.isArray(row.remainingChecks) && row.remainingChecks.every(x => typeof x === 'string') ? row.remainingChecks.filter(x => x.trim()) : null;
      const gates = row.readiness || {};
      const remaining = checks ? [...checks] : ['残る確認が未記録'];
      for (const [key, label] of [['published', '公開見本の確認'], ['qa', 'PC・スマホQA'], ['gmail', 'Gmail・宛先の確認']]) if (gates[key] !== true) remaining.push(`${label}：未完了または未確認`);
      const verifiedAt = validDate(row.lastVerifiedAt) ? row.lastVerifiedAt : null;
      if (!verifiedAt) remaining.push('最終確認日時が未記録');
      const previewUrl = safeUrl(row.previewUrl);
      if (!previewUrl) remaining.push('公開見本URLが未登録または無効');
      const sent = row.status === 'SENT';
      const state = sent ? 'sent' : row.status === 'READY_FOR_HUMAN_GO' && remaining.length === 0 ? 'ready' : 'preparing';
      if (!sent && row.status !== 'READY_FOR_HUMAN_GO') remaining.push('READY_FOR_HUMAN_GO の確認待ち');
      return { businessName: row.businessName, category: str(row.category), value: str(row.proposalValue), preparation: str(row.preparation), sourceStatus: str(row.status), state, previewUrl, imageUrl: safeUrl(row.salesImageUrl), body: str(row.salesBody), recipient: str(row.recipient), remaining, verifiedAt };
    });
  }
  function parseSnapshot(data) {
    if (data.cases.length > 500) throw new Error('案件数が上限を超えています。');
    const gateText = gate => typeof gate?.label === 'string' ? gate.label + (str(gate.evidence) ? `（${gate.evidence}）` : '') : '確認項目の形式が不明';
    return data.cases.map((row, index) => {
      if (!row || !str(row.business_name).trim()) throw new Error(`${index + 1}件目の business_name がありません。`);
      const originalMissing = Array.isArray(row.missing_gates) ? row.missing_gates : [{ label: '残る確認が未記録' }];
      const resolved=originalMissing.filter(g=>g.code!=='initial_send_go' && row.gate_checks?.[g.code]===true);
      const missing=originalMissing.filter(g=>!resolved.includes(g));
      const confirmed = Array.isArray(row.confirmed_gates) ? [...row.confirmed_gates,...resolved].map(gateText) : [];
      const remaining = missing.map(gateText);
      const previewUrl = safeUrl(row.preview_url);
      const verifiedAt = validDate(row.last_checked_at) ? row.last_checked_at : null;
      const sent = row.sent === true && row.status === 'SENT_WAITING';
      const ready = row.sent === false && row.status === 'READY_FOR_HUMAN_GO' && row.readiness === 'READY_FOR_HUMAN_GO' && previewUrl && verifiedAt && missing.every(g => g.code === 'initial_send_go');
      if (row.sent === true && !sent) remaining.push('送信状態の整合性を確認してください');
      if (!previewUrl && !missing.some(g => g.code === 'public_preview')) remaining.push('公開見本URLが未登録または無効');
      if (!verifiedAt) remaining.push('最終確認日時が未記録');
      const roleLabels = { sent: '送信済み', priority: '準備優先', reserve: '適格予備', additional_prepared: '追加準備' };
      const role = str(row.queue?.role);
      return {
        businessName: row.business_name, category: str(row.classification), categoryCode: str(row.classification_code), region: str(row.region), value: str(row.value_hypothesis),
        preparation: confirmed.join('\n') || '確認済みの準備記録なし', sourceStatus: str(row.status), state: sent ? 'sent' : ready ? 'ready' : 'preparing', previewUrl,
        previewNote: row.preview_status === 'MISSING' ? '未設定・未公開' : '既存URL。今回の集約での再確認なし', imageUrl: null,
        imageRef: str(row.sales_image?.library_file_id), imageName: str(row.sales_image?.filename), imageApproval: str(row.sales_image?.approval),
        body: str(row.email?.body), subject: str(row.email?.subject), emailState: str(row.email?.state), recipient: str(row.contact?.email),
        sentAt: validDate(row.email?.sent_at) ? row.email.sent_at : null, sentMessageUrl: safeUrl(row.email?.sent_message_url),
        remaining, verifiedAt, checkedNote: str(row.last_checked_note), nextAction: str(row.next_action), riskNotes: Array.isArray(row.risk_notes) ? row.risk_notes.filter(x => typeof x === 'string') : [],
        role, roleLabel: (roleLabels[role] || '区分未記録') + (role === 'priority' && Number.isInteger(row.queue?.priority) ? ` ${row.queue.priority}` : ''),
        offer: Number.isFinite(row.offer?.amount) ? `${row.offer.amount.toLocaleString('ja-JP')} ${str(row.offer.currency)}${row.offer.tax === 'exclusive' ? '（税別）' : ''}・提案価格、売上ではありません` : '',
        offerScope: str(row.offer?.scope), canonicalNote: row.canonical?.included_at_commit === false ? 'この案件は参照commitの正本に未収録（補足資料）' : '参照commitの正本に収録',
        replyNote: sent ? '返信の現在状態はGmail最終確認以降不明。無返信を断定せず、追送・再送なし。' : '未送信。初回送信GOは別途必要です。'
      };
    });
  }
  const api = { parse, safeUrl, validDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OutboundModel = api;
})(globalThis);
