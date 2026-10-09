const {test}=require('node:test');
const assert=require('node:assert/strict');
const {locate,project}=require('../geography.js');
const {parse}=require('../outbound-model.js');
test('explicit prefectures produce representative pins and unknown cities remain unplaced',()=>{
  assert.equal(locate({region:'東京都新宿区'}).label,'東京都');
  assert.equal(locate({region:'Tokyo'}).basis,'都道府県の代表位置');
  for(const region of ['未設定','関東','名古屋','New York','東京または大阪','東京都または大阪府','福岡近郊'])assert.equal(locate({region}),null);
});
test('records keep only valid numerical coordinates and region metadata',()=>{
  const [c]=parse([{businessName:'架空の検証',region:'東京',location:{longitude:139.76,latitude:35.68}}]);
  assert.equal(locate(c).basis,'記録座標');
  for(const location of [{longitude:'139.7',latitude:35.6},{longitude:Infinity,latitude:35.6},{longitude:139,latitude:91}])assert.equal(parse([{businessName:'検証',location}])[0].location,null);
  assert.equal(locate({location:{longitude:10,latitude:50}}),null);
});
test('Okinawa and main-island representative positions fit their map frames',()=>{
  const okinawa=locate({region:'沖縄県'}),[x,y]=project(okinawa.longitude,okinawa.latitude);
  assert.ok(x>20&&x<176&&y>340&&y<498);
  for(const region of ['北海道','東京都','福岡県','鹿児島県']){const p=locate({region}),[x,y]=project(p.longitude,p.latitude);assert.ok(x>=0&&x<=720&&y>=0&&y<=530,region);}
});
