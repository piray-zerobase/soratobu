/* =========================================================
   store.test.mjs — ダブルブッキング防止・状態遷移の単体テスト
   実行方法: node --test
   ========================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadStore } from "./helpers/loadStore.mjs";

/* 運営(admin)ユーザーを1人作って userId を返す */
async function makeAdmin(store, email){
  const { auth } = store;
  await auth.signup(email, "demo1234", "admin");
  return auth.session.userId;
}

/* 既存の病院（hospitalId）に紐づくユーザーを1人作って userId を返す（seed済み病院はensureSeedUsers未実行のためテストではDBを直接操作） */
async function makeHospitalUser(store, email, hospitalId){
  const { auth, saveDB, getDB } = store;
  await auth.signup(email, "demo1234", "hospital");
  const user = getDB().users.find(u=>u.id===auth.session.userId);
  user.refId = hospitalId; auth.session.refId = hospitalId;
  saveDB();
  return user.id;
}

/* 承認済みの新規医師を1人作って返す（保険医登録が絡まないよう医師免許のみのケース） */
async function makeApprovedDoctor(store, name, licenseNo){
  const { api, auth } = store;
  const adminId = await makeAdmin(store, `admin_${licenseNo}@example.com`);
  await auth.signup(`${licenseNo}@example.com`, "demo1234", "doctor");
  const reg = api.registerDoctor(auth.session.userId, {
    name, specialties:["総合診療"], capabilities:["外来応援"], homeBase:"ITM", licenseNo, files:{},
  });
  assert.ok(reg.ok, reg.err);
  api.verifyDoctor(adminId, reg.id, true);
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

test("他院の応募はdecline/completeできない（権限チェック）", async () => {
  const store = loadStore();
  const { api } = store;
  const doctorId = await makeApprovedDoctor(store, "テスト医師F", "700006");

  const poF = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-15", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });
  const appF = api.apply(doctorId, poF.id, { summary: "行程F" });
  assert.ok(appF.ok, appF.err);

  const declineOther = api.decline("hp_2", appF.id);
  assert.equal(declineOther.ok, undefined);
  assert.match(declineOther.err, /自院の募集ではありません/);

  const approveF = api.approve("hp_1", appF.id);
  assert.ok(approveF.ok, approveF.err);

  const completeOther = api.complete("hp_2", approveF.id);
  assert.equal(completeOther.ok, undefined);
  assert.match(completeOther.err, /自院の勤務ではありません/);

  const completeOwn = api.complete("hp_1", approveF.id);
  assert.ok(completeOwn.ok, completeOwn.err);
});

test("応募の当事者でない者はチャットに送信できない（なりすまし防止）", async () => {
  const store = loadStore();
  const { api } = store;
  const doctor1 = await makeApprovedDoctor(store, "テスト医師G", "700007");
  const doctor2 = await makeApprovedDoctor(store, "テスト医師H", "700008");

  const poG = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-16", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });
  const appG = api.apply(doctor1, poG.id, { summary: "行程G" });
  assert.ok(appG.ok, appG.err);

  const spoof = api.sendMessage(appG.id, "doctor", doctor2, "なりすましメッセージ");
  assert.equal(spoof.ok, undefined);
  assert.match(spoof.err, /当事者ではありません/);

  const hospSpoof = api.sendMessage(appG.id, "hospital", "hp_2", "他院からのなりすまし");
  assert.equal(hospSpoof.ok, undefined);
  assert.match(hospSpoof.err, /当事者ではありません/);

  const ok = api.sendMessage(appG.id, "doctor", doctor1, "本人からの正当なメッセージ");
  assert.ok(ok.ok, ok.err);
});

test("病院ユーザーは招待コードで同じ病院に参加できる（HospitalUser相当）", async () => {
  const store = loadStore();
  const { api, auth, getDB } = store;
  const db = getDB();
  const inviteCode = db.hospitals.find(h=>h.id==="hp_1").inviteCode;

  await auth.signup("staff2@example.com", "demo1234", "hospital");
  const staffUserId = auth.session.userId;

  const r = api.joinHospitalByInviteCode(staffUserId, inviteCode.toLowerCase());
  assert.ok(r.ok, r.err);
  assert.equal(r.hospitalId, "hp_1");

  const staffUser = db.users.find(u=>u.id===staffUserId);
  assert.equal(staffUser.refId, "hp_1");

  // 2人目のスタッフも同じ病院の募集を承認できる（同じhospitalIdとして扱われる）
  const doctorId = await makeApprovedDoctor(store, "テスト医師J", "700010");
  const poJ = api.publishPosting("hp_1", {
    urgent:false, date:"2026-08-20", timeStart:"09:00", timeEnd:"12:00", overnight:false,
    type:"外来応援", cls:"b-gairai", department:"内科", pay:80000, lodging:"", ground:"", note:"",
  });
  const appJ = api.apply(doctorId, poJ.id, { summary: "行程J" });
  assert.ok(appJ.ok, appJ.err);
  const approveJ = api.approve("hp_1", appJ.id);
  assert.ok(approveJ.ok, approveJ.err);
});

test("招待コードが誤っている、または医師・二重所属では参加できない", async () => {
  const store = loadStore();
  const { api, auth } = store;

  await auth.signup("staff3@example.com", "demo1234", "hospital");
  const r1 = api.joinHospitalByInviteCode(auth.session.userId, "NOSUCHCODE");
  assert.equal(r1.ok, undefined);
  assert.match(r1.err, /招待コードが正しくありません/);

  await auth.signup("staff4@example.com", "demo1234", "doctor");
  const r2 = api.joinHospitalByInviteCode(auth.session.userId, "ANYCODE1");
  assert.equal(r2.ok, undefined);
  assert.match(r2.err, /権限がありません/);

  // すでにhp_1に紐づく既存ユーザーは別の病院に参加できない
  const existingStaffId = await makeHospitalUser(store, "staff5@example.com", "hp_1");
  const r3 = api.joinHospitalByInviteCode(existingStaffId, "ANYCODE1");
  assert.equal(r3.ok, undefined);
  assert.match(r3.err, /すでにいずれかの病院に所属しています/);
});

test("招待コードは病院担当者のみ再発行でき、再発行すると古いコードは無効になる", async () => {
  const store = loadStore();
  const { api, auth, getDB } = store;
  const db = getDB();
  const oldCode = db.hospitals.find(h=>h.id==="hp_2").inviteCode;
  const staffId = await makeHospitalUser(store, "staff6@example.com", "hp_2");

  const r = api.regenerateInviteCode(staffId);
  assert.ok(r.ok, r.err);
  assert.notEqual(r.inviteCode, oldCode);
  assert.equal(db.hospitals.find(h=>h.id==="hp_2").inviteCode, r.inviteCode);

  // 医師ロールは再発行できない
  await auth.signup("staff7@example.com", "demo1234", "doctor");
  const staleAttempt = api.regenerateInviteCode(auth.session.userId);
  assert.equal(staleAttempt.ok, undefined);
  assert.match(staleAttempt.err, /権限がありません/);

  // 再発行後は古いコードでの参加は失敗する
  await auth.signup("staff8@example.com", "demo1234", "hospital");
  const rejoin = api.joinHospitalByInviteCode(auth.session.userId, oldCode);
  assert.equal(rejoin.ok, undefined);
  assert.match(rejoin.err, /招待コードが正しくありません/);
});

test("admin以外は実在確認（verifyDoctor/verifyHospital/verifyCredential）を実行できない", async () => {
  const store = loadStore();
  const { api, auth } = store;
  await auth.signup("notadmin@example.com", "demo1234", "hospital");
  const nonAdminId = auth.session.userId;

  await auth.signup("d700009@example.com", "demo1234", "doctor");
  const reg = api.registerDoctor(auth.session.userId, {
    name:"テスト医師I", specialties:["総合診療"], capabilities:["外来応援"], homeBase:"ITM", licenseNo:"700009", files:{},
  });
  assert.ok(reg.ok, reg.err);

  const r1 = api.verifyDoctor(nonAdminId, reg.id, true);
  assert.equal(r1.ok, undefined);
  assert.match(r1.err, /権限がありません/);

  const r2 = api.verifyHospital(nonAdminId, "hp_1", true);
  assert.equal(r2.ok, undefined);
  assert.match(r2.err, /権限がありません/);

  const r3 = api.verifyCredential(nonAdminId, reg.id, "医師免許", true);
  assert.equal(r3.ok, undefined);
  assert.match(r3.err, /権限がありません/);
});
