# 日本地図の出典

- データ：Natural Earth, Admin 0 Countries, 1:50m
- 取得元：https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
- 利用条件：Public domain。商用利用・改変・再配布可能。
- 条件の説明：https://github.com/nvkelso/natural-earth-vector/blob/master/README.md
- Terms of Use：https://www.naturalearthdata.com/about/terms-of-use/
- 取得日：2026年10月9日
- 加工：JapanのFeatureのみ抽出。投影と沖縄・南西諸島・小笠原の別枠表示はブラウザ内で実行。

`japan.geojson` は地理座標の原データ、`japan-data.js` は同じFeatureをオフラインでも読み込めるJavaScript形式にしたものです。海岸線は1:50mの一般化データで、測量や国境判断には使用しません。都道府県境界は含みません。

地域名だけを持つ案件には `geography.js` に定義した都道府県庁所在地の概略座標を代表位置として使います。事業者の正確な住所ではありません。明示された緯度・経度は記録座標として区別します。未知の地域は外部ジオコーディングせず、所在地未設定の一覧に表示します。

3D表示にはThree.js 0.170.0を同梱しています（MIT、`THREE-LICENSE.txt`）。配信後にCDNへ接続しません。
