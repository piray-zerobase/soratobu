/* =========================================================
   store-supabase.js — Supabaseアダプタ骨格（雛形・未接続）
   ・js/store.js と同じ関数名（auth.signup/login/logout/me、
     api.registerDoctor/publishPosting/apply/approve/... など）を
     supabase-js 経由で実装するための「型」だけを用意したファイル。
   ・v0.2時点では index.html から読み込んでいない＝アプリの動作には
     一切影響しない。実際に切り替えるのは人間が下記を終えたあと：
       1. Supabaseプロジェクト作成・supabase/schema.sql の適用（⏸人間待ち）
       2. js/config.example.js を config.js としてコピーし接続情報を記入
       3. 本ファイル中のTODOを埋めてRPC関数（security definer）をSQL側に用意
       4. index.html の <script src="js/store.js"> を
          <script src="js/config.js"> + <script src="js/store-supabase.js">
          （＋supabase-jsのCDN読み込み）に差し替える
     のすべてを確認したうえで、動作確認してから。
   ・状態遷移（apply/approve/…）はクライアントから直接テーブル更新せず、
     supabase.rpc() でDB側のsecurity definer関数を呼ぶ設計とする
     （ダブルブッキング防止・権限チェックをDB層でも保証するため。
     schema.sql冒頭のRLS方針コメント参照）。
   ・②のデータ構造（テーブル定義）は凍結。ここでは呼び出し方のみ実装する。
   ========================================================= */

/* 使い方（人間が切替時に）：
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
   <script src="js/config.js"></script>
   <script src="js/store-supabase.js"></script>
   window.supabase.createClient(...) がグローバルに用意されている前提。
*/
const sbClient = (typeof SORATOBU_CONFIG !== "undefined" && typeof supabase !== "undefined")
  ? supabase.createClient(SORATOBU_CONFIG.SUPABASE_URL, SORATOBU_CONFIG.SUPABASE_ANON_KEY)
  : null;

function assertClient(){
  if(!sbClient) throw new Error("Supabase未接続：js/config.jsを用意し、supabase-jsのCDNを読み込んでください（⏸人間待ち）");
}

/* ---------- 認証API（store.jsと同じインターフェイス） ----------
   本番はSupabase Authに一本化（パスワードハッシュの自前実装は不要になる） */
const auth = {
  session: null,   // {userId, role, refId} ※role/refIdはdoctors/hospital_usersから引く
  async signup(email, pass, role){
    assertClient();
    const { data, error } = await sbClient.auth.signUp({ email, password: pass });
    if(error) return {err:error.message};
    // TODO: role（doctor/hospital）をuser_metadataに保存 or
    //       registerDoctor/registerHospital呼び出し時にhospital_users等へ紐づけ
    this.session = {userId:data.user.id, role, refId:null};
    return {ok:true};
  },
  async login(email, pass){
    assertClient();
    const { data, error } = await sbClient.auth.signInWithPassword({ email, password: pass });
    if(error) return {err:"メールアドレスまたはパスワードが違います"};
    // TODO: doctors/hospital_usersからrefIdを引いてsessionに載せる
    this.session = {userId:data.user.id, role:null, refId:null};
    return {ok:true};
  },
  async logout(){
    assertClient();
    await sbClient.auth.signOut();
    this.session = null;
  },
  me(){ return this.session; },
};

/* ---------- 業務API ----------
   状態遷移はすべてDB側のRPC（security definer関数）を呼ぶ。
   RPC名・引数は例。実装時はsupabase/schema.sqlに対応する関数を追加すること
   （下記TODOのRPCは現時点のschema.sqlにはまだ定義されていない）。 */
