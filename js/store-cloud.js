/* =========================================================
   store-cloud.js — クラウド切替(3/6) キャッシュ層
   ・store.js の DB（postings/hospitals/doctors/applications/
     assignments/messages/audit の配列を持つオブジェクト）と
     同じキー構成のキャッシュ CACHE を保持する。
   ・refreshAll(role) が js/store-supabase.js の fetchXxx 群と
     js/cloud-map.js の *FromDb 変換で CACHE を埋め直す。
   ・auth/api は store-supabase.js のものをそのまま使う（このファイルは
     読み取りキャッシュのみを担当し、書き込みは委譲する）。
   ・書き込み系API成功後は、呼び出し側（cloud.html化する時のapp.js）が
     必ず refreshAll(role) → render の順で呼ぶこと（キャッシュ層は
     write成功時に自動でrefreshはしない＝二重fetchを避けるため）。
   ・読み込み順：supabase-js CDN → config.js → store-supabase.js
     → cloud-map.js → store-cloud.js → master.js → app.js
   ========================================================= */

function emptyCloudCache(){
  return { postings: [], hospitals: [], doctors: [], applications: [], assignments: [], messages: [], audit: [] };
}
const CACHE = emptyCloudCache();

function upsertById(arr, item){
  if(!item || item.id == null) return;
  const i = arr.findIndex(x => x.id === item.id);
  if(i >= 0) arr[i] = Object.assign({}, arr[i], item);
  else arr.push(item);
}

/* postings一覧に埋め込まれたhospitals（一部列のみselect）から
   表示に必要な範囲のhospitalオブジェクトを組み立てる（idは埋め込み側に無いためposting.hospital_idを補う） */
function hospitalFromEmbedded(hospitalId, row){
  if(!row) return null;
  return {
    id: hospitalId, name: row.name, pref: row.pref, island: row.island,
    lat: row.lat, lng: row.lng, airport: row.airport, status: row.status,
  };
}

/* 監査ログ（cloud-map.jsには変換関数が無いため、ここで直接変換する） */
function auditFromDb(row){
  return { ts: row.created_at, actor: row.actor, action: row.action, detail: row.detail };
}

/* ---------- refreshAll(role)：ロールごとに見える範囲だけ取得してCACHEを埋め直す ----------
   いずれかのfetchが失敗した場合はCACHEを書き換えず{err}を返す（直前の正常な状態を保つ）。 */
async function refreshAll(role){
  const next = emptyCloudCache();
  try{
    if(role === "doctor"){
      const [openR, myDrR, myAppsR, myAsgR] = await Promise.all([
        fetchOpenPostings(), fetchMyDoctor(), fetchMyApplications(), fetchMyAssignments(),
      ]);
      const failed = [openR, myDrR, myAppsR, myAsgR].find(r => r.err);
      if(failed) return { err: failed.err };

      (openR.data || []).forEach(row => {
        upsertById(next.postings, postingFromDb(row));
        upsertById(next.hospitals, hospitalFromEmbedded(row.hospital_id, row.hospitals));
      });
      if(myDrR.data){
        const { credentials, ...rest } = myDrR.data;
        upsertById(next.doctors, doctorFromDb(rest, { credentials: credentials || [] }));
      }
      (myAppsR.data || []).forEach(row => {
        const { postings, ...rest } = row;
        upsertById(next.applications, applicationFromDb(rest));
        if(postings){
          const { hospitals, ...poRest } = postings;
          upsertById(next.postings, postingFromDb(poRest));
          upsertById(next.hospitals, hospitalFromEmbedded(poRest.hospital_id, hospitals));
        }
      });
      (myAsgR.data || []).forEach(row => {
        const { postings, doctors, hospitals, ...rest } = row;
        upsertById(next.assignments, assignmentFromDb(rest));
        if(postings) upsertById(next.postings, postingFromDb(postings));
        if(doctors) upsertById(next.doctors, doctorFromDb(doctors));
        if(hospitals) upsertById(next.hospitals, hospitalFromDb(hospitals));
      });
    } else if(role === "hospital"){
      const [myHospR, appsR, asgR] = await Promise.all([
        fetchMyHospital(), fetchApplicationsForMyPostings(), fetchMyAssignments(),
      ]);
      const failed = [myHospR, appsR, asgR].find(r => r.err);
      if(failed) return { err: failed.err };

      if(myHospR.data) upsertById(next.hospitals, hospitalFromDb(myHospR.data));
      (appsR.data || []).forEach(row => {
        const { postings, doctors, ...rest } = row;
        upsertById(next.applications, applicationFromDb(rest));
        if(postings) upsertById(next.postings, postingFromDb(postings));
        if(doctors) upsertById(next.doctors, doctorFromDb(doctors));
      });
      (asgR.data || []).forEach(row => {
        const { postings, doctors, hospitals, ...rest } = row;
        upsertById(next.assignments, assignmentFromDb(rest));
        if(postings) upsertById(next.postings, postingFromDb(postings));
        if(doctors) upsertById(next.doctors, doctorFromDb(doctors));
        if(hospitals) upsertById(next.hospitals, hospitalFromDb(hospitals));
      });
    } else if(role === "admin"){
      const adminR = await fetchAdminQueues();
      if(adminR.err) return { err: adminR.err };
      (adminR.data.doctors || []).forEach(row => upsertById(next.doctors, doctorFromDb(row)));
      (adminR.data.hospitals || []).forEach(row => upsertById(next.hospitals, hospitalFromDb(row)));
      (adminR.data.credentials || []).forEach(row => {
        const { doctors, ...cr } = row;
        let dr = next.doctors.find(d => d.id === cr.doctor_id);
        if(!dr){ dr = doctorFromDb({ id: cr.doctor_id, name: doctors ? doctors.name : "" }); next.doctors.push(dr); }
        if(!dr.credentials) dr.credentials = [];
        dr.credentials.push({ id: cr.id, type: cr.type, status: cr.status });
      });
      next.audit = (adminR.data.auditLog || []).map(auditFromDb);
    } else {
      return { err: "不明なロールです" };
    }
  }catch(e){
    return { err: e.message || String(e) };
  }
  Object.assign(CACHE, next);
  return { ok: true };
}

/* ---------- 特定の応募のチャットだけ最新化（応募単位で必要な時に呼ぶ） ---------- */
async function refreshMessages(applicationId){
  const r = await fetchMessages(applicationId);
  if(r.err) return r;
  CACHE.messages = CACHE.messages.filter(m => m.applicationId !== applicationId)
    .concat((r.data || []).map(messageFromDb));
  return { ok: true };
}
