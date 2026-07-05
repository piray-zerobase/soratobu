-- =========================================================
-- そらとぶ医局 — Supabase(Postgres) スキーマ（08_設計書 ②データ構造）
-- 本番移行時に Supabase の SQL Editor で実行する。
-- 認証は Supabase Auth（email+password）を使用し、auth.users と紐づける。
-- =========================================================

-- 医師
create table doctors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null unique,
  name text not null,
  license_no text not null,            -- 医籍登録番号
  hokeni_no text,                      -- 保険医登録番号（任意）
  specialties text[] not null default '{}',
  capabilities text[] not null default '{}',
  home_base text not null default 'ITM',
  status text not null default '審査中' check (status in ('審査中','承認','却下')),
  completed_count int not null default 0,
  invited_by uuid,                     -- 招待制（09_事業戦略）
  created_at timestamptz default now()
);

-- 医師の資格書類（種別ごとに確認状態）
create table credentials (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references doctors not null,
  type text not null,                  -- 医師免許/本人確認/保険医登録/…
  file_path text,                      -- Supabase Storage（非公開バケット）
  number text,
  status text not null default '確認中' check (status in ('未提出','確認中','承認','却下','期限切れ')),
  verified_by text, verified_at timestamptz
);

-- 病院
create table hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pref text not null,
  address text not null,
  phone text,
  lat double precision, lng double precision,
  island text,                         -- 離島名（該当時）
  airport text,                        -- 最寄り空港コード（便データがある場合）
  status text not null default '審査中' check (status in ('審査中','承認','却下')),
  verified_note text,
  facilities text,
  invited_by uuid,
  created_at timestamptz default now()
);

-- 病院ユーザー（組織＋複数事務ユーザー）
create table hospital_users (
  user_id uuid references auth.users primary key,
  hospital_id uuid references hospitals not null
);

-- 募集
create table postings (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references hospitals not null,
  status text not null default 'open' check (status in ('draft','open','confirmed','completed','cancelled','expired')),
  urgent boolean not null default false,
  date date not null,
  time_start time not null, time_end time not null, overnight boolean not null default false,
  type text not null, department text,
  required_credentials text[] not null default '{医師免許}',
  pay int not null,
  transport text not null default '全額 病院負担',
  lodging text, ground text, note text,
  published_at timestamptz default now()
);

-- 応募（手上げ）
create table applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid references postings not null,
  doctor_id uuid references doctors not null,
  status text not null default 'applied' check (status in ('applied','approved','declined','withdrawn')),
  itinerary jsonb,                     -- {outbound[], return[], airportArriveBy, homeArriveAt, booking}
  applied_at timestamptz default now(), decided_at timestamptz,
  unique (posting_id, doctor_id)
);

-- 確定勤務（直接雇用インスタンス・条件スナップショット）
create table assignments (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid references postings not null unique,   -- 1募集=1医師
  doctor_id uuid references doctors not null,
  hospital_id uuid references hospitals not null,
  status text not null default 'confirmed' check (status in ('confirmed','completed','cancelled')),
  employment_type text not null default '日々雇用（病院と医師の直接契約）',
  terms_snapshot jsonb not null,
  itinerary jsonb,
  created_at timestamptz default now(), completed_at timestamptz
);

-- メッセージ（応募単位のチャット。運営は書き込み不可＝RLSで強制）
create table messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications not null,
  sender_role text not null check (sender_role in ('doctor','hospital')),
  sender_id uuid not null,
  text text not null,
  created_at timestamptz default now()
);

-- 監査ログ（追記専用。運営が個別マッチングに介在していないことの証明）
create table audit_log (
  id bigint generated always as identity primary key,
  actor text not null,                 -- doctor:x / hospital:y / admin / system
  action text not null,
  detail text,
  created_at timestamptz default now()
);
revoke update, delete on audit_log from anon, authenticated;  -- 追記専用

-- =========================================================
-- RLS（行レベルセキュリティ）方針 — Legal by Design をDB層で強制
--  ・医師：自分のdoctor行・自分のapplications・open postingsのみ読める
--  ・病院：自院のhospital行・自院postings・自院への応募のみ読める
--  ・messages：当該応募の医師本人／病院ユーザーのみ読み書き（adminは読み取りのみ不可付与も選択可）
--  ・状態遷移はすべて RPC（security definer 関数）経由で行い、関数内で audit_log に必ず記録する
--    → apply / approve / decline / withdraw / complete / verify_doctor / verify_hospital
-- 実装時は各テーブル alter table ... enable row level security; の上で
-- ポリシーを定義する（本番移行フェーズで具体化）。
-- =========================================================
