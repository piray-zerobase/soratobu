/* =========================================================
   demoMode.test.mjs — DEMO_MODEフラグ（デモデータの分離）の単体テスト
   実行方法: node --test
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./helpers/loadStore.mjs";

test("DEMO_MODE未指定（既定）はデモ医師・デモ募集を含む（従来通り）", () => {
  const store = loadStore();
  const db = store.getDB();
  assert.equal(db.doctors.some(d => d.id === "dr_1"), true);
  assert.equal(db.postings.length, 5);
  assert.equal(db.hospitals.length, 3);
});

test("SORATOBU_CONFIG.DEMO_MODE=trueは従来通りデモデータを含む", () => {
  const store = loadStore({ config: { DEMO_MODE: true } });
  const db = store.getDB();
  assert.equal(db.doctors.some(d => d.id === "dr_1"), true);
  assert.equal(db.postings.length, 5);
});

test("SORATOBU_CONFIG.DEMO_MODE=falseはデモ医師・デモ募集無しで起動する", () => {
  const store = loadStore({ config: { DEMO_MODE: false } });
  const db = store.getDB();
  assert.equal(db.doctors.length, 0);
  assert.equal(db.postings.length, 0);
  // 病院マスタ（シード3院）とadmin/病院ログインは残る（本タスクの対象外）
  assert.equal(db.hospitals.length, 3);
});

test("DEMO_MODE=falseではデモ医師ログイン(yamada)は作成されないが病院/adminログインは作成される", async () => {
  const store = loadStore({ config: { DEMO_MODE: false } });
  const { auth, ensureSeedUsers } = store;
  await ensureSeedUsers();
  const login = await auth.login("yamada@example.com", "demo1234");
  assert.ok(login.err, "デモ医師アカウントは存在しないためログイン失敗するはず");

  const hospLogin = await auth.login("tokunoshima@example.com", "demo1234");
  assert.equal(hospLogin.ok, true);

  const adminLogin = await auth.login("admin@example.com", "demo1234");
  assert.equal(adminLogin.ok, true);
});
