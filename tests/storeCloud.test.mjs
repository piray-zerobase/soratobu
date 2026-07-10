/* =========================================================
   storeCloud.test.mjs — js/store-cloud.js（クラウド切替キャッシュ層）のユニットテスト。
   tests/helpers/mockSupabase.mjs の偽クライアントでネットワーク無しに検証する。
   実行方法: node --test
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockSupabase } from "./helpers/mockSupabase.mjs";
import { loadStoreCloud } from "./helpers/loadStoreCloud.mjs";

const CACHE_KEYS = ["postings", "hospitals", "doctors", "applications", "assignments", "messages", "audit"];

function doctorRoleTables(){
  return {
    postings: [{
      id: "po_1", hospital_id: "hp_1", status: "open", urgent: false,
      date: "2026-07-12", time_start: "09:00", time_end: "12:00", overnight: false,
      type: "ワクチン", department: "—", required_credentials: ["医師免許"], pay: 60000,
      transport: "全額 病院負担", lodging: "前泊", ground: "送迎あり", note: "", published_at: "2026-07-01T00:00:00Z",
      hospitals: { name: "徳之島徳洲会病院", pref: "鹿児島県", island: "徳之島", lat: 1, lng: 2, airport: "KOJ", status: "承認" },
    }],
    doctors: [{
      id: "dr_1", user_id: "u_1", name: "山田 太郎", license_no: "123456", hokeni_no: "",
      specialties: ["総合診療"], capabilities: ["当直"], home_base: "ITM", status: "承認", completed_count: 12,
      credentials: [{ type: "医師免許", status: "承認" }],
    }],
    applications: [{
      id: "ap_1", posting_id: "po_2", doctor_id: "dr_1", status: "applied",
      itinerary: { summary: "往路A/復路B" }, applied_at: "2026-07-05T00:00:00Z", decided_at: null,
      postings: {
        id: "po_2", hospital_id: "hp_2", status: "open", urgent: false,
        date: "2026-07-18", time_start: "18:00", time_end: "09:00", overnight: true,
        type: "当直", department: "内科", required_credentials: ["医師免許"], pay: 120000,
        transport: "", lodging: "", ground: "", note: "", published_at: "",
        hospitals: { name: "屋久島徳洲会病院", pref: "鹿児島県", island: "屋久島", lat: 3, lng: 4, airport: "KOJ", status: "承認" },
      },
    }],
    assignments: [{
      id: "as_1", posting_id: "po_3", doctor_id: "dr_1", hospital_id: "hp_3", status: "confirmed",
      employment_type: "日々雇用", terms_snapshot: { pay: 85000 }, itinerary: {},
      created_at: "2026-07-06T00:00:00Z", completed_at: null, cancelled_by: null, cancel_reason: null,
      postings: {
        id: "po_3", hospital_id: "hp_3", status: "confirmed", urgent: false,
        date: "2026-07-19", time_start: "09:00", time_end: "15:00", overnight: false,
        type: "健診応援", department: "健診", required_credentials: [], pay: 85000,
        transport: "", lodging: "", ground: "", note: "", published_at: "",
      },
      doctors: {
        id: "dr_1", name: "山田 太郎", license_no: "123456", hokeni_no: "",
        specialties: ["総合診療"], capabilities: ["当直"], home_base: "ITM", status: "承認", completed_count: 12,
      },
      hospitals: {
        id: "hp_3", name: "種子島医療センター", pref: "鹿児島県", address: "住所", phone: "",
        lat: 5, lng: 6, island: "種子島", airport: "KOJ", status: "承認",
        verified_note: "", facilities: "", invite_code: "ABCD2345",
      },
    }],
  };
}

test("CACHEのキー構成はstore.jsのDBと同じ7項目（読み込み直後・refreshAll後とも）", async () => {
  const { client } = createMockSupabase({ tables: doctorRoleTables() });
  const ss = loadStoreCloud(client);
  assert.deepEqual(Object.keys(ss.CACHE).sort(), [...CACHE_KEYS].sort());
  ss.auth.session = { userId: "u_1", role: "doctor", refId: "dr_1" };
  const r = await ss.refreshAll("doctor");
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(ss.CACHE).sort(), [...CACHE_KEYS].sort());
});

test("refreshAll('doctor')：open postings・自分の医師行・自分の応募/確定を変換してCACHEに反映", async () => {
  const { client } = createMockSupabase({ tables: doctorRoleTables() });
  const ss = loadStoreCloud(client);
  ss.auth.session = { userId: "u_1", role: "doctor", refId: "dr_1" };
  const r = await ss.refreshAll("doctor");
  assert.equal(r.ok, true);

  // postings: open一覧(po_1) + 自分の応募先(po_2) + 自分の確定先(po_3)
  assert.equal(ss.CACHE.postings.length, 3);
  const po1 = ss.CACHE.postings.find(p => p.id === "po_1");
  assert.equal(po1.hospitalId, "hp_1");   // snake_case→camelCase変換の確認
  assert.equal(po1.timeStart, "09:00");

  // hospitals: 埋め込みから組み立てたhp_1/hp_2 + 確定のフルhp_3
  assert.equal(ss.CACHE.hospitals.length, 3);
  const hp3 = ss.CACHE.hospitals.find(h => h.id === "hp_3");
  assert.equal(hp3.name, "種子島医療センター");
  assert.equal(hp3.inviteCode, "ABCD2345");

  // doctors: fetchMyDoctorのcredentialsが保持される
  assert.equal(ss.CACHE.doctors.length, 1);
  assert.equal(ss.CACHE.doctors[0].credentials.length, 1);

  assert.equal(ss.CACHE.applications.length, 1);
  assert.equal(ss.CACHE.applications[0].postingId, "po_2");
  assert.equal(ss.CACHE.assignments.length, 1);
  assert.equal(ss.CACHE.assignments[0].hospitalId, "hp_3");
});

test("refreshAll('hospital')：自院・自院への応募・確定をCACHEに反映", async () => {
  const { client } = createMockSupabase({
    tables: {
      hospitals: [{
        id: "hp_1", name: "徳之島徳洲会病院", pref: "鹿児島県", address: "住所", phone: "0997-xx-xxxx",
        lat: 1, lng: 2, island: "徳之島", airport: "KOJ", status: "承認",
        verified_note: "マスタ一致", facilities: "", invite_code: "TOKU2345",
      }],
      applications: [{
        id: "ap_9", posting_id: "po_1", doctor_id: "dr_9", status: "applied",
        itinerary: {}, applied_at: "2026-07-01T00:00:00Z", decided_at: null,
        postings: { id: "po_1", hospital_id: "hp_1", status: "open", date: "2026-07-12", time_start: "09:00", time_end: "12:00", overnight: false, type: "ワクチン" },
        doctors: { id: "dr_9", name: "他院の医師", license_no: "654321", status: "承認" },
      }],
      assignments: [],
    },
  });
  const ss = loadStoreCloud(client);
  ss.auth.session = { userId: "u_2", role: "hospital", refId: "hp_1" };
  const r = await ss.refreshAll("hospital");
  assert.equal(r.ok, true);
  assert.equal(ss.CACHE.hospitals.length, 1);
  assert.equal(ss.CACHE.hospitals[0].inviteCode, "TOKU2345");
  assert.equal(ss.CACHE.applications.length, 1);
  assert.equal(ss.CACHE.doctors.length, 1);
  assert.equal(ss.CACHE.doctors[0].name, "他院の医師");
});

test("refreshAll('admin')：審査待ちキュー・credentials・監査ログをCACHEに反映", async () => {
  const audit = [
    { id: 1, actor: "admin", action: "doctor.verify", detail: "承認", created_at: "2026-07-10T00:00:00Z" },
  ];
  const { client } = createMockSupabase({
    tables: {
      doctors: [{ id: "dr_5", name: "審査中医師", status: "審査中" }],
      hospitals: [{ id: "hp_5", name: "審査中病院", status: "審査中" }],
      credentials: [{ id: "cr_1", doctor_id: "dr_5", type: "医師免許", status: "確認中", doctors: { name: "審査中医師" } }],
      audit_log: audit,
    },
  });
  const ss = loadStoreCloud(client);
  const r = await ss.refreshAll("admin");
  assert.equal(r.ok, true);
  assert.equal(ss.CACHE.doctors.length, 1);
  assert.equal(ss.CACHE.doctors[0].credentials.length, 1);
  assert.equal(ss.CACHE.doctors[0].credentials[0].type, "医師免許");
  assert.equal(ss.CACHE.hospitals[0].status, "審査中");
  assert.equal(ss.CACHE.audit.length, 1);
  assert.equal(ss.CACHE.audit[0].action, "doctor.verify");
});

test("refreshAll：いずれかのfetchが失敗したら{err}を返しCACHEは直前の状態のまま", async () => {
  const errors = {};
  const { client } = createMockSupabase({ tables: doctorRoleTables(), errors });
  const ss = loadStoreCloud(client);
  ss.auth.session = { userId: "u_1", role: "doctor", refId: "dr_1" };
  const ok1 = await ss.refreshAll("doctor");
  assert.equal(ok1.ok, true);
  const postingsBefore = ss.CACHE.postings.length;

  errors.postings = "接続エラー";
  const r2 = await ss.refreshAll("doctor");
  assert.equal(r2.err, "接続エラー");
  assert.equal(ss.CACHE.postings.length, postingsBefore);   // 失敗前の状態のまま
});

test("refreshMessages：application_id単位で最新化し、他の応募のメッセージは保持する", async () => {
  const { client } = createMockSupabase({
    tables: {
      messages: [
        { id: "ms_1", application_id: "ap_1", sender_role: "doctor", sender_id: "dr_1", text: "よろしくお願いします", created_at: "2026-07-01T00:00:00Z" },
        { id: "ms_2", application_id: "ap_2", sender_role: "hospital", sender_id: "hp_1", text: "承知しました", created_at: "2026-07-02T00:00:00Z" },
      ],
    },
  });
  const ss = loadStoreCloud(client);
  const r1 = await ss.refreshMessages("ap_1");
  assert.equal(r1.ok, true);
  assert.equal(ss.CACHE.messages.length, 1);
  assert.equal(ss.CACHE.messages[0].applicationId, "ap_1");

  const r2 = await ss.refreshMessages("ap_2");
  assert.equal(r2.ok, true);
  assert.equal(ss.CACHE.messages.length, 2);
  assert.ok(ss.CACHE.messages.some(m => m.applicationId === "ap_1"));
  assert.ok(ss.CACHE.messages.some(m => m.applicationId === "ap_2"));
});
