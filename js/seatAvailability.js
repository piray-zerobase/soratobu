/* =========================================================
   seatAvailability.js — 空席照会アダプタ（インターフェイス＋モック実装）
   ・呼び出し側は必ず seatAvailability(flightNo, date) というシグネチャで呼ぶこと。
     本番では航空会社/GDSの実API呼び出しに差し替える（人間ゲート：契約・接続情報が必要。
     README「本番化ロードマップ」参照）。差し替え時もこの関数シグネチャ・戻り値の形は維持する。
   ・現時点ではモック実装のみ。実際の空席状況ではないため、UI側は必ず
     「デモデータ」であることを明示すること（勝手に実データのように見せない）。
   ========================================================= */
const SEAT_STATUS = {
  AVAILABLE: "available", // 空席あり
  FEW: "few",             // 残りわずか
  FULL: "full",           // 満席
  UNKNOWN: "unknown",     // 照会不可（便名・日付なしなど）
};
const SEAT_STATUS_LABEL = {
  available: "空席あり",
  few: "残りわずか",
  full: "満席",
  unknown: "照会不可",
};

// 便名+日付から決定論的な数値を作る（同じ入力なら常に同じモック結果を返すため）
function seatHash(flightNo, date){
  const s = `${flightNo}|${date}`;
  let h = 0;
  for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

// モック実装：実際の空席照会ではなく、デモ表示用の疑似データ
function mockSeatAvailability(flightNo, date){
  if(!flightNo || !date) return {status:SEAT_STATUS.UNKNOWN, seatsLeft:null, source:"mock"};
  const bucket = seatHash(flightNo, date) % 10;
  if(bucket < 6) return {status:SEAT_STATUS.AVAILABLE, seatsLeft: 3 + (bucket%4), source:"mock"};
  if(bucket < 9) return {status:SEAT_STATUS.FEW, seatsLeft: 1, source:"mock"};
  return {status:SEAT_STATUS.FULL, seatsLeft: 0, source:"mock"};
}

// 空席照会アダプタ本体。UIからは常にこの関数を呼ぶ（実装差し替えの窓口）
function seatAvailability(flightNo, date){
  return mockSeatAvailability(flightNo, date);
}
