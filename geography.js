'use strict';
(function(root) {
  // Representative prefectural capital positions, rounded to 0.01 degree.
  // These are regional markers, never inferred business street addresses.
  const entries = [
    ['北海道','Hokkaido',141.35,43.06],['青森県','Aomori',140.74,40.82],['岩手県','Iwate',141.15,39.70],['宮城県','Miyagi',140.87,38.27],['秋田県','Akita',140.10,39.72],['山形県','Yamagata',140.34,38.24],['福島県','Fukushima',140.47,37.75],
    ['茨城県','Ibaraki',140.47,36.37],['栃木県','Tochigi',139.88,36.57],['群馬県','Gunma',139.06,36.39],['埼玉県','Saitama',139.65,35.86],['千葉県','Chiba',140.12,35.61],['東京都','Tokyo',139.69,35.69],['神奈川県','Kanagawa',139.64,35.45],
    ['新潟県','Niigata',139.02,37.90],['富山県','Toyama',137.21,36.70],['石川県','Ishikawa',136.66,36.56],['福井県','Fukui',136.22,36.06],['山梨県','Yamanashi',138.57,35.66],['長野県','Nagano',138.18,36.65],['岐阜県','Gifu',136.72,35.39],['静岡県','Shizuoka',138.38,34.98],['愛知県','Aichi',136.91,35.18],
    ['三重県','Mie',136.51,34.73],['滋賀県','Shiga',135.87,35.00],['京都府','Kyoto',135.76,35.02],['大阪府','Osaka',135.52,34.69],['兵庫県','Hyogo',135.18,34.69],['奈良県','Nara',135.83,34.69],['和歌山県','Wakayama',135.17,34.23],
    ['鳥取県','Tottori',134.24,35.50],['島根県','Shimane',133.05,35.47],['岡山県','Okayama',133.93,34.66],['広島県','Hiroshima',132.46,34.40],['山口県','Yamaguchi',131.47,34.19],['徳島県','Tokushima',134.56,34.07],['香川県','Kagawa',134.04,34.34],['愛媛県','Ehime',132.77,33.84],['高知県','Kochi',133.53,33.56],
    ['福岡県','Fukuoka',130.40,33.59],['佐賀県','Saga',130.30,33.25],['長崎県','Nagasaki',129.87,32.74],['熊本県','Kumamoto',130.74,32.79],['大分県','Oita',131.61,33.24],['宮崎県','Miyazaki',131.42,31.91],['鹿児島県','Kagoshima',130.56,31.60],['沖縄県','Okinawa',127.68,26.21]
  ];
  function locate(c) {
    const p=c.location;
    if (p && Number.isFinite(p.longitude) && Number.isFinite(p.latitude) && p.longitude >= 122 && p.longitude <= 149 && p.latitude >= 24 && p.latitude <= 46) {
      return {longitude:p.longitude,latitude:p.latitude,label:c.region||'記録座標',basis:'記録座標'};
    }
    if(p)return null;
    const region=typeof c.region==='string'?c.region.trim():'';
    if(entries.filter(([jp])=>region.includes(jp)).length>1)return null;
    // Exact names or explicit prefecture names in an address. No city-name guessing.
    const matches=entries.filter(([jp,en])=>region===jp||region===jp.replace(/[都府県]$/,'')||region.toLowerCase()===en.toLowerCase()||region.startsWith(jp));
    if(matches.length!==1)return null;
    const [label,,longitude,latitude]=matches[0];
    return {longitude,latitude,label,basis:'都道府県の代表位置'};
  }
  const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*180/Math.PI;
  function project(lon,lat) {
    if(lat<30&&lon>132)return [616+(lon-141)*16,405+(merc(28)-merc(lat))*16];
    return lat<30 ? [28+(lon-122.8)*21,355+(merc(29.5)-merc(lat))*21] : [185+(lon-128.3)*26,18+(merc(45.9)-merc(lat))*23];
  }
  const api={locate,project};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RoyGeography=api;
})(globalThis);
