/* =========================================================
   cloud-map.js — クラウド切替(1/6) マッピング層
   ・DBの行（snake_case：supabase/schema.sql準拠）⇄ ビューが使う形
     （camelCase：js/store.jsのDB.*と同じキー構成）の変換関数。
   ・この段階では変換のみを提供する（fetchやキャッシュは次タスクで実装）。
   ・往復（DB行→ビュー形→DB行）で元のDB列がすべて復元できることをテストで担保する。
   ・DBに存在しない列（下記「ビュー限定フィールド」）は *ToDb() では書き出さない
     （＝DBへの書き込みには使わない、UI表示専用の値であることを明示）。
   ========================================================= */

/* posting.type → posting.cls（バッジ配色）。DBには列が無く、募集ウィザード
   （js/app.js の W_TYPES）と同じ対応をここでも保持して表示用に算出する。 */
const TYPE_CLS = {
  "当直": "b-touku",
  "外来応援": "b-gairai",
  "健診応援": "b-kenshin",
  "ワクチン": "b-vac",
};

/* ---------- posting ---------- */
function postingFromDb(row){
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    status: row.status,
    urgent: row.urgent,
    date: row.date,
    timeStart: row.time_start,
    timeEnd: row.time_end,
    overnight: row.overnight,
    type: row.type,
    cls: TYPE_CLS[row.type] || "b-other",   // ビュー限定：DB列なし
    department: row.department,
    requiredCredentials: row.required_credentials,
    pay: row.pay,
    transport: row.transport,
    lodging: row.lodging,
    ground: row.ground,
    note: row.note,
    publishedAt: row.published_at,
  };
}
function postingToDb(p){
  return {
    id: p.id,
    hospital_id: p.hospitalId,
    status: p.status,
    urgent: p.urgent,
    date: p.date,
    time_start: p.timeStart,
    time_end: p.timeEnd,
    overnight: p.overnight,
    type: p.type,
    department: p.department,
    required_credentials: p.requiredCredentials,
    pay: p.pay,
    transport: p.transport,
    lodging: p.lodging,
    ground: p.ground,
    note: p.note,
    published_at: p.publishedAt,
  };
}

/* ---------- hospital ---------- */
/* 注意：view側のcity/kind（master.js照合結果の表示用）はDBの列に無い。
   現状app.jsはcity/kindを描画に使っていないため、fromDbでは付与しない
   （必要になった時点でHOSP_MASTERとの再照合、または列追加を検討する）。 */
function hospitalFromDb(row){
  return {
    id: row.id,
    name: row.name,
    pref: row.pref,
    address: row.address,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    island: row.island,
    airport: row.airport,
    status: row.status,
    verifiedNote: row.verified_note,
    facilities: row.facilities,
    inviteCode: row.invite_code,
  };
}
function hospitalToDb(h){
  return {
    id: h.id,
    name: h.name,
    pref: h.pref,
    address: h.address,
    phone: h.phone,
    lat: h.lat,
    lng: h.lng,
    island: h.island,
    airport: h.airport,
    status: h.status,
    verified_note: h.verifiedNote,
    facilities: h.facilities,
    invite_code: h.inviteCode,
  };
}

/* ---------- doctor ---------- */
/* 注意：view側のemail（auth.usersに由来）とfiles/credentials（credentialsテーブル）は
   doctors行そのものには無い。呼び出し側が別途取得しextraで合成する想定（次タスクのfetch層で対応）。 */
function doctorFromDb(row, extra){
  return Object.assign({
    id: row.id,
    name: row.name,
    licenseNo: row.license_no,
    hokeniNo: row.hokeni_no,
    specialties: row.specialties,
    capabilities: row.capabilities,
    homeBase: row.home_base,
    status: row.status,
    completedCount: row.completed_count,
  }, extra || {});
}
function doctorToDb(d){
  return {
    id: d.id,
    name: d.name,
    license_no: d.licenseNo,
    hokeni_no: d.hokeniNo,
    specialties: d.specialties,
    capabilities: d.capabilities,
    home_base: d.homeBase,
    status: d.status,
    completed_count: d.completedCount,
  };
}

/* ---------- application ---------- */
function applicationFromDb(row){
  return {
    id: row.id,
    postingId: row.posting_id,
    doctorId: row.doctor_id,
    status: row.status,
    itinerary: row.itinerary,
    appliedAt: row.applied_at,
    decidedAt: row.decided_at,
  };
}
function applicationToDb(a){
  return {
    id: a.id,
    posting_id: a.postingId,
    doctor_id: a.doctorId,
    status: a.status,
    itinerary: a.itinerary,
    applied_at: a.appliedAt,
    decided_at: a.decidedAt,
  };
}

/* ---------- assignment ---------- */
function assignmentFromDb(row){
  return {
    id: row.id,
    postingId: row.posting_id,
    doctorId: row.doctor_id,
    hospitalId: row.hospital_id,
    status: row.status,
    employmentType: row.employment_type,
    termsSnapshot: row.terms_snapshot,
    itinerary: row.itinerary,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
  };
}
function assignmentToDb(a){
  return {
    id: a.id,
    posting_id: a.postingId,
    doctor_id: a.doctorId,
    hospital_id: a.hospitalId,
    status: a.status,
    employment_type: a.employmentType,
    terms_snapshot: a.termsSnapshot,
    itinerary: a.itinerary,
    created_at: a.createdAt,
    completed_at: a.completedAt,
    cancelled_by: a.cancelledBy,
    cancel_reason: a.cancelReason,
  };
}

/* ---------- message ---------- */
function messageFromDb(row){
  return {
    id: row.id,
    applicationId: row.application_id,
    senderRole: row.sender_role,
    senderId: row.sender_id,
    text: row.text,
    ts: row.created_at,
  };
}
function messageToDb(m){
  return {
    id: m.id,
    application_id: m.applicationId,
    sender_role: m.senderRole,
    sender_id: m.senderId,
    text: m.text,
    created_at: m.ts,
  };
}
