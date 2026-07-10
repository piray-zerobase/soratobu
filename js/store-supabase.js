/* =========================================================
   store-supabase.js — Supabaseアダプタ（本実装）
   ・js/store.js と同じ関数シグネチャ（ビュー層は無変更で差し替え可能）
   ・状態遷移はすべて supabase.rpc() → DB側 security definer 関数
     （supabase/schema.sql → schema_v2_rpc.sql の順に適用済みであること）
   ・セキュリティ設計：実行者はDB側で auth.uid() から導出する。
     ビューから渡される doctorId/hospitalId 等の「自己申告ID」は
     互換性のため受け取るが、サーバーには送らない（なりすまし不能）。
   ・切替手順（人間ゲート）：
     1. Supabaseプロジェクト作成 → SQL Editorで schema.sql → schema_v2_rpc.sql
     2. Authentication > Email を有効化（Confirm email はパイロット中はOFF推奨）
     3. js/config.example.js を js/config.js にコピーしてURL/ANON_KEYを記入
     4. index.html のscriptを差し替え：
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
        <script src="js/config.js"></script>
        <script src="js/store-supabase.js"></script>   ← js/store.js の代わり
     5. admins テーブルに運営ユーザーを登録（schema_v2_rpc.sql 末尾参照）
   ========================================================= */

const sbClient = (typeof SORATOBU_CONFIG !== "undefined" && typeof supabase !== "undefined")
  ? supabase.createClient(SORATOBU_CONFIG.SUPABASE_URL, SORATOBU_CONFIG.SUPABASE_ANON_KEY)
  : null;

function assertClient(){
  if(!sbClient) throw new Error("Supabase未接続：js/config.jsを用意し、supabase-jsのCDNを読み込んでください");
}
/* rpcの戻りを store.js と同じ {ok/err} 形式に揃える */
async function rpc(name, args){
  assertClient();
  const { data, error } = await sbClient.rpc(name, args || {});
  if(error) return { err: error.message };
  return { ok: true, data };
}

/* ---------- 認証（Supabase Auth） ---------- */
const auth = {
  session: null,   // {userId, role, refId, status}

  async signup(email, pass, role){
    assertClient();
    if((pass||"").length < 8) return {err:"パスワードは8文字以上にしてください"};
    const { data, error } = await sbClient.auth.signUp({
      email, password: pass, options: { data: { role } },
    });
    if(error) return {err: error.message};
    this.session = { userId: data.user.id, role, refId: null };
    return {ok:true};
  },

  async login(email, pass){
    assertClient();
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password: pass });
    if(error){
      if(/confirm/i.test(error.message))
        return {err:"メールアドレスの確認が済んでいません（運営側の設定でConfirm emailをOFFにするか、確認メールのリンクを開いてください）"};
      return {err:"メールアドレスまたはパスワードが違います"};
    }
    const prof = await rpc("get_my_profile");
    if(prof.err) return prof;
    const p = prof.data || {};
    this.session = {
      userId: data.user.id,
      role: p.role || (data.user.user_metadata||{}).role || null,
      refId: p.refId || null,
      status: p.status || null,
    };
    return {ok:true};
  },

  async logout(){ assertClient(); await sbClient.auth.signOut(); this.session = null; },
  me(){ return this.session; },
};

/* ---------- 業務API（store.jsと同名・同引数。actor系引数はサーバーでは使わない） ---------- */
const api = {
  async registerDoctor(_userId, prof){
    const r = await rpc("register_doctor", {
      p_name: prof.name, p_license_no: prof.licenseNo, p_hokeni_no: prof.hokeniNo || "",
      p_specialties: prof.specialties, p_capabilities: prof.capabilities,
      p_home_base: prof.homeBase,
    });
    if(r.ok && auth.session){ auth.session.refId = r.data; auth.session.role = "doctor"; }
    return r;
    // 書類画像はSupabase Storage（非公開バケット）へ別途アップロードし
    // credentials.file_path を更新する（Storage設定は人間ゲート）
  },
  async registerHospital(_userId, prof){
    const r = await rpc("register_hospital", {
      p_name: prof.name, p_pref: prof.pref, p_address: prof.address,
      p_phone: prof.phone || "", p_facilities: prof.facilities || "",
    });
    if(r.ok && auth.session){ auth.session.refId = r.data; auth.session.role = "hospital"; }
    return r;
  },
  async joinHospitalByInviteCode(_userId, code){
    const r = await rpc("join_hospital_by_invite_code", { p_code: code });
    if(r.ok && auth.session){ auth.session.refId = r.data; }
    return r;
  },
  async regenerateInviteCode(_userId){
    const r = await rpc("regenerate_invite_code");
    if(r.ok) return { ok:true, inviteCode: r.data };
    return r;
  },
  async publishPosting(_hospitalId, p){ return rpc("publish_posting", { p }); },
  async apply(_doctorId, postingId, itin){
    return rpc("apply_posting", { p_posting_id: postingId, p_itinerary: itin });
  },
  async approve(_hospitalId, applicationId){
    return rpc("approve_application", { p_application_id: applicationId });
  },
  async decline(_hospitalId, applicationId){
    return rpc("decline_application", { p_application_id: applicationId });
  },
  async withdraw(_doctorId, applicationId, reason){
    return rpc("withdraw_application", { p_application_id: applicationId, p_reason: reason || "" });
  },
  async cancelAssignment(_actorRole, _actorId, assignmentId, reason){
    return rpc("cancel_assignment", { p_assignment_id: assignmentId, p_reason: reason || "" });
  },
  async complete(_hospitalId, assignmentId){
    return rpc("complete_assignment", { p_assignment_id: assignmentId });
  },
  async selfReportBooking(_doctorId, assignmentId){
    return rpc("self_report_booking", { p_assignment_id: assignmentId });
  },
  async sendMessage(applicationId, _senderRole, _senderId, text){
    // Legal by Design：当事者判定はDB側。運営はdoctors/hospital_usersに存在しないため構造的に送信不可
    return rpc("send_message", { p_application_id: applicationId, p_text: text });
  },
  async verifyDoctor(doctorId, approveIt){
    return rpc("verify_doctor", { p_doctor_id: doctorId, p_approve: !!approveIt });
  },
  async verifyHospital(hospitalId, approveIt){
    return rpc("verify_hospital", { p_hospital_id: hospitalId, p_approve: !!approveIt });
  },
  async verifyCredential(doctorId, type, approveIt){
    // RPCはcredential_id指定のため、先に該当書類（確認中）を引く
    assertClient();
    const { data, error } = await sbClient.from("credentials").select("id")
      .eq("doctor_id", doctorId).eq("type", type).eq("status", "確認中").limit(1);
    if(error) return { err: error.message };
    if(!data || !data.length) return { err: "確認中の書類がありません" };
    return rpc("verify_credential", { p_credential_id: data[0].id, p_approve: !!approveIt });
  },
  async markNotificationsRead(_userId){ return rpc("mark_notifications_read"); },
};

