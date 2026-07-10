/* =========================================================
   storeSupabaseFetch.test.mjs — js/store-supabase.js の読み取り関数
   （fetchMyDoctor/fetchMyHospital/fetchApplicationsForMyPostings/
    fetchMyAssignments/fetchMessages/fetchAdminQueues）のユニットテスト。
   tests/helpers/mockSupabase.mjs の偽クライアントでネットワーク無しに検証する。
   実行方法: node --test
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockSupabase } from "./helpers/mockSupabase.mjs";
import { loadStoreSupabase } from "./helpers/loadStoreSupabase.mjs";

test("fetchMyDoctor: 自分のuser_idの医師行を返す", async () => {
  const { client } = createMockSupabase({
    tables: { doctors: [{ id: "dr_1", user_id: "u_1", name: "山田 太郎" }, { id: "dr_2", user_id: "u_2", name: "他人" }] },
  });
  const ss = loadStoreSupabase(client);
  ss.auth.session = { userId: "u_1", role: "doctor", refId: "dr_1" };
  const r = await ss.fetchMyDoctor();
  assert.equal(r.ok, true);
  assert.equal(r.data.id, "dr_1");
});

test("fetchMyDoctor: 未ログインならエラー", async () => {
  const { client } = createMockSupabase({ tables: { doctors: [] } });
  const ss = loadStoreSupabase(client);
  const r = await ss.fetchMyDoctor();
  assert.ok(r.err);
});

test("fetchMyHospital: session.refIdの病院行を返す", async () => {
  const { client } = createMockSupabase({
    tables: { hospitals: [{ id: "hp_1", name: "徳之島徳洲会病院" }, { id: "hp_2", name: "他院" }] },
  });
  const ss = loadStoreSupabase(client);
  ss.auth.session = { userId: "u_9", role: "hospital", refId: "hp_1" };
  const r = await ss.fetchMyHospital();
  assert.equal(r.ok, true);
  assert.equal(r.data.name, "徳之島徳洲会病院");
});

test("fetchApplicationsForMyPostings: 病院未登録ならエラー、登録済みなら一覧を返す", async () => {
  const { client } = createMockSupabase({
    tables: { applications: [{ id: "ap_1", posting_id: "po_1", doctor_id: "dr_1", status: "applied" }] },
  });
  const ss = loadStoreSupabase(client);
  const noHospital = await ss.fetchApplicationsForMyPostings();
  assert.ok(noHospital.err);

  ss.auth.session = { userId: "u_1", role: "hospital", refId: "hp_1" };
  const r = await ss.fetchApplicationsForMyPostings();
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].id, "ap_1");
});

test("fetchMyAssignments: 一覧を返す（RLSでの絞り込みはDB側の責務）", async () => {
  const { client } = createMockSupabase({
    tables: { assignments: [{ id: "as_1", posting_id: "po_1", doctor_id: "dr_1", hospital_id: "hp_1", status: "confirmed" }] },
  });
  const ss = loadStoreSupabase(client);
  const r = await ss.fetchMyAssignments();
  assert.equal(r.ok, true);
  assert.equal(r.data[0].id, "as_1");
});

test("fetchMessages: application_idで絞り込み、created_at昇順で返す", async () => {
  const { client } = createMockSupabase({
    tables: { messages: [
      { id: "ms_2", application_id: "ap_1", text: "後", created_at: "2026-07-02T00:00:00Z" },
      { id: "ms_1", application_id: "ap_1", text: "先", created_at: "2026-07-01T00:00:00Z" },
      { id: "ms_x", application_id: "ap_9", text: "別応募", created_at: "2026-07-01T00:00:00Z" },
    ] },
  });
  const ss = loadStoreSupabase(client);
  const r = await ss.fetchMessages("ap_1");
  assert.equal(r.ok, true);
  assert.equal(r.data.length, 2);
  assert.equal(r.data[0].id, "ms_1");
  assert.equal(r.data[1].id, "ms_2");
});

test("fetchAdminQueues: 審査中医師・病院、確認中credentials、audit_log最新50件をまとめて返す", async () => {
  const audit = Array.from({ length: 60 }, (_, i) => ({
    id: i + 1, actor: "system", action: "test", created_at: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  }));
  const { client } = createMockSupabase({
    tables: {
      doctors: [{ id: "dr_1", status: "審査中" }, { id: "dr_2", status: "承認" }],
      hospitals: [{ id: "hp_1", status: "審査中" }, { id: "hp_2", status: "承認" }],
      credentials: [{ id: "cr_1", doctor_id: "dr_1", status: "確認中" }, { id: "cr_2", doctor_id: "dr_2", status: "承認" }],
      audit_log: audit,
    },
  });
  const ss = loadStoreSupabase(client);
  const r = await ss.fetchAdminQueues();
  assert.equal(r.ok, true);
  assert.equal(r.data.doctors.length, 1);
  assert.equal(r.data.hospitals.length, 1);
  assert.equal(r.data.credentials.length, 1);
  assert.equal(r.data.auditLog.length, 50);
});

test("エラー時は{err}を返す（例：doctorsテーブルへのクエリが失敗）", async () => {
  const { client } = createMockSupabase({
    tables: { doctors: [{ id: "dr_1", user_id: "u_1" }] },
    errors: { doctors: "接続エラー" },
  });
  const ss = loadStoreSupabase(client);
  ss.auth.session = { userId: "u_1" };
  const r = await ss.fetchMyDoctor();
  assert.equal(r.err, "接続エラー");
});