const api = {
  async registerDoctor(userId, prof){
    assertClient();
    // TODO: RPC register_doctor(user_id, name, license_no, hokeni_no, specialties, capabilities, home_base, files)
    return await sbClient.rpc("register_doctor", { p_user_id:userId, p_prof:prof });
  },
  async registerHospital(userId, prof){
    assertClient();
    // TODO: RPC register_hospital(user_id, name, pref, address, phone, facilities)
    return await sbClient.rpc("register_hospital", { p_user_id:userId, p_prof:prof });
  },
  async joinHospitalByInviteCode(userId, code){
    assertClient();
    // TODO: RPC join_hospital_by_invite_code(user_id, code) ※招待コードはschema.sqlに未追加、要カラム追加
    return await sbClient.rpc("join_hospital_by_invite_code", { p_user_id:userId, p_code:code });
  },
  async regenerateInviteCode(userId){
    assertClient();
    return await sbClient.rpc("regenerate_invite_code", { p_user_id:userId });
  },
  async publishPosting(hospitalId, p){
    assertClient();
    // TODO: RPC publish_posting(hospital_id, posting jsonb) → 病院status="承認"チェックをDB側でも行う
    return await sbClient.rpc("publish_posting", { p_hospital_id:hospitalId, p_posting:p });
  },
  async apply(doctorId, postingId, itin){
    assertClient();
    // TODO: RPC apply(doctor_id, posting_id, itinerary jsonb)
    //       findScheduleConflict相当の重複チェックをDB側（RPC内 or トリガー）でも必ず再実装すること。
    //       postings.id をunique制約付きのassignmentsで守る、applications(posting_id,doctor_id)のunique制約と併用
    return await sbClient.rpc("apply", { p_doctor_id:doctorId, p_posting_id:postingId, p_itinerary:itin });
  },
  async approve(hospitalId, applicationId){
    assertClient();
    // TODO: RPC approve(hospital_id, application_id) → 承認時の再検証（重複・status="open"）をDB側で行う
    return await sbClient.rpc("approve", { p_hospital_id:hospitalId, p_application_id:applicationId });
  },
  async decline(hospitalId, applicationId){
    assertClient();
    return await sbClient.rpc("decline", { p_hospital_id:hospitalId, p_application_id:applicationId });
  },
  async withdraw(doctorId, applicationId, reason){
    assertClient();
    return await sbClient.rpc("withdraw", { p_doctor_id:doctorId, p_application_id:applicationId, p_reason:reason });
  },
  async cancelAssignment(actorRole, actorId, assignmentId, reason){
    assertClient();
    // TODO: RPC cancel_assignment(actor_role, actor_id, assignment_id, reason) ※schema.sqlに未追加
    return await sbClient.rpc("cancel_assignment", {
      p_actor_role:actorRole, p_actor_id:actorId, p_assignment_id:assignmentId, p_reason:reason,
    });
  },
  async complete(hospitalId, assignmentId){
    assertClient();
    return await sbClient.rpc("complete", { p_hospital_id:hospitalId, p_assignment_id:assignmentId });
  },
  async selfReportBooking(doctorId, assignmentId){
    assertClient();
    return await sbClient.rpc("self_report_booking", { p_doctor_id:doctorId, p_assignment_id:assignmentId });
  },
  async sendMessage(applicationId, senderRole, senderId, text){
    assertClient();
    // Legal by Design：運営（admin）はここを呼べない（DB側RPCでも senderRole in ('doctor','hospital') を必ず検証する）
    return await sbClient.rpc("send_message", {
      p_application_id:applicationId, p_sender_role:senderRole, p_sender_id:senderId, p_text:text,
    });
  },
  async verifyDoctor(actorUserId, doctorId, approveIt){
    assertClient();
    return await sbClient.rpc("verify_doctor", { p_actor_user_id:actorUserId, p_doctor_id:doctorId, p_approve:approveIt });
  },
  async verifyHospital(actorUserId, hospitalId, approveIt){
    assertClient();
    return await sbClient.rpc("verify_hospital", { p_actor_user_id:actorUserId, p_hospital_id:hospitalId, p_approve:approveIt });
  },
  async verifyCredential(actorUserId, doctorId, type, approveIt){
    assertClient();
    return await sbClient.rpc("verify_credential", {
      p_actor_user_id:actorUserId, p_doctor_id:doctorId, p_type:type, p_approve:approveIt,
    });
  },
  async markNotificationsRead(userId){
    assertClient();
    // TODO: notifCursor相当のテーブル（user_id, last_seq）をschema.sqlに追加
    return await sbClient.rpc("mark_notifications_read", { p_user_id:userId });
  },
};
