-- =========================================================
-- そらとぶ医局 — schema_v2_rpc.sql
-- schema.sql（テーブル定義）を実行した「あと」にSQL Editorで実行する。
-- 内容：①不足カラム/テーブルの追加 ②RLS（行レベルセキュリティ）
--       ③状態遷移RPC（security definer）＝権限チェック・ダブルブッキング防止・
--         AuditLog記録をDB層で強制（クライアント改造では破れない）
-- 設計原則：
--   ・実行者は常に auth.uid() から導出する（クライアントの自己申告IDは信用しない）
--   ・テーブルへの直接書き込みは全面禁止（RLSで読み取りのみ許可、書き込みはRPC経由）
--   ・運営(admin)はマッチング・チャットに介在できない（Legal by Design）
-- =========================================================

-- ---------------------------------------------------------
-- ① 不足分の追加（v0.2で増えた機能ぶん）
-- ---------------------------------------------------------

-- 招待コード（病院の複数ユーザー用）
alter table hospitals add column if not exists invite_code text unique;

-- 確定後キャンセル
alter table assignments add column if not exists cancelled_by text
  check (cancelled_by in ('doctor','hospital'));
alter table assignments add column if not exists cancel_reason text;

-- applications に cancelled を追加（確定後キャンセル時に使用）
alter table applications drop constraint if exists applications_status_check;
alter table applications add constraint applications_status_check
  check (status in ('applied','approved','declined','withdrawn','cancelled'));

-- キャンセル→再公開→再確定を許すため、posting_id の完全uniqueをやめ、
-- 「confirmed は同時に1件だけ」に置き換える（ダブルブッキング防止の最後の砦）
alter table assignments drop constraint if exists assignments_posting_id_key;
create unique index if not exists uniq_confirmed_assignment_per_posting
  on assignments (posting_id) where (status = 'confirmed');

-- 同様に「同一医師の confirmed が同時刻帯に2件」をRPCで防ぐが、
-- applications の重複応募はunique制約が既にある（posting_id, doctor_id）

-- 通知の既読カーソル
create table if not exists notif_cursor (
  user_id uuid primary key references auth.users,
  last_seen_at timestamptz not null default now()
);

-- 運営アカウント（このテーブルにいるユーザーだけが実在確認を実行できる）
create table if not exists admins (
  user_id uuid primary key references auth.users,
  note text
);

-- ---------------------------------------------------------
-- ② ヘルパ関数（実行者の同定・時間帯の重複判定・監査）
-- ---------------------------------------------------------

create or replace function current_doctor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from doctors where user_id = auth.uid()
$$;

create or replace function current_hospital_id() returns uuid
language sql stable security definer set search_path = public as $$
  select hospital_id from hospital_users where user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function posting_start_ts(p postings) returns timestamp
language sql immutable as $$
  select (p.date::timestamp + p.time_start)
$$;

create or replace function posting_end_ts(p postings) returns timestamp
language sql immutable as $$
  select (p.date::timestamp + p.time_end)
       + case when p.overnight then interval '1 day' else interval '0 day' end
$$;

-- 同一医師の「応募中 or 確定済み」と時間帯が重複するか（ダブルブッキング判定）
create or replace function has_schedule_conflict(
  p_doctor uuid, p_target postings, p_exclude_app uuid default null
) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from postings q
    where q.id <> p_target.id
      and (
        q.id in (select posting_id from applications
                 where doctor_id = p_doctor and status = 'applied'
                   and (p_exclude_app is null or id <> p_exclude_app))
        or
        q.id in (select posting_id from assignments
                 where doctor_id = p_doctor and status = 'confirmed')
      )
      and posting_start_ts(q) < posting_end_ts(p_target)
      and posting_start_ts(p_target) < posting_end_ts(q)
  )
$$;

-- 監査ログ（追記専用。すべてのRPCが必ずこれを呼ぶ）
create or replace function log_audit(p_actor text, p_action text, p_detail text)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, detail) values (p_actor, p_action, p_detail)
$$;

-- 招待コード生成（紛らわしい文字を除いた8桁）
create or replace function gen_invite_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
         (floor(random()*32))::int + 1, 1), '')
  from generate_series(1, 8)
