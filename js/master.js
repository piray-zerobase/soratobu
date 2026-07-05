/* =========================================================
   master.js — 実在確認用マスタデータ
   ・HOSP_MASTER: 実在する病院のマスタ（登録時の実在チェックに使用）
     - 47都道府県 各1（大阪のみ2：西淀病院・松原徳洲会病院）公的病院中心
     - 離島病院 各島1（都道府県枠とは別）
   ・座標は市区町村レベルの概算（地図表示用）
   ・AIRPORTS / FLIGHTS: 行程エンジン用（2026/6 実在ダイヤベース）
   ========================================================= */

const HOSP_MASTER = [
  // ---- 47都道府県（公的病院中心・各1、大阪のみ2）----
  {pref:"北海道", name:"市立札幌病院", city:"札幌市", lat:43.068, lng:141.334, kind:"公立"},
  {pref:"青森県", name:"青森県立中央病院", city:"青森市", lat:40.818, lng:140.757, kind:"公立"},
  {pref:"岩手県", name:"岩手県立中央病院", city:"盛岡市", lat:39.712, lng:141.146, kind:"公立"},
  {pref:"宮城県", name:"仙台市立病院", city:"仙台市", lat:38.234, lng:140.887, kind:"公立"},
  {pref:"秋田県", name:"市立秋田総合病院", city:"秋田市", lat:39.727, lng:140.095, kind:"公立"},
  {pref:"山形県", name:"山形県立中央病院", city:"山形市", lat:38.288, lng:140.345, kind:"公立"},
  {pref:"福島県", name:"福島県立医科大学附属病院", city:"福島市", lat:37.690, lng:140.470, kind:"公立大学"},
  {pref:"茨城県", name:"茨城県立中央病院", city:"笠間市", lat:36.360, lng:140.297, kind:"公立"},
  {pref:"栃木県", name:"済生会宇都宮病院", city:"宇都宮市", lat:36.577, lng:139.869, kind:"済生会"},
  {pref:"群馬県", name:"前橋赤十字病院", city:"前橋市", lat:36.371, lng:139.075, kind:"日赤"},
  {pref:"埼玉県", name:"さいたま赤十字病院", city:"さいたま市", lat:35.905, lng:139.628, kind:"日赤"},
  {pref:"千葉県", name:"成田赤十字病院", city:"成田市", lat:35.778, lng:140.318, kind:"日赤"},
  {pref:"東京都", name:"東京都立広尾病院", city:"渋谷区", lat:35.651, lng:139.719, kind:"公立"},
  {pref:"神奈川県", name:"横浜市立市民病院", city:"横浜市", lat:35.474, lng:139.601, kind:"公立"},
  {pref:"新潟県", name:"新潟市民病院", city:"新潟市", lat:37.884, lng:139.028, kind:"公立"},
  {pref:"富山県", name:"富山県立中央病院", city:"富山市", lat:36.696, lng:137.220, kind:"公立"},
  {pref:"石川県", name:"石川県立中央病院", city:"金沢市", lat:36.594, lng:136.620, kind:"公立"},
  {pref:"福井県", name:"福井県立病院", city:"福井市", lat:36.072, lng:136.240, kind:"公立"},
  {pref:"山梨県", name:"山梨県立中央病院", city:"甲府市", lat:35.672, lng:138.573, kind:"公立"},
  {pref:"長野県", name:"長野赤十字病院", city:"長野市", lat:36.634, lng:138.190, kind:"日赤"},
  {pref:"岐阜県", name:"岐阜県総合医療センター", city:"岐阜市", lat:35.401, lng:136.762, kind:"公立"},
  {pref:"静岡県", name:"静岡県立総合病院", city:"静岡市", lat:34.990, lng:138.400, kind:"公立"},
  {pref:"愛知県", name:"名古屋市立大学病院", city:"名古屋市", lat:35.139, lng:136.930, kind:"公立大学"},
  {pref:"三重県", name:"三重県立総合医療センター", city:"四日市市", lat:34.980, lng:136.620, kind:"公立"},
  {pref:"滋賀県", name:"大津赤十字病院", city:"大津市", lat:35.012, lng:135.861, kind:"日赤"},
  {pref:"京都府", name:"京都市立病院", city:"京都市", lat:34.994, lng:135.740, kind:"公立"},
  {pref:"大阪府", name:"西淀病院", city:"大阪市西淀川区", lat:34.711, lng:135.456, kind:"民医連"},
  {pref:"大阪府", name:"松原徳洲会病院", city:"松原市", lat:34.583, lng:135.551, kind:"徳洲会"},
  {pref:"兵庫県", name:"神戸市立医療センター中央市民病院", city:"神戸市", lat:34.660, lng:135.210, kind:"公立"},
  {pref:"奈良県", name:"奈良県総合医療センター", city:"奈良市", lat:34.685, lng:135.790, kind:"公立"},
  {pref:"和歌山県", name:"日本赤十字社和歌山医療センター", city:"和歌山市", lat:34.233, lng:135.170, kind:"日赤"},
  {pref:"鳥取県", name:"鳥取県立中央病院", city:"鳥取市", lat:35.522, lng:134.238, kind:"公立"},
  {pref:"島根県", name:"島根県立中央病院", city:"出雲市", lat:35.362, lng:132.755, kind:"公立"},
  {pref:"岡山県", name:"岡山赤十字病院", city:"岡山市", lat:34.650, lng:133.920, kind:"日赤"},
  {pref:"広島県", name:"広島市立広島市民病院", city:"広島市", lat:34.400, lng:132.458, kind:"公立"},
  {pref:"山口県", name:"山口県立総合医療センター", city:"防府市", lat:34.052, lng:131.567, kind:"公立"},
  {pref:"徳島県", name:"徳島県立中央病院", city:"徳島市", lat:34.072, lng:134.550, kind:"公立"},
  {pref:"香川県", name:"香川県立中央病院", city:"高松市", lat:34.351, lng:134.048, kind:"公立"},
  {pref:"愛媛県", name:"愛媛県立中央病院", city:"松山市", lat:33.837, lng:132.770, kind:"公立"},
  {pref:"高知県", name:"高知医療センター", city:"高知市", lat:33.552, lng:133.571, kind:"公立"},
  {pref:"福岡県", name:"福岡市民病院", city:"福岡市", lat:33.600, lng:130.430, kind:"公立"},
  {pref:"佐賀県", name:"佐賀県医療センター好生館", city:"佐賀市", lat:33.240, lng:130.288, kind:"公立"},
  {pref:"長崎県", name:"長崎みなとメディカルセンター", city:"長崎市", lat:32.740, lng:129.870, kind:"公立"},
  {pref:"熊本県", name:"熊本赤十字病院", city:"熊本市", lat:32.812, lng:130.752, kind:"日赤"},
  {pref:"大分県", name:"大分県立病院", city:"大分市", lat:33.222, lng:131.598, kind:"公立"},
  {pref:"宮崎県", name:"宮崎県立宮崎病院", city:"宮崎市", lat:31.913, lng:131.420, kind:"公立"},
  {pref:"鹿児島県", name:"鹿児島市立病院", city:"鹿児島市", lat:31.590, lng:130.545, kind:"公立"},
  {pref:"沖縄県", name:"沖縄県立中部病院", city:"うるま市", lat:26.370, lng:127.850, kind:"公立"},

  // ---- 離島病院（各島1・都道府県枠とは別）----
  {pref:"北海道", name:"利尻島国民健康保険中央病院", city:"利尻富士町", lat:45.183, lng:141.240, kind:"公立", island:"利尻島"},
  {pref:"新潟県", name:"佐渡総合病院", city:"佐渡市", lat:38.020, lng:138.370, kind:"厚生連", island:"佐渡島"},
  {pref:"東京都", name:"町立八丈病院", city:"八丈町", lat:33.110, lng:139.790, kind:"公立", island:"八丈島"},
  {pref:"兵庫県", name:"兵庫県立淡路医療センター", city:"洲本市", lat:34.340, lng:134.895, kind:"公立", island:"淡路島"},
  {pref:"島根県", name:"隠岐病院", city:"隠岐の島町", lat:36.210, lng:133.320, kind:"公立", island:"隠岐"},
  {pref:"香川県", name:"小豆島中央病院", city:"小豆島町", lat:34.482, lng:134.240, kind:"公立", island:"小豆島"},
  {pref:"長崎県", name:"長崎県対馬病院", city:"対馬市", lat:34.205, lng:129.290, kind:"公立", island:"対馬"},
  {pref:"長崎県", name:"長崎県壱岐病院", city:"壱岐市", lat:33.750, lng:129.690, kind:"公立", island:"壱岐"},
  {pref:"長崎県", name:"長崎県五島中央病院", city:"五島市", lat:32.700, lng:128.840, kind:"公立", island:"五島列島"},
  {pref:"鹿児島県", name:"鹿児島県立大島病院", city:"奄美市", lat:28.380, lng:129.495, kind:"公立", island:"奄美大島"},
  {pref:"鹿児島県", name:"喜界徳洲会病院", city:"喜界町", lat:28.320, lng:129.940, kind:"徳洲会", island:"喜界島"},
  {pref:"鹿児島県", name:"徳之島徳洲会病院", city:"徳之島町", lat:27.730, lng:128.980, kind:"徳洲会", island:"徳之島", airport:"TKN"},
  {pref:"鹿児島県", name:"沖永良部徳洲会病院", city:"知名町", lat:27.330, lng:128.600, kind:"徳洲会", island:"沖永良部島"},
  {pref:"鹿児島県", name:"与論徳洲会病院", city:"与論町", lat:27.045, lng:128.420, kind:"徳洲会", island:"与論島"},
  {pref:"鹿児島県", name:"屋久島徳洲会病院", city:"屋久島町", lat:30.385, lng:130.660, kind:"徳洲会", island:"屋久島", airport:"KUM"},
  {pref:"鹿児島県", name:"種子島医療センター", city:"西之表市", lat:30.732, lng:131.000, kind:"公的", island:"種子島", airport:"TNE"},
  {pref:"沖縄県", name:"沖縄県立宮古病院", city:"宮古島市", lat:24.800, lng:125.295, kind:"公立", island:"宮古島"},
  {pref:"沖縄県", name:"沖縄県立八重山病院", city:"石垣市", lat:24.345, lng:124.160, kind:"公立", island:"石垣島"},
  {pref:"沖縄県", name:"公立久米島病院", city:"久米島町", lat:26.340, lng:126.760, kind:"公立", island:"久米島"},
];

