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
};
