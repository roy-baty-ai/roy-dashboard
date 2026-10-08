#!/usr/bin/env python3
"""Bundle the existing dashboard with an explicitly supplied private snapshot.
Never write input or output under the public repository.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re

repo = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True, type=Path)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
for path in [args.input, args.output]:
    if path.resolve().is_relative_to(repo):
        parser.error('Private input and output must both be outside the public repository.')
data = json.loads(args.input.read_text())
assert data['schema_version'] == 1 and isinstance(data['cases'], list)
src = data['summary']
summary = dict(version=1, candidateCount=len(data['cases']), readyCount=src['ready_for_human_go'], preparingCount=src['unsent_cases_in_this_view']-src['ready_for_human_go'], sentCount=src['sent_cases_in_this_view'], targetCount=10, confirmedRevenueUsd=src['operating_revenue_usd_last_recorded'], verifiedAt=None, note='同梱資料の確認済み記録。今回の集約で営業サイト・メールの再確認はしていません。公開見本URLは3件（送信済み1件を含む）、ローカルのみ5件。READYは0件です。このWeb制作8案件の表示で、全事業の送信総数とは別です。個別の最終確認日時は各案件を参照してください。')
assert summary['candidateCount'] == src['case_count'] == summary['readyCount']+summary['preparingCount']+summary['sentCount']
status = dict(version=1, updatedAt=data['assembled_at_utc'], revenue=dict(earned=src['operating_revenue_usd_last_recorded'], target=100, currency='USD'), needsHuman=['未送信案件の送信GOは未取得。今回の画面確認は送信承認になりません。'], now=[f"営業案件{len(data['cases'])}件。READY {src['ready_for_human_go']}件、未送信{src['unsent_cases_in_this_view']}件、初回送信済み{src['sent_cases_in_this_view']}件。", '目標：見本付きの強い10件。案件数・提案価格は受注や売上ではありません。', data['evidence_note']], waiting=[dict(route='初回送信済みの案件', question='Gmailの最終確認以降、返信の現在状態は不明。無返信追送・再送なし。')], candidates=[], blockers=[dict(function='公開・QA・画像・Gmail・送信直前照合', detail='残る確認は案件ごとの記録を参照。未送信案件の送信GOは未取得です。')], recent=[dict(at=data['assembled_at_utc'], event='既存資料を私有ダッシュボードへ集約。サイト・Gmail再確認、営業送信、公開は行っていません。')], freshness='集約日時と業務の最終確認日時は別です。表示内容は同梱資料の記録で、自動更新されません。')
# Keep the existing dashboard code; only its data source changes for offline use.
payload = json.dumps(dict(data=data, summary=summary, status=status), ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
bootstrap = 'window.RoyPrivateSnapshot = '+payload+';'
app = (repo/'app.js').read_text().replace("fetch('status.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error('Status unavailable'); return response.json(); })", 'Promise.resolve(window.RoyPrivateSnapshot.status)')
scripts = [bootstrap, app, (repo/'outbound-model.js').read_text(), (repo/'outbound.js').read_text()]
css = (repo/'style.css').read_text()
hash_text = lambda value: "'sha256-"+base64.b64encode(hashlib.sha256(value.encode()).digest()).decode()+"'"
csp = "default-src 'none'; script-src "+' '.join(map(hash_text,scripts))+"; style-src "+hash_text(css)+"; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'"
html = (repo/'index.html').read_text()
html = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '<meta http-equiv="Content-Security-Policy" content="'+csp+'">', html)
html = re.sub(r'<script src="[^"]+" defer></script>', '', html)
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>'+css+'</style>')
html = html.replace('<title>ROY — 営業案件と活動状況</title>', '<title>ROY — 私有営業ダッシュボード</title>')
html = html.replace('正本の business/outbound.json を選ぶと、この端末の画面内だけに詳細を表示します。ファイルの送信・保存は行いません。公開画面に内部データは含まれません。', 'このHTMLには私有案件データを同梱しています。ブラウザで開くだけで閲覧でき、外部通信・保存は行いません。外部URLは参照用テキストです。このファイルを公開サイトや公開リポジトリへ置かないでください。')
html = html.replace('PUBLIC STATUS · PRIVATE DATA EXCLUDED', 'PRIVATE SNAPSHOT · DO NOT PUBLISH')
html = html.replace('<body>', '<body>')
html = html.replace('</body>', ''.join('<script>'+s+'</script>' for s in scripts)+'</body>')
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(html)
args.output.chmod(0o600)
print(f'Private HTML created: {args.output.stat().st_size} bytes; {len(data["cases"])} cases; no external assets')
