-- =========================================================
-- schema_v2_1_fix_rls.sql — RLS無限再帰の修正（2026-07-07）
-- 症状：infinite recursion detected in policy for relation "postings"
-- 原因：postings⇄applications 等のポリシーが互いのテーブルを直接参照していた
-- 修正：テーブル横断の判定を security definer 関数（RLSを介さない）に置き換える
-- 適用：SQL Editor でこのファイル全文を実行（既存データ・RPCへの影響なし）
-- =========================================================

-- ---- 横断判定用ヘルパ（security definer＝所有者権限で実行、RLSの外側）----

create or replace function my_application_posting_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select posting_id from applications where doctor_id = current_doctor_id()
$$;

create or replace function my_assignment_posting_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select posting_id from assignments where doctor_id = current_doctor_id()
$$;

create or replace function my_application_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from applications where doctor_id = current_doctor_id()
$$;

create or replace function my_hospital_application_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.id from applications a
  join postings p on p.id = a.posting_id
  where p.hospital_id = current_hospital_id()
$$;

create or replace function doctors_engaged_with_my_hospital() returns setof uuid
language sql stable security definer set search_path = public as $$
  select a.doctor_id from applications a
  join postings p on p.id = a.posting_id
  where p.hospital_id = current_hospital_id()
  union
  select s.doctor_id from assignments s
  where s.hospital_id = current_hospital_id()
$$;

-- ---- ポリシーの貼り替え（4つ）----

drop policy if exists doctors_select on doctors;
create policy doctors_select on doctors for select using (
  user_id = auth.uid()
  or is_admin()
  or id in (select doctors_engaged_with_my_hospital())
);

drop policy if exists postings_select on postings;
create policy postings_select on postings for select using (
  (status = 'open' and exists (select 1 from hospitals h
        where h.id = postings.hospital_id and h.status = '承認'))
  or hospital_id = current_hospital_id()
  or id in (select my_application_posting_ids())
  or id in (select my_assignment_posting_ids())
  or is_admin()
);

drop policy if exists applications_select on applications;
create policy applications_select on applications for select using (
  doctor_id = current_doctor_id()
  or id in (select my_hospital_application_ids())
  or is_admin()
);

drop policy if exists messages_select on messages;
create policy messages_select on messages for select using (
  application_id in (select my_application_ids())
  or application_id in (select my_hospital_application_ids())
  -- 運営(admin)は引き続き読めない（Legal by Design）
);
