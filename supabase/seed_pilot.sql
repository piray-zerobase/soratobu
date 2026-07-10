-- =========================================================
-- そらとぶ医局 — クラウド切替(6/6) パイロット用シード
-- 目的：パイロット開始時に、島の実在病院3院を「実在確認済み」の状態で
--       直接投入し、動作確認用のサンプル募集を添えておく。
--
-- 適用手順（人間ゲート：実行は人間が行う。エージェントは実行しない）：
--   1. schema.sql → schema_v2_rpc.sql（RLS再帰修正が必要な環境では
--      schema_v2_1_fix_rls.sql も）を適用済みであること
--   2. SupabaseのSQL Editorで本ファイルをそのまま1回だけ実行する
--   3. 各病院の担当者アカウントは、本ファイルでは作成しない。
--      病院側の invite_code（下記INSERT実行後に hospitals テーブルで
--      確認できる）を使い、実際の担当者に招待コード経由で参加してもらう
--   4. 座標・空港コードは js/master.js の HOSP_MASTER と同じ値を転記した
--      ものなので、地図・空席照会（デモ）表示は既存アプリと整合する
--
-- 注意：
--   ・本ファイルは冪等（何度実行しても安全）ではない。
--     二重実行すると病院・募集が重複登録されるため、再実行が必要な場合は
--     事前に対象行を delete すること
--   ・サンプル募集2件は note に「動作確認用サンプル」と明記している。
--     一般公開前に不要であれば削除すること（本番の実募集ではない）
-- =========================================================

with h as (
  insert into hospitals (name, pref, address, phone, lat, lng, island, airport, status, verified_note, facilities, invite_code)
  values
    ('徳之島徳洲会病院',   '鹿児島県', '鹿児島県大島郡徳之島町', null, 27.730, 128.980, '徳之島', 'TKN', '承認', '病院マスタ一致（パイロット向け直接投入）', null, gen_invite_code()),
    ('屋久島徳洲会病院',   '鹿児島県', '鹿児島県熊毛郡屋久島町', null, 30.385, 130.660, '屋久島', 'KUM', '承認', '病院マスタ一致（パイロット向け直接投入）', null, gen_invite_code()),
    ('種子島医療センター', '鹿児島県', '鹿児島県西之表市',       null, 30.732, 131.000, '種子島', 'TNE', '承認', '病院マスタ一致（パイロット向け直接投入）', null, gen_invite_code())
  returning id, name
)
insert into postings (hospital_id, status, urgent, date, time_start, time_end, overnight, type, department, required_credentials, pay, transport, lodging, ground, note)
select h.id, 'open', false, current_date + 14, '09:00'::time, '17:00'::time, false, '外来応援', '内科',
       '{医師免許}'::text[], 60000, '全額 病院負担', '前泊（宿は病院手配）', 'レンタカー（実費病院負担）',
       '動作確認用サンプル（パイロット向け・実際の募集ではありません）'
from h where h.name = '徳之島徳洲会病院'
union all
select h.id, 'open', false, current_date + 21, '17:00'::time, '09:00'::time, true, '当直', null::text,
       '{医師免許}'::text[], 90000, '全額 病院負担', '当直室あり', null::text,
       '動作確認用サンプル（パイロット向け・実際の募集ではありません）'
from h where h.name = '屋久島徳洲会病院';