/* ---------- 読み取り系ヘルパ（RLSが自動で見える範囲を絞る） ----------
   ビュー層のDB直参照（DB.postings等）をSupabaseに移す際に使う。
   一覧はこのfetchXxxで取得してからrender（詳細な移行はビュー層改修時に）。 */
async function fetchOpenPostings(){
  assertClient();
  const { data, error } = await sbClient
    .from("postings").select("*, hospitals(name, pref, island, lat, lng, airport, status)")
    .eq("status", "open");
  return error ? { err: error.message } : { ok: true, data };
}
async function fetchMyApplications(){
  assertClient();
  const { data, error } = await sbClient
    .from("applications").select("*, postings(*, hospitals(name, pref, island))");
  return error ? { err: error.message } : { ok: true, data };
}
async function fetchMessages(applicationId){
  assertClient();
  const { data, error } = await sbClient
    .from("messages").select("*").eq("application_id", applicationId)
    .order("created_at", { ascending: true });
  return error ? { err: error.message } : { ok: true, data };
}
async function fetchMyDoctor(){
  assertClient();
  if(!auth.session || !auth.session.userId) return { err: "未ログインです" };
  const { data, error } = await sbClient
    .from("doctors").select("*, credentials(*)")
    .eq("user_id", auth.session.userId).maybeSingle();
  return error ? { err: error.message } : { ok: true, data };
}
async function fetchMyHospital(){
  assertClient();
  if(!auth.session || !auth.session.refId) return { err: "病院登録が必要です" };
  const { data, error } = await sbClient
    .from("hospitals").select("*")
    .eq("id", auth.session.refId).maybeSingle();
  return error ? { err: error.message } : { ok: true, data };
}
/* 病院向け：自院の募集への応募一覧（RLSでも自院分のみに絞られる。ここでも明示的に絞る） */
async function fetchApplicationsForMyPostings(){
  assertClient();
  if(!auth.session || !auth.session.refId) return { err: "病院登録が必要です" };
  const { data, error } = await sbClient
    .from("applications").select("*, postings!inner(*), doctors(*)")
    .eq("postings.hospital_id", auth.session.refId)
    .order("applied_at", { ascending: false });
  return error ? { err: error.message } : { ok: true, data };
}
/* 医師・病院どちらのロールでも呼べる：RLSがdoctor_id/hospital_idで自動的に絞る */
async function fetchMyAssignments(){
  assertClient();
  const { data, error } = await sbClient
    .from("assignments").select("*, postings(*), doctors(*), hospitals(*)")
    .order("created_at", { ascending: false });
  return error ? { err: error.message } : { ok: true, data };
}
/* 運営（admin）向け：審査中の医師・病院、確認中credentials、監査ログ最新50件をまとめて取得 */
async function fetchAdminQueues(){
  assertClient();
  const [doctorsQ, hospitalsQ, credsQ, auditQ] = await Promise.all([
    sbClient.from("doctors").select("*").eq("status", "審査中"),
    sbClient.from("hospitals").select("*").eq("status", "審査中"),
    sbClient.from("credentials").select("*, doctors(name)").eq("status", "確認中"),
    sbClient.from("audit_log").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const failed = [doctorsQ, hospitalsQ, credsQ, auditQ].find(r => r.error);
  if(failed) return { err: failed.error.message };
  return { ok: true, data: {
    doctors: doctorsQ.data, hospitals: hospitalsQ.data,
    credentials: credsQ.data, auditLog: auditQ.data,
  }};
}