const PREFS = [...new Set(HOSP_MASTER.map(h => h.pref))];

/* ---- 空港・便マスタ（行程エンジン。2026/6 実在ダイヤベース） ---- */
const AIRPORTS = {
  ITM:{name:"大阪(伊丹)", lat:34.785, lng:135.438},
  KOJ:{name:"鹿児島", lat:31.80, lng:130.72},
  TKN:{name:"徳之島", lat:27.836, lng:128.881},
  KUM:{name:"屋久島", lat:30.386, lng:130.659},
  TNE:{name:"種子島", lat:30.605, lng:130.991},
};
const FLIGHTS = [
  ["JAL2405","ITM","KOJ","09:20","10:35"], ["JAL2407","ITM","KOJ","11:00","12:15"],
  ["ANA541","ITM","KOJ","07:05","08:25"],  ["ANA545","ITM","KOJ","10:50","12:10"],
  ["JAL2408","KOJ","ITM","12:50","14:00"], ["JAL2410","KOJ","ITM","14:45","15:55"],
  ["ANA550","KOJ","ITM","17:35","18:55"],  ["JAL2412","KOJ","ITM","18:05","19:15"], ["JAL2414","KOJ","ITM","19:10","20:30"],
  ["JAL3791","KOJ","TKN","07:50","09:10"], ["JAL3793","KOJ","TKN","08:55","09:55"],
  ["JAL3795","KOJ","TKN","13:00","14:20"], ["JAL3797","KOJ","TKN","16:05","17:10"],
  ["JAL3792","TKN","KOJ","10:25","11:20"], ["JAL3794","TKN","KOJ","14:55","16:10"],
  ["JAL3796","TKN","KOJ","17:40","18:35"], ["JAL3798","TKN","KOJ","19:00","20:15"],
  ["JAL3741","KOJ","KUM","08:45","09:25"], ["JAL3743","KOJ","KUM","10:30","11:10"],
  ["JAL3745","KOJ","KUM","13:30","14:10"], ["JAL3759","KOJ","KUM","17:45","18:25"],
  ["JAL3740","KUM","KOJ","10:00","10:35"], ["JAL3744","KUM","KOJ","11:45","12:20"],
  ["JAL3746","KUM","KOJ","13:45","14:20"], ["JAL3756","KUM","KOJ","19:00","19:35"],
  ["JAL2451","ITM","KUM","11:25","13:15"], ["JAL2450","KUM","ITM","14:40","16:15"],
  ["JAL3761","KOJ","TNE","08:10","08:50"], ["JAL3763","KOJ","TNE","11:00","11:40"],
  ["JAL3769","KOJ","TNE","15:20","16:00"], ["JAL3777","KOJ","TNE","16:50","17:30"],
  ["JAL3760","TNE","KOJ","09:20","09:55"], ["JAL3764","TNE","KOJ","12:10","12:45"],
  ["JAL3768","TNE","KOJ","16:30","17:05"], ["JAL3772","TNE","KOJ","18:00","18:35"],
].map(f => ({no:f[0], from:f[1], to:f[2], dep:f[3], arr:f[4]}));

/* ---- 病院名の実在チェック（マスタ照合）----
   正規化して部分一致：完全実装ではDB照合＋医療機関コード確認に置き換える */
function normalizeHospName(s){
  return (s||"").replace(/[\s　]/g,"").replace(/（仮）|\(仮\)/g,"")
    .replace(/独立行政法人|地方独立行政法人|医療法人|社会医療法人|公益社団法人|日本赤十字社/g,"");
}
function matchMaster(name, pref){
  const n = normalizeHospName(name);
  if(!n) return null;
  return HOSP_MASTER.find(h => {
    const m = normalizeHospName(h.name);
    const prefOk = !pref || h.pref === pref;
    return prefOk && (m === n || m.includes(n) || n.includes(m));
  }) || null;
}
