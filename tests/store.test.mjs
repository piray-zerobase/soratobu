/* =========================================================
   store.test.mjs — ダブルブッキング防止・状態遷移の単体テスト
   実行方法: node --test
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./helpers/loadStore.mjs";

/* 承認済みの新規医師を1人作って返す（保険医登録が絡まないよう医師免許のみのケース） */
async function makeApprovedDoctor(store, name, licenseNo){
  const { api, auth } = store;
  await auth.signup(`${licenseNo}@example.com`, "demo1234", "doctor");
  const reg = api.registerDoctor(auth.session.userId, {
    name, specialties:["総合診療"], capabilities:["外来応援"], homeBase:"ITM", licenseNo, files:{},
  });
  assert.ok(reg.ok, reg.err);
  api.verifyDoctor(reg.id, true);
  return reg.id;
}

test("同一医師は同じ募集に二重に手を挙げられない", () => {
  const store = loadStore();
  const { api } = store;
  const doctorId = "dr_1"; // seed済み承認済み医師
  const r1 = api.apply(doctorId, "po_1", { summary: "テスト行程" });
  assert.ok(r1.ok, r1.err);
  const r2 = api.apply(doctorId, "po_1", { summary: "テスト行程" });
  assert.equal(r2.ok, undefined);
  assert.match(r2.err, /すでに手を挙げています/);
});

test("同一医師は日時が重複する別の募集に手を挙げられない（ダブルブッキング防止）", async () => {
  const store = loadStore();
  const { api } = store;
  const doctorId = await makeApprovedDoctor(store, "テスト医師A", "700001");

  const poA = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-01", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000,
    lodging:"", ground:"", note:"",
  });
  assert.ok(poA.ok);

  // 同日・時間帯が重なる別病院の募集
  const poB = api.publishPosting("hp_2", {
    urgent:false, date:"2026-08-01", timeStart:"10:00", timeEnd:"15:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:90000,
    lodging:"", ground:"", note:"",
  });
  assert.ok(poB.ok);

  const applyA = api.apply(doctorId, poA.id, { summary: "行程A" });
  assert.ok(applyA.ok, applyA.err);

  const applyB = api.apply(doctorId, poB.id, { summary: "行程B" });
  assert.equal(applyB.ok, undefined);
  assert.match(applyB.err, /同じ日時に他の予定/);
});

test("日時が重複しない別の募集には問題なく手を挙げられる", async () => {
  const store = loadStore();
  const { api } = store;
  const doctorId = await makeApprovedDoctor(store, "テスト医師B", "700002");

  const poA = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-01", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });
  const poC = api.publishPosting("hp_2", {
    urgent:false, date:"2026-08-03", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });

  assert.ok(api.apply(doctorId, poA.id, { summary: "行程A" }).ok);
  const r = api.apply(doctorId, poC.id, { summary: "行程C" });
  assert.ok(r.ok, r.err);
});

test("承認時にも日時重複を再検証し、確定済みの予定と重なる承認は拒否する", async () => {
  const store = loadStore();
  const { api, getDB } = store;
  const doctorId = await makeApprovedDoctor(store, "テスト医師C", "700003");

  const poA = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-05", timeStart:"09:00", timeEnd:"17:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });
  const poD = api.publishPosting("hp_2", {
    urgent:false, date:"2026-08-05", timeStart:"12:00", timeEnd:"18:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });

  const applyA = api.apply(doctorId, poA.id, { summary: "行程A" });
  assert.ok(applyA.ok, applyA.err);
  const approveA = api.approve("hp_1", applyA.id);
  assert.ok(approveA.ok, approveA.err);

  // 通常のapply()経路では重複はブロックされるため、データ異常/競合を模して
  // 「応募中」の重複レコードを直接投入し、approve()側の再検証が効くことを確認する
  const db = getDB();
  const bogusAppId = "ap_bogus_1";
  db.applications.push({ id: bogusAppId, postingId: poD.id, doctorId, status: "applied", appliedAt: "", itinerary: { summary: "行程D" } });

  const approveD = api.approve("hp_2", bogusAppId);
  assert.equal(approveD.ok, undefined);
  assert.match(approveD.err, /重複するため承認できません/);

  const poDAfter = db.postings.find(p => p.id === poD.id);
  assert.equal(poDAfter.status, "open");
  assert.equal(db.assignments.some(a => a.postingId === poD.id), false);
});

test("1つの募集が確定すると、他の応募者は自動的に見送りになり以降は承認できない（1募集1医師の強制）", async () => {
  const store = loadStore();
  const { api, getDB } = store;
  const doctor1 = await makeApprovedDoctor(store, "テスト医師D", "700004");
  const doctor2 = await makeApprovedDoctor(store, "テスト医師E", "700005");

  const poE = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-10", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });

  const app1 = api.apply(doctor1, poE.id, { summary: "行程1" });
  const app2 = api.apply(doctor2, poE.id, { summary: "行程2" });
  assert.ok(app1.ok, app1.err);
  assert.ok(app2.ok, app2.err);

  const approve1 = api.approve("hp_1", app1.id);
  assert.ok(approve1.ok, approve1.err);

  const db = getDB();
  const decidedApp2 = db.applications.find(a => a.id === app2.id);
  assert.equal(decidedApp2.status, "declined");

  const approve2 = api.approve("hp_1", app2.id);
  assert.equal(approve2.ok, undefined);
  assert.match(approve2.err, /承認できない状態です/);

  const postingE = db.postings.find(p => p.id === poE.id);
  assert.equal(postingE.status, "confirmed");
  assert.equal(db.assignments.filter(a => a.postingId === poE.id).length, 1);
});
