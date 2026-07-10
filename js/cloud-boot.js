/* =========================================================
   cloud-boot.js — クラウド切替(5/6) cloud.html 起動アダプタ
   ・js/store.js（デモモード）の代わりに js/store-supabase.js +
     js/cloud-map.js + js/store-cloud.js を読み込む cloud.html 専用。
   ・js/app.js の末尾（window "load"）は store.js が定義する
     restoreSession()/ensureSeedUsers()/DB/persistSession()/resetDB() を
     前提に書かれており、app.js 自体は書き換えない方針のため、
     同名の関数をここで cloud 版として定義して差し替える。
   ・実際のセッション復元（supabaseの保存セッション→get_my_profile→
     CACHEの初期refreshAll）は、app.jsが await している
     ensureSeedUsers() の中で行う（名前は流用だが役割はセッション復元）。
   ========================================================= */

let DB = CACHE; // app.jsのDB.xxx直参照はstore-cloud.jsのCACHEを見る

function persistSession(){ /* supabase-js が自前でセッションを永続化するため何もしない */ }

function restoreSession(){ /* 復元処理はensureSeedUsers()側（awaitされる）で行うためここは何もしない */ }

function resetDB(){ toast("クラウド接続時はこの操作はできません（デモモード専用の機能です）"); }

async function ensureSeedUsers(){
  if(!sbClient) return; // 未接続（config.js無し）：⏸未接続画面側で案内済みのためここでは何もしない
  try{
    const { data } = await sbClient.auth.getSession();
    const s = data && data.session;
    if(!s) return;
    const prof = await rpc("get_my_profile");
    if(prof.err) return;
    const p = prof.data || {};
    auth.session = {
      userId: s.user.id,
      role: p.role || (s.user.user_metadata||{}).role || null,
      refId: p.refId || null,
      status: p.status || null,
    };
    if(auth.session.role) await refreshAll(auth.session.role);
  }catch(e){ /* 復元に失敗してもログイン画面から再ログインできるよう握りつぶす */ }
}
