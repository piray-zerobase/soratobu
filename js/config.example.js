/* =========================================================
   config.example.js — Supabase接続設定の雛形
   ・このファイルをコピーして js/config.js を作成し、値を埋める
     （js/config.js は .gitignore 済み＝コミットしない）
   ・接続情報（URL・anon key）はSupabaseプロジェクト作成後に人間が発行する（⏸人間待ち）
   ・anon keyはブラウザに公開される前提の鍵。実際のアクセス制御は
     Supabase側のRLS（Row Level Security）ポリシーで行う（supabase/schema.sql参照）
   ========================================================= */
const SORATOBU_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
  // false にするとjs/store.jsのデモ医師(dr_1)・デモ募集(po_1〜5)・
  // デモ医師ログイン(yamada@example.com)を投入しない（本番切替の下準備）。
  // 未指定（既定）は true 扱いで従来通りデモデータあり。
  // シード病院3院（病院マスタ）と病院/admin運営アカウントはこのフラグの対象外（常に投入）。
  DEMO_MODE: true,
};
