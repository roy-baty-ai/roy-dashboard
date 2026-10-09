'use strict';
const jst = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const shortJst = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const get = id => document.getElementById(id);
function text(tag, value, className) { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; }
function list(id, entries, className, render) { const target = get(id); target.replaceChildren(); for (const entry of entries) { const row = text('div', '', className); render(row, entry); target.append(row); } }
fetch('status.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Status unavailable'); return response.json(); }).then(data => {
  if (window.RoyFirebaseConfig?.enabled && !window.RoyFirebaseConfig.authOnly && !window.RoyFirebaseConfig.testOnly && !window.RoyPrivateSnapshot) return;
  if (!Number.isFinite(Date.parse(data.updatedAt)) || !['needsHuman','now','waiting','recent','candidates','blockers'].every(key => Array.isArray(data[key])) || !Number.isFinite(data.revenue?.earned) || !(data.revenue.target > 0)) throw new Error('Invalid status');
  const day = Math.floor((Date.parse(data.updatedAt) + 9 * 3600000 - Date.parse('2026-10-01T00:00:00Z')) / 86400000) + 1;
  get('day').textContent = `DAY ${day}`;
  get('revenue').replaceChildren(document.createTextNode(`$${data.revenue.earned} `), text('span', `/ $${data.revenue.target}`));
  const percent = Math.max(0, Math.min(100, data.revenue.earned / data.revenue.target * 100));
  get('progress').value = percent;
  get('percent').textContent = `${Math.round(percent)}%`;
  get('remaining').textContent = `目標まで $${Math.max(0, data.revenue.target - data.revenue.earned)}`;
  get('updated').textContent = `記録更新：${jst.format(new Date(data.updatedAt))} JST`;
  get('summary').textContent = data.now[0] || '現在の作業情報はありません。';
  const needsHuman = data.needsHuman.length > 0;
  get('human').classList.toggle('attention', needsHuman);
  get('humanIcon').textContent = needsHuman ? '!' : '✓';
  get('humanBadge').textContent = needsHuman ? '対応が必要' : '対応不要 / Nothing';
  get('humanBadge').className = `badge ${needsHuman ? 'notice' : 'good'}`;
  list('needsHuman', needsHuman ? data.needsHuman : ['現在、操作・承認が必要な項目はありません。'], '', (row, x) => row.append(text('p', x)));
  get('nowCount').textContent = String(data.now.length).padStart(2, '0');
  get('waitingCount').textContent = String(data.waiting.length).padStart(2, '0');
  list('now', data.now, 'row', (row, x) => row.append(text('p', x)));
  list('waiting', data.waiting, 'wait', (row, x) => row.append(text('strong', x.route), text('span', x.question)));
  list('candidates', data.candidates, 'candidate', (row, x) => { const details = text('div', ''); details.append(text('strong', x.name), text('p', `次の確認：${x.nextUnknown}`)); row.append(details, text('span', x.state, `tag ${x.state.includes('回答待ち') ? 'amber' : 'purple'}`)); });
  get('blockerBadge').textContent = data.blockers.length ? `${data.blockers.length}件の障害` : '障害なし';
  get('blockerBadge').className = `badge ${data.blockers.length ? 'notice' : 'good'}`;
  list('blockers', data.blockers.length ? data.blockers : [{ function: '障害なし / Nothing', detail: '確認済みの障害はありません。' }], 'row', (row, x) => row.append(text('strong', x.function), text('p', x.detail)));
  list('recent', data.recent.slice(0, 10), 'event', (row, x) => { const time = text('time', shortJst.format(new Date(x.at))); time.dateTime = x.at; time.title = `${jst.format(new Date(x.at))} JST`; const details = text('div', ''); details.append(text('p', x.event)); row.append(time, details); });
  window.RoyDashboard?.status(data);
  get('freshness').textContent = `${data.freshness} DAY 1：2026年10月1日（日本時間）。`;
}).catch(() => {
  get('updated').textContent = '状態を読み込めません。現在の状況は不明です。';
  get('summary').textContent = '現在の状態は不明です。';
  get('humanBadge').textContent = '確認が必要';
  get('humanBadge').className = 'badge notice';
  get('humanIcon').textContent = '!';
  get('human').classList.add('attention');
  get('needsHuman').replaceChildren(text('p', '不明：状態を読み込めません。時間をおいて再読み込みしてください。'));
});