$$;

-- ---------------------------------------------------------
-- ③ RPC（security definer）＝唯一の書き込み経路
-- ---------------------------------------------------------

-- 医師プロフィール登録（実行者= auth.uid()。審査中で作成）
create or replace function register_doctor(
  p_name text, p_license_no text, p_hokeni_no text,
  p_specialties text[], p_capabilities text[], p_home_base text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  if exists (select 1 from doctors where user_id = auth.uid()) then
    raise exception 'すでに医師プロフィールが登録されています';
  end if;
  if p_license_no !~ '^\d{5,7}$' then
    raise exception '医籍登録番号は5〜7桁の数字で入力してください';
  end if;
  insert into doctors (user_id, name, license_no, hokeni_no, specialties, capabilities, home_base, status)
  values (auth.uid(), p_name, p_license_no, nullif(p_hokeni_no,''), p_specialties, p_capabilities,
          coalesce(nullif(p_home_base,''),'ITM'), '審査中')
  returning id into v_id;
  insert into credentials (doctor_id, type, status) values
    (v_id, '医師免許', '確認中'), (v_id, '本人確認', '確認中');
  if nullif(p_hokeni_no,'') is not null then
    insert into credentials (doctor_id, type, number, status)
    values (v_id, '保険医登録', p_hokeni_no, '確認中');
  end if;
  perform log_audit('doctor:'||v_id, 'doctor.register', p_name||'（医籍'||p_license_no||'）→ 実在確認キューへ');
  return v_id;
end $$;

-- 病院登録（実行者= auth.uid()。DB側では常に審査中で作成し、運営が実在確認して承認する）
create or replace function register_hospital(
  p_name text, p_pref text, p_address text, p_phone text, p_facilities text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  if exists (select 1 from hospital_users where user_id = auth.uid()) then
    raise exception 'すでに病院に所属しています';
  end if;
  if coalesce(p_name,'')='' or coalesce(p_pref,'')='' or coalesce(p_address,'')='' then
    raise exception '病院名・都道府県・住所は必須です';
  end if;
  insert into hospitals (name, pref, address, phone, facilities, status, verified_note, invite_code)
  values (p_name, p_pref, p_address, nullif(p_phone,''), nullif(p_facilities,''),
          '審査中', '運営が医療情報ネット等で実在確認します', gen_invite_code())
  returning id into v_id;
  insert into hospital_users (user_id, hospital_id) values (auth.uid(), v_id);
  perform log_audit('hospital:'||v_id, 'hospital.register', p_name||'（'||p_pref||'）→ 実在確認キューへ');
  return v_id;
end $$;

-- 招待コードで病院に参加
create or replace function join_hospital_by_invite_code(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_hid uuid; v_name text;
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  if exists (select 1 from hospital_users where user_id = auth.uid()) then
    raise exception 'すでにいずれかの病院に所属しています';
  end if;
  select id, name into v_hid, v_name from hospitals
   where invite_code = upper(trim(p_code));
  if v_hid is null then raise exception '招待コードが正しくありません'; end if;
  insert into hospital_users (user_id, hospital_id) values (auth.uid(), v_hid);
  perform log_audit('hospital:'||v_hid, 'hospital.inviteJoin', '招待コードで事務ユーザーが参加');
  return v_hid;
end $$;

-- 招待コード再発行
create or replace function regenerate_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_hid uuid; v_code text;
begin
  v_hid := current_hospital_id();
  if v_hid is null then raise exception '権限がありません'; end if;
  v_code := gen_invite_code();
  update hospitals set invite_code = v_code where id = v_hid;
  perform log_audit('hospital:'||v_hid, 'hospital.inviteRegenerate', '招待コードを再発行');
  return v_code;
end $$;

-- 募集の公開（病院が承認済みであることをDB側でも確認）
create or replace function publish_posting(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_hid uuid; v_id uuid;
begin
  v_hid := current_hospital_id();
  if v_hid is null then raise exception '権限がありません'; end if;
  if (select status from hospitals where id = v_hid) <> '承認' then
    raise exception '病院の実在確認が完了していません';
  end if;
  insert into postings (hospital_id, status, urgent, date, time_start, time_end, overnight,
                        type, department, required_credentials, pay, transport, lodging, ground, note)
  values (v_hid, 'open',
          coalesce((p->>'urgent')::boolean, false),
          (p->>'date')::date, (p->>'timeStart')::time, (p->>'timeEnd')::time,
          coalesce((p->>'overnight')::boolean, false),
          p->>'type', p->>'department',
          coalesce((select array_agg(x) from jsonb_array_elements_text(p->'requiredCredentials') x), array['医師免許']),
          (p->>'pay')::int,
          coalesce(p->>'transport','全額 病院負担'), p->>'lodging', p->>'ground', p->>'note')
  returning id into v_id;
  perform log_audit('hospital:'||v_hid, 'posting.publish', v_id||' '||(p->>'date')||' '||(p->>'type'));
  return v_id;
end $$;

-- 手上げ（資格ゲート＋ダブルブッキング防止をDB側で強制）
create or replace function apply_posting(p_posting_id uuid, p_itinerary jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_did uuid; v_po postings; v_id uuid; v_missing int;
begin
  v_did := current_doctor_id();
  if v_did is null then raise exception '医師プロフィールが未登録です'; end if;
  if (select status from doctors where id = v_did) <> '承認' then
    raise exception '実在確認の審査中のため、まだ手を挙げられません';
  end if;
  -- 医師単位で直列化（同時2応募のレースを防ぐ）
  perform pg_advisory_xact_lock(hashtext(v_did::text));
  select * into v_po from postings where id = p_posting_id for update;
  if v_po.id is null or v_po.status <> 'open' then
    raise exception 'この募集は受付中ではありません';
  end if;
  -- 資格ゲート
  select count(*) into v_missing
  from unnest(v_po.required_credentials) rc
  where not exists (select 1 from credentials c
                    where c.doctor_id = v_did and c.type = rc and c.status = '承認');
  if v_missing > 0 then raise exception '必要資格が未承認のため応募できません'; end if;
  -- ダブルブッキング防止（応募時）
  if has_schedule_conflict(v_did, v_po, null) then
    raise exception '同じ日時に他の予定があるため応募できません';
  end if;
  insert into applications (posting_id, doctor_id, status, itinerary)
  values (p_posting_id, v_did, 'applied', p_itinerary)
  returning id into v_id;
  perform log_audit('doctor:'||v_did, 'application.apply', v_id||' → '||p_posting_id);
  return v_id;
end $$;

-- 承認（自院チェック＋open再確認＋重複再検証＋他応募の自動見送り＋条件スナップショット）
create or replace function approve_application(p_application_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_hid uuid; v_ap applications; v_po postings; v_asg uuid;
begin
  v_hid := current_hospital_id();
  if v_hid is null then raise exception '権限がありません'; end if;
  select * into v_ap from applications where id = p_application_id for update;
  if v_ap.id is null or v_ap.status <> 'applied' then raise exception '承認できない状態です'; end if;
  select * into v_po from postings where id = v_ap.posting_id for update;
  if v_po.hospital_id <> v_hid then raise exception '自院の募集ではありません'; end if;
  if v_po.status <> 'open' then raise exception 'この募集はすでに確定・終了しています'; end if;
  -- 医師単位で直列化＋承認時の重複再検証
  perform pg_advisory_xact_lock(hashtext(v_ap.doctor_id::text));
  if has_schedule_conflict(v_ap.doctor_id, v_po, v_ap.id) then
    raise exception '医師の同日時の予定と重複するため承認できません';
  end if;
  update applications set status='approved', decided_at=now() where id = v_ap.id;
  update applications set status='declined', decided_at=now()
   where posting_id = v_po.id and id <> v_ap.id and status = 'applied';
  update postings set status='confirmed' where id = v_po.id;
  insert into assignments (posting_id, doctor_id, hospital_id, status, terms_snapshot, itinerary)
  values (v_po.id, v_ap.doctor_id, v_hid, 'confirmed',
          jsonb_build_object('pay', v_po.pay, 'transport', v_po.transport, 'date', v_po.date,
                             'time', v_po.time_start||'〜'||case when v_po.overnight then '翌' else '' end||v_po.time_end),
          v_ap.itinerary)
  returning id into v_asg;
  perform log_audit('hospital:'||v_hid, 'application.approve',
                    v_ap.id||' → Assignment '||v_asg||'（条件スナップショット固定）');
  return v_asg;
end $$;

-- お断り（自院チェック）
create or replace function decline_application(p_application_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_hid uuid; v_ap applications;
begin
  v_hid := current_hospital_id();
  if v_hid is null then raise exception '権限がありません'; end if;
  select * into v_ap from applications where id = p_application_id for update;
  if v_ap.id is null or v_ap.status <> 'applied' then raise exception '操作できない状態です'; end if;
  if (select hospital_id from postings where id = v_ap.posting_id) <> v_hid then
    raise exception '自院の募集ではありません';
  end if;
  update applications set status='declined', decided_at=now() where id = v_ap.id;
  perform log_audit('hospital:'||v_hid, 'application.decline', v_ap.id::text);
end $$;

-- 取り下げ（本人のみ）
create or replace function withdraw_application(p_application_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_did uuid; v_ap applications;
begin
  v_did := current_doctor_id();
  select * into v_ap from applications where id = p_application_id for update;
  if v_ap.id is null or v_ap.doctor_id is distinct from v_did or v_ap.status <> 'applied' then
    raise exception '取り下げできない状態です';
  end if;
  update applications set status='withdrawn', decided_at=now() where id = v_ap.id;
  perform log_audit('doctor:'||v_did, 'application.withdraw',
                    v_ap.id||'（理由：'||coalesce(nullif(p_reason,''),'未記入')||'）');
end $$;

-- 確定後キャンセル（当事者のみ・理由必須・募集を再公開）
create or replace function cancel_assignment(p_assignment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_did uuid; v_hid uuid; v_asg assignments; v_actor text; v_by text;
begin
  if coalesce(trim(p_reason),'') = '' then raise exception 'キャンセル理由は必須です'; end if;
  select * into v_asg from assignments where id = p_assignment_id for update;
  if v_asg.id is null or v_asg.status <> 'confirmed' then raise exception 'キャンセルできない状態です'; end if;
  v_did := current_doctor_id(); v_hid := current_hospital_id();
  if v_did is not null and v_did = v_asg.doctor_id then
    v_by := 'doctor'; v_actor := 'doctor:'||v_did;
  elsif v_hid is not null and v_hid = v_asg.hospital_id then
    v_by := 'hospital'; v_actor := 'hospital:'||v_hid;
  else
    raise exception 'この確定の当事者ではありません';
  end if;
  update assignments set status='cancelled', cancelled_by=v_by, cancel_reason=trim(p_reason)
   where id = v_asg.id;
  update applications set status='cancelled'
   where posting_id = v_asg.posting_id and doctor_id = v_asg.doctor_id and status = 'approved';
  update postings set status='open' where id = v_asg.posting_id;  -- 再公開
  perform log_audit(v_actor, 'assignment.cancel', v_asg.id||'（理由：'||trim(p_reason)||'）→ 募集を再公開');
end $$;

-- 勤務完了（自院のみ）
create or replace function complete_assignment(p_assignment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_hid uuid; v_asg assignments;
begin
  v_hid := current_hospital_id();
  select * into v_asg from assignments where id = p_assignment_id for update;
  if v_asg.id is null or v_asg.status <> 'confirmed' or v_asg.hospital_id is distinct from v_hid then
    raise exception '完了にできない状態です';
  end if;
  update assignments set status='completed', completed_at=now() where id = v_asg.id;
  update postings set status='completed' where id = v_asg.posting_id;
  update doctors set completed_count = completed_count + 1 where id = v_asg.doctor_id;
  perform log_audit('hospital:'||v_hid, 'assignment.complete', v_asg.id::text);
end $$;

-- 便の予約自己申告（本人のみ）
create or replace function self_report_booking(p_assignment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_did uuid; v_asg assignments;
begin
  v_did := current_doctor_id();
  select * into v_asg from assignments where id = p_assignment_id for update;
  if v_asg.id is null or v_asg.doctor_id is distinct from v_did then raise exception '操作できません'; end if;
  update assignments set itinerary = coalesce(itinerary,'{}'::jsonb)
         || jsonb_build_object('booking','予約済（自己申告）') where id = v_asg.id;
  perform log_audit('doctor:'||v_did, 'itinerary.bookingSelfReport', v_asg.id::text);
end $$;

-- チャット送信（当事者のみ。運営はdoctors/hospital_usersのどちらにも居ないため構造的に送れない）
create or replace function send_message(p_application_id uuid, p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_did uuid; v_hid uuid; v_ap applications; v_po postings; v_role text; v_sender uuid; v_id uuid;
begin
  if coalesce(trim(p_text),'') = '' then raise exception '本文を入力してください'; end if;
  select * into v_ap from applications where id = p_application_id;
  if v_ap.id is null then raise exception '応募が見つかりません'; end if;
  select * into v_po from postings where id = v_ap.posting_id;
  v_did := current_doctor_id(); v_hid := current_hospital_id();
  if v_did is not null and v_did = v_ap.doctor_id then
    v_role := 'doctor'; v_sender := v_did;
  elsif v_hid is not null and v_hid = v_po.hospital_id then
    v_role := 'hospital'; v_sender := v_hid;
  else
    raise exception 'このやりとりの当事者ではありません';  -- Legal by Design：運営も送信不可
  end if;
  insert into messages (application_id, sender_role, sender_id, text)
  values (p_application_id, v_role, v_sender, trim(p_text))
  returning id into v_id;
  return v_id;
end $$;

-- 実在確認（admin限定）
create or replace function verify_doctor(p_doctor_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_dr doctors;
begin
  if not is_admin() then raise exception '運営権限が必要です'; end if;
  select * into v_dr from doctors where id = p_doctor_id for update;
  if v_dr.id is null or v_dr.status <> '審査中' then raise exception '審査中の医師ではありません'; end if;
  update doctors set status = case when p_approve then '承認' else '却下' end where id = p_doctor_id;
  update credentials set status = case when p_approve then '承認' else '却下' end,
         verified_by = auth.uid()::text, verified_at = now()
   where doctor_id = p_doctor_id and status = '確認中';
  perform log_audit('admin', 'doctor.verify',
    v_dr.name||'（医籍'||v_dr.license_no||'）→ '||case when p_approve then '承認' else '却下' end
    ||'（厚労省 医師等資格確認検索で照合）');
end $$;

create or replace function verify_hospital(p_hospital_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_h hospitals;
begin
  if not is_admin() then raise exception '運営権限が必要です'; end if;
  select * into v_h from hospitals where id = p_hospital_id for update;
  if v_h.id is null or v_h.status <> '審査中' then raise exception '審査中の病院ではありません'; end if;
  update hospitals set status = case when p_approve then '承認' else '却下' end,
         verified_note = case when p_approve then '運営が医療情報ネット等で実在確認済み' else '実在確認できず却下' end
   where id = p_hospital_id;
  perform log_audit('admin', 'hospital.verify',
    v_h.name||' → '||case when p_approve then '承認' else '却下' end);
end $$;

create or replace function verify_credential(p_credential_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_c credentials; v_name text;
begin
  if not is_admin() then raise exception '運営権限が必要です'; end if;
  select * into v_c from credentials where id = p_credential_id for update;
  if v_c.id is null or v_c.status <> '確認中' then raise exception '確認中の書類がありません'; end if;
  update credentials set status = case when p_approve then '承認' else '却下' end,
         verified_by = auth.uid()::text, verified_at = now()
   where id = p_credential_id;
  select name into v_name from doctors where id = v_c.doctor_id;
  perform log_audit('admin', 'credential.verify',
    coalesce(v_name,'')||' '||v_c.type||' → '||case when p_approve then '承認' else '却下' end);
end $$;

-- 通知の既読化
create or replace function mark_notifications_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '認証が必要です'; end if;
  insert into notif_cursor (user_id, last_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = now();
end $$;

-- 自分のプロフィール（ログイン直後にrole/refIdを引く用）
create or replace function get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if is_admin() then return jsonb_build_object('role','admin','refId',null); end if;
  select jsonb_build_object('role','doctor','refId',id,'status',status,'name',name)
    into v from doctors where user_id = auth.uid();
  if v is not null then return v; end if;
  select jsonb_build_object('role','hospital','refId',hu.hospital_id,'status',h.status,'name',h.name)
    into v from hospital_users hu join hospitals h on h.id = hu.hospital_id
   where hu.user_id = auth.uid();
  if v is not null then return v; end if;
  return jsonb_build_object('role',null,'refId',null);  -- 未登録（オンボーディングへ）
end $$;

-- ---------------------------------------------------------
-- ④ RLS（読み取りポリシー。書き込みポリシーは作らない＝RPCのみ）
-- ---------------------------------------------------------

alter table doctors        enable row level security;
alter table credentials    enable row level security;
alter table hospitals      enable row level security;
alter table hospital_users enable row level security;
alter table postings       enable row level security;
alter table applications   enable row level security;
alter table assignments    enable row level security;
alter table messages       enable row level security;
alter table audit_log      enable row level security;
alter table notif_cursor   enable row level security;

-- 医師：自分の行／運営：全件／病院：自院の募集に応募・確定した医師のみ
create policy doctors_select on doctors for select using (
  user_id = auth.uid()
  or is_admin()
  or exists (select 1 from applications a join postings p on p.id = a.posting_id
             where a.doctor_id = doctors.id and p.hospital_id = current_hospital_id())
);

-- 書類：本人と運営のみ
create policy credentials_select on credentials for select using (
  exists (select 1 from doctors d where d.id = credentials.doctor_id and d.user_id = auth.uid())
  or is_admin()
);

-- 病院：承認済みは全ログインユーザーに公開（募集閲覧用）／自院／運営
create policy hospitals_select on hospitals for select using (
  status = '承認' or id = current_hospital_id() or is_admin()
);

-- 病院ユーザー：自分の行と自院の仲間
create policy hospital_users_select on hospital_users for select using (
  user_id = auth.uid() or hospital_id = current_hospital_id()
);

-- 募集：open（承認済み病院のもの）は全医師に公開／自院分／運営
create policy postings_select on postings for select using (
  (status = 'open' and exists (select 1 from hospitals h where h.id = postings.hospital_id and h.status = '承認'))
  or hospital_id = current_hospital_id()
  or exists (select 1 from applications a where a.posting_id = postings.id and a.doctor_id = current_doctor_id())
  or exists (select 1 from assignments s where s.posting_id = postings.id and s.doctor_id = current_doctor_id())
  or is_admin()
);

-- 応募：本人／募集元の病院／運営（監査のための読み取りのみ）
create policy applications_select on applications for select using (
  doctor_id = current_doctor_id()
  or exists (select 1 from postings p where p.id = applications.posting_id and p.hospital_id = current_hospital_id())
  or is_admin()
);

-- 確定：当事者／運営
create policy assignments_select on assignments for select using (
  doctor_id = current_doctor_id() or hospital_id = current_hospital_id() or is_admin()
);

-- メッセージ：当事者のみ（★運営は読めない＝やりとりに一切介在しない）
create policy messages_select on messages for select using (
  exists (select 1 from applications a where a.id = messages.application_id
          and a.doctor_id = current_doctor_id())
  or exists (select 1 from applications a join postings p on p.id = a.posting_id
             where a.id = messages.application_id and p.hospital_id = current_hospital_id())
);

-- 監査ログ：運営のみ読める（書き込みはlog_audit経由のみ）
create policy audit_select on audit_log for select using (is_admin());

-- 通知カーソル：本人のみ
create policy notif_cursor_select on notif_cursor for select using (user_id = auth.uid());

-- ---------------------------------------------------------
-- ⑤ 運営アカウントの登録（プロジェクト作成後に1回だけ手で実行）
-- ---------------------------------------------------------
-- 1. Supabase Auth でメール（例 corporate@zerobase-medical.com）のユーザーを作成
-- 2. そのユーザーの UUID を Authentication 画面で確認して：
--    insert into admins (user_id, note) values ('ここにUUID', '平井（運営）');
