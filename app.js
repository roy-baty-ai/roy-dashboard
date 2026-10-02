'use strict';
const jst = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function text(tag, value) { const el = document.createElement(tag); el.textContent = value; return el; }
function list(id, entries, render) { const target = document.getElementById(id); for (const entry of entries) { const li = document.createElement('li'); render(li, entry); target.append(li); } }
fetch('status.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Status unavailable'); return response.json(); }).then(data => {
  const day = Math.floor((Date.parse(data.updatedAt) + 9 * 3600000 - Date.parse('2026-10-01T00:00:00Z')) / 86400000) + 1;
  document.getElementById('day').textContent = `DAY ${day}`;
  document.getElementById('revenue').textContent = `$${data.revenue.earned} / $${data.revenue.target}`;
  document.getElementById('updated').textContent = `最終更新： ${jst.format(new Date(data.updatedAt))} JST`;
  list('needsHuman', data.needsHuman.length ? data.needsHuman : ['Nothing'], (li, x) => li.append(text('p', x)));
  list('now', data.now, (li, x) => li.append(text('p', x)));
  list('waiting', data.waiting, (li, x) => li.append(text('strong', x.route), text('p', x.question)));
  list('recent', data.recent, (li, x) => { const t = text('time', `${jst.format(new Date(x.at))} JST`); t.dateTime = x.at; li.append(t, text('p', x.event)); });
  list('candidates', data.candidates, (li, x) => li.append(text('strong', `${x.name} · ${x.state}`), text('p', `次の確認： ${x.nextUnknown}`)));
  list('blockers', data.blockers.length ? data.blockers : [{ function: 'Nothing', detail: '' }], (li, x) => li.append(text('strong', x.function), text('p', x.detail)));
  document.getElementById('freshness').textContent = data.freshness;
}).catch(() => {
  document.getElementById('updated').textContent = '状態を読み込めません。現在の状況は不明です。';
  document.getElementById('needsHuman').append(text('li', '不明：状態を読み込めません。'));
});
